import io
import os
import re
import sys
import json
import tempfile
import requests
import openpyxl
from datetime import date, datetime, time, timedelta
from urllib.parse import urlparse, parse_qs

# ==============================================================================
# PIPELINE DESIGN (Comment-Driven Development Blueprint)
# ==============================================================================
# phase 1: download excel sheet file into memory and read it
#          (optional: pass a local .xlsx path as argv[1] for offline runs)
# phase 2: make a master list to store projects from all sheets
# Phase 3: loop through each sheet and
    # 3a: skip sheets with "CLUSTER" or "LC X" in their name
    # 3b: scan rows with whitespace-normalized search to find header row
    #     (exact anchor cells "OPPORTUNITY LINK" + "PROJECT", never substrings)
    # 3c: if there is no header row skip it
    # 3d: loop through data rows (same single pass over the sheet)
        # - stop if reached "OUR EXPERIENCES" or "CURRENT STATE" section
        # - skip empty rows
        # - convert datetime/date/time/timedelta cells to strings so JSON never crashes
        # - recover hidden hyperlink targets behind link cells that display page titles
        # - skip closed projects with "no slots now"
        # - clean google redirect links, fees, duration, and resolve SDGs
        # - keep valid projects (has title OR has link) and tag with country name
    # 3e: add the sheet's projects to the master list
# phase 4: atomically save the data to frontend/src/data/projects.json using default=str
#          (refuse to overwrite the existing file with an empty extraction)
# ==============================================================================

# ID of the public spreadsheet
SHEET_ID = "10Fb0P3NT3sjRtycyCM-_85xWVa1oavWTfCVddh-6bwY"

# export Google Sheet as xlsx file
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

# target path for the React frontend (resolved from the repo root, independent of CWD)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(REPO_ROOT, "frontend", "src", "data", "projects.json")

# exact (normalized) header cells that identify the opportunities table
HEADER_ANCHORS = ("OPPORTUNITY LINK", "PROJECT")

# section titles that close the opportunities table (participant logs follow)
SENTINELS = ("OUR EXPERIENCES", "CURRENT STATE")

# spelling variants across LC tabs collapsed onto one canonical key for the TS contract
HEADER_ALIASES = {
    "ACCOMODATION": "ACCOMMODATION",
    "TIMELINE OPEN": "TIMELINE",
}

# columns whose cells may hide the real URL behind a hyperlink with a display title
LINK_COLUMNS = ("OPPORTUNITY LINK", "BOOKLET")

# map canonical project names to UN SDG numbers when sheets leave SDG blank
SDG_MAP = {
    "GREEN LEADERS": 13,
    "ROOTED": 15,
    "EQUIFY": 10,
    "FINGERPRINT": 4,
    "GLOBAL CLASSROOM": 4,
    "HEARTBEAT": 3,
    "SCALE UP": 17,
    "SCALE UP!": 17,
    "ON THE MAP": 8,
    "SKILL UP": 8,
    "SKILL UP!": 8,
    "AQUATICA": 14,
    "YOUTH 4 IMPACT": 4,
    "DISCOVER": 4,
    "RAISE YOUR VOICE": 5,
    "HAPPY BUS": 4,
    "EAT 4 CHANGE": 12,
    "EXPLORER": 15,
}

# longest names first so "SCALE UP!" wins over "SCALE UP" during substring fallback
SDG_KEYS_BY_LENGTH = sorted(SDG_MAP, key=len, reverse=True)

# primary week count, tolerating compound "6/4 weeks" and short "6w" / "6 wks" forms;
# the trailing \b stops "2026 with" from being read as 2026 weeks
WEEKS_PATTERN = re.compile(r"(\d+)(?:\s*/\s*\d+)?\s*(?:weeks?|wks?|w)\b", re.IGNORECASE)

# explicit realization window such as "13 Jul - 24 Aug" or "3 August - 14 September"
DATE_RANGE_PATTERN = re.compile(
    r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\.?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*",
    re.IGNORECASE,
)

MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

# plausibility bounds for a Global Volunteer realization length
MIN_WEEKS, MAX_WEEKS = 1, 52

# tokens / phrases meaning "not provided" or "unconfirmed" in logistics cells
NEGATIVE_TOKENS = {"", "NONE", "NO", "FALSE", "N/A", "NA", "-", ".", "?", "0", "TBD", "TBC"}
NEGATIVE_PHRASES = ("NOT PROVIDED", "NOT COVERED", "NOT INCLUDED", "TO BE CHECKED", "TO BE CONFIRMED")


# ==============================================================================
# DECOUPLED SANITIZATION HELPERS
# ==============================================================================

def normalize_text(val):
    # normalizes newlines, non-breaking spaces (\xa0), tabs, and extra spaces
    if val is None:
        return ""
    return " ".join(str(val).replace("\xa0", " ").split()).strip().upper()


def canonical_header(val):
    # normalized header name with spelling aliases collapsed, or None for blank header cells
    name = normalize_text(val)
    if not name:
        return None
    return HEADER_ALIASES.get(name, name)


def is_header_row(cells):
    # exact anchor-cell match; substring matching misfires on rows like "LINK" / "Project Manager"
    normalized = {normalize_text(c) for c in cells}
    return all(anchor in normalized for anchor in HEADER_ANCHORS)


def is_sentinel_row(cells):
    # a cell that opens the participant log section terminates the opportunities table
    for c in cells:
        text = normalize_text(c)
        if text and any(text.startswith(s) for s in SENTINELS):
            return True
    return False


def to_json_safe(value):
    # openpyxl yields date/datetime/time/timedelta for date-formatted cells; stringify them
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def find_field(record, *keywords):
    # flexible dictionary getter: exact header match first, then substring match
    for kw in keywords:
        if kw in record:
            return record[kw]
    for key, val in record.items():
        if key and any(kw in key for kw in keywords):
            return val
    return None


def clean_url(raw_url):
    # unwrap google redirect links and reject plain text that is not a valid URL
    if not raw_url:
        return None
    url_str = str(raw_url).strip()
    if "google.com/url" in url_str:
        params = parse_qs(urlparse(url_str).query)
        url_str = params.get("q", [url_str])[0]

    match = re.search(r"(https?://[^\s)\"'>]+)", url_str)
    return match.group(1) if match else None


def clean_fee(raw_fee):
    # extract numeric float from messy strings like "75 EUR", "104,20€", "92.17 EUR", "190-450$"
    if raw_fee is None or isinstance(raw_fee, bool):
        return None
    if isinstance(raw_fee, (int, float)):
        return round(float(raw_fee), 2) if raw_fee >= 0 else None
    match = re.search(r"(\d+(?:[.,]\d+)?)", str(raw_fee))
    if match:
        return round(float(match.group(1).replace(",", ".")), 2)
    return None


def weeks_from_date_range(text):
    # "13 Jul - 24 Aug" -> 6; year-agnostic (non-leap reference year, wraps over new year)
    match = DATE_RANGE_PATTERN.search(text)
    if not match:
        return None
    d1, m1, d2, m2 = match.groups()
    month_1, month_2 = MONTHS.get(m1.upper()), MONTHS.get(m2.upper())
    if month_1 is None or month_2 is None:
        return None
    try:
        start = date(2001, month_1, int(d1))
        end = date(2001, month_2, int(d2))
    except ValueError:
        return None
    if end < start:
        end = end.replace(year=2002)
    weeks = round((end - start).days / 7)
    return weeks if MIN_WEEKS <= weeks <= MAX_WEEKS else None


def clean_duration(raw_duration, raw_timeline=None):
    # extract primary integer weeks from "6 weeks", "6/4 weeks", "13 Jul - 24 Aug", or timeline fallback
    # priority: explicit weeks in DURATION -> date range in DURATION -> explicit weeks in TIMELINE
    candidates = []
    if raw_duration is not None and not isinstance(raw_duration, bool):
        if isinstance(raw_duration, (int, float)):
            candidates.append(("number", raw_duration))
        else:
            candidates.append(("weeks", str(raw_duration)))
            candidates.append(("range", str(raw_duration)))
    if raw_timeline is not None and not isinstance(raw_timeline, bool):
        candidates.append(("weeks", str(raw_timeline)))

    for kind, source in candidates:
        if kind == "number":
            weeks = int(source)
        elif kind == "weeks":
            match = WEEKS_PATTERN.search(source)
            weeks = int(match.group(1)) if match else None
        else:
            weeks = weeks_from_date_range(source)
        if weeks is not None and MIN_WEEKS <= weeks <= MAX_WEEKS:
            return weeks
    return None


def clean_bool(raw_val):
    # standardize "Yes", "host families", "dorms of the NGO" -> True; "no", "not provided" -> False
    if raw_val is None:
        return False
    if isinstance(raw_val, bool):
        return raw_val
    if isinstance(raw_val, (int, float)):
        return raw_val > 0
    val_str = normalize_text(raw_val)
    if val_str in NEGATIVE_TOKENS:
        return False
    if re.match(r"(?:NO|NOT)\b", val_str):
        return False
    if any(phrase in val_str for phrase in NEGATIVE_PHRASES):
        return False
    return True


def resolve_sdg(raw_sdg, project_name):
    # extract integer SDG (1-17) from cell or fallback to SDG_MAP using project title
    if raw_sdg is not None and not isinstance(raw_sdg, bool):
        match = re.search(r"\d+", str(raw_sdg))
        if match and 1 <= int(match.group(0)) <= 17:
            return int(match.group(0))
    cleaned_title = normalize_text(project_name)
    if not cleaned_title:
        return None
    if cleaned_title in SDG_MAP:
        return SDG_MAP[cleaned_title]
    # decorated titles such as "Global Classroom - Teaching English"
    for name in SDG_KEYS_BY_LENGTH:
        if name in cleaned_title:
            return SDG_MAP[name]
    return None


def write_json_atomic(data, path):
    # write to a temp file in the target directory, fsync, then os.replace (atomic on POSIX)
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".projects.", suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            # default=str guarantees datetime/custom objects serialize safely
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp_path, 0o644)
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


# ==============================================================================
# MAIN ETL ORCHESTRATION
# ==============================================================================

def main():
    # --- PHASE 1: download excel sheet file into memory and read it ---
    if len(sys.argv) > 1:
        print(f"Loading local workbook {sys.argv[1]}...")
        with open(sys.argv[1], "rb") as f:
            excel = io.BytesIO(f.read())
    else:
        print("Connecting to Google Sheets...")
        response = requests.get(EXPORT_URL, timeout=30)

        # check the response status code for errors (non-zero exit fails CI loudly)
        if response.status_code != 200:
            print(f"Failed to download sheet. Status code: {response.status_code}")
            sys.exit(1)

        print("Download complete. Parsing workbook in memory...")
        excel = io.BytesIO(response.content)

    # non read-only mode is required: read-only worksheets do not expose cell.hyperlink
    wb = openpyxl.load_workbook(excel, data_only=True)

    # --- PHASE 2: make a master list to store projects from all sheets ---
    all_projects = []

    # --- PHASE 3: loop through each sheet ---
    for sheet in wb.worksheets:
        sheet_name = sheet.title.strip()

        # 3a: skip sheets with "CLUSTER" or "LC X" in their name
        if "CLUSTER" in sheet_name.upper() or "LC X" in sheet_name.upper():
            continue

        header_row = None
        header_row_index = None
        projects = []

        # single O(rows x cols) pass: header scan, then data rows until the sentinel
        for row_index, row_cells in enumerate(sheet.iter_rows(), start=1):
            row = [cell.value for cell in row_cells]

            # 3b: scan rows using normalized whitespace to find header row
            if header_row is None:
                if is_header_row(row):
                    header_row = [canonical_header(col) for col in row]
                    header_row_index = row_index
                continue

            # 3d: loop through data rows
            # stop if reached "OUR EXPERIENCES" or "CURRENT STATE" section
            if is_sentinel_row(row):
                break

            # skip empty rows (whitespace-only cells count as empty)
            if not any(normalize_text(c) for c in row):
                continue

            # combine the header row to data and convert datetime objects to ISO strings
            project = {}
            link_targets = {}
            for col_name, cell, cell_value in zip(header_row, row_cells, row):
                if col_name is None or col_name in project:
                    continue
                project[col_name] = to_json_safe(cell_value)
                if col_name in LINK_COLUMNS:
                    hyperlink = getattr(cell, "hyperlink", None)
                    link_targets[col_name] = hyperlink.target if hyperlink is not None else None

            # skip closed projects marked with "no slots now"
            timeline_val = find_field(project, "TIMELINE")
            timeline_str = str(timeline_val or "").lower()
            extra_info_str = str(find_field(project, "EXTRA INFO") or "").lower()
            if "no slots now" in timeline_str or "no slots now" in extra_info_str:
                continue

            # clean link and title; fall back to the hidden hyperlink target behind display titles
            raw_link_val = find_field(project, "OPPORTUNITY LINK", "LINK")
            cleaned_link = clean_url(raw_link_val) or clean_url(link_targets.get("OPPORTUNITY LINK"))

            raw_title_val = find_field(project, "PROJECT")
            raw_title = str(raw_title_val or "").strip()

            has_title = raw_title != "" and raw_title.upper() != "NONE"
            has_link = cleaned_link is not None

            # keep valid projects (either has a title OR has a valid link)
            if has_title or has_link:
                final_title = raw_title if has_title else "Global Volunteer Opportunity"

                raw_sdg_val = find_field(project, "SDG")
                raw_fee_val = find_field(project, "FEE", "COST")
                raw_duration_val = find_field(project, "DURATION")
                raw_booklet_val = find_field(project, "BOOKLET")
                raw_accomm_val = find_field(project, "ACCOMMOD", "ACCOMOD")

                # enrich and normalize fields for the React frontend contract
                project["ID"] = f"{sheet_name}_{row_index}"
                project["COUNTRY"] = sheet_name
                project["PROJECT"] = final_title
                project["OPPORTUNITY LINK"] = cleaned_link
                project["BOOKLET"] = clean_url(raw_booklet_val) or clean_url(link_targets.get("BOOKLET"))
                project["SDG"] = resolve_sdg(raw_sdg_val, final_title)
                project["FEE_NUMERIC"] = clean_fee(raw_fee_val)
                project["DURATION_WEEKS"] = clean_duration(raw_duration_val, timeline_val)
                project["ACCOMMODATION_BOOL"] = clean_bool(raw_accomm_val)

                projects.append(project)

        # 3c: if there is no header row skip it
        if header_row is None:
            continue

        # 3e: add the sheet's projects to the master list
        all_projects.extend(projects)
        print(f"[{sheet_name}] Extracted {len(projects)} projects")

    # --- PHASE 4: save the data to a json file ---
    # an empty extraction almost always means a layout change upstream; keep the last good file
    if not all_projects:
        print("\nERROR: 0 projects extracted. Refusing to overwrite existing JSON.")
        sys.exit(1)

    write_json_atomic(all_projects, OUTPUT_PATH)
    print(f"\nDone! Saved {len(all_projects)} total projects to {os.path.relpath(OUTPUT_PATH, REPO_ROOT)}")


if __name__ == "__main__":
    main()