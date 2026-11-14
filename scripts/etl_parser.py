import io
import json
import os
import re
import sys
from datetime import date, datetime
from urllib.parse import parse_qs, urlparse

import openpyxl
import requests

# ==============================================================================
# THE PLAN
# ==============================================================================
# phase 1: download the google sheet as an excel file into memory and open it
#          (or pass a local .xlsx path as the first argument to work offline)
# phase 2: make a master list to store projects from all sheets
# phase 3: loop through each sheet and
#     3a: skip sheets with "CLUSTER" or "LC X" in their name
#     3b: find the header row (the row with "PROJECT" and "OPPORTUNITY LINK")
#     3c: if there is no header row skip the sheet
#     3d: loop through the rows under the header
#         - stop at "OUR EXPERIENCES" or "CURRENT STATE" (private student notes)
#         - skip empty rows and closed projects ("no slots now")
#         - clean the link, fee, currency, duration, housing and SDG
#         - keep the row if it has a title or a link
#     3e: add the sheet's projects to the master list
# phase 4: save the master list to frontend/src/data/projects.json
# ==============================================================================

# id of the public google sheet (the long part of its url)
SHEET_ID = "10Fb0P3NT3sjRtycyCM-_85xWVa1oavWTfCVddh-6bwY"

# google can export any sheet as an excel file with this url
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"

# where the website reads its data from. the path is built from this file's
# location so the script works no matter which folder you run it from
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(REPO_ROOT, "frontend", "src", "data", "projects.json")

# a few sheets spell these two columns differently, so we rename them to match the rest
HEADER_FIXES = {
    "ACCOMODATION": "ACCOMMODATION",
    "TIMELINE OPEN": "TIMELINE",
}

# every AIESEC project name belongs to one UN goal (SDG).
# we use this when the SDG cell in the sheet is empty
SDG_MAP = {
    "GREEN LEADERS": 13,
    "ROOTED": 15,
    "EQUIFY": 10,
    "FINGERPRINT": 4,
    "GLOBAL CLASSROOM": 4,
    "HEARTBEAT": 3,
    "SCALE UP": 17,
    "ON THE MAP": 8,
    "SKILL UP": 8,
    "AQUATICA": 14,
    "YOUTH 4 IMPACT": 4,
    "DISCOVER": 4,
    "RAISE YOUR VOICE": 5,
    "HAPPY BUS": 4,
    "EAT 4 CHANGE": 12,
    "EXPLORER": 15,
}

MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

# a housing cell that is exactly one of these means "no" or "we don't know yet"
NO_WORDS = {"", "NO", "NONE", "FALSE", "N/A", "NA", "-", ".", "?", "0", "TBD", "TBC"}

# a housing cell with one of these anywhere in it also means "no"
NO_PHRASES = ("NOT PROVIDED", "NOT COVERED", "NOT INCLUDED", "TO BE CHECKED", "TO BE CONFIRMED")


# ==============================================================================
# HELPER FUNCTIONS
# each one takes a raw cell value and returns a clean one. they don't touch
# files or the internet, so they are easy to test (see tests/test_etl_parser.py)
# ==============================================================================

def clean_text(value):
    # "Opportunity\nLink " -> "OPPORTUNITY LINK"
    # cells often have line breaks and extra spaces, so we squash every gap
    # into one space and uppercase the text before comparing it with anything
    if value is None:
        return ""
    return " ".join(str(value).split()).upper()


def clean_url(raw_url):
    # returns a real http link, or None if the cell has no link in it
    if not raw_url:
        return None
    text = str(raw_url).strip()

    # google wraps pasted links like "https://www.google.com/url?q=REAL_LINK&sa=D"
    # so we take the real link back out of the "q" part
    if "google.com/url" in text:
        query = parse_qs(urlparse(text).query)
        text = query.get("q", [text])[0]

    # pick the link out of the text. cells like "Booklet.pdf" have none
    match = re.search(r"(https?://[^\s)\"'>]+)", text)
    if match is None:
        return None
    return match.group(1)


def clean_fee(raw_fee):
    # "75 EUR" -> 75.0, "104,20€" -> 104.2, "190-450$" -> 190.0, "no" -> None
    if raw_fee is None:
        return None

    # find the first number in the cell, with an optional decimal part
    match = re.search(r"(\d+(?:[.,]\d+)?)", str(raw_fee))
    if match is None:
        return None

    # some people type "104,20" with a comma, but python only understands "104.20"
    return round(float(match.group(1).replace(",", ".")), 2)


def clean_currency(raw_fee):
    # "57$" -> "USD", "75 EUR" -> "EUR", 104.2 -> "EUR", "no" -> None
    # a cell without a fee has no currency either
    if clean_fee(raw_fee) is None:
        return None

    # a few tabs give their fee in dollars, and they always mark it with "$" or "USD"
    text = str(raw_fee).upper()
    if "$" in text or "USD" in text:
        return "USD"

    # everything else is euros, also when only the number is written
    return "EUR"


def weeks_from_text(text):
    # "6 weeks" -> 6, "6/4 weeks" -> 6 (the first number is the normal length)
    match = re.search(r"(\d+)(?:\s*/\s*\d+)?\s*weeks?", str(text or ""), re.IGNORECASE)
    if match is None:
        return None
    return int(match.group(1))


def weeks_from_dates(text):
    # "13 Jul - 24 Aug" -> 6. we count the days between the two dates and divide by 7
    match = re.search(
        r"(\d{1,2})\s+([a-z]{3})[a-z]*\s*[-–]\s*(\d{1,2})\s+([a-z]{3})",
        str(text or ""),
        re.IGNORECASE,
    )
    if match is None:
        return None

    start_day, start_month, end_day, end_month = match.groups()
    start_month = MONTHS.get(start_month.upper())
    end_month = MONTHS.get(end_month.upper())
    if start_month is None or end_month is None:
        return None

    # the sheet never writes the year, so we use the same year (2001) for both dates
    try:
        start = date(2001, start_month, int(start_day))
        end = date(2001, end_month, int(end_day))
    except ValueError:
        # an impossible date like "31 Feb"
        return None

    # "15 Dec - 26 Jan" crosses new year, so the end date is in the next year
    if end < start:
        end = end.replace(year=2002)

    return round((end - start).days / 7)


def clean_duration(raw_duration, raw_timeline=None):
    # returns the project length in weeks, or None if the sheet doesn't say
    # we make a list of guesses, starting with the one we trust the most
    if isinstance(raw_duration, (int, float)):
        # the cell is just a number like 6
        guesses = [int(raw_duration)]
    else:
        guesses = [
            weeks_from_text(raw_duration),   # "6 weeks" or "6/4 weeks"
            weeks_from_dates(raw_duration),  # "13 Jul - 24 Aug"
        ]

    # some sheets leave DURATION empty and write "6 weeks" in TIMELINE instead
    guesses.append(weeks_from_text(raw_timeline))

    # a volunteer project lasts 1 to 52 weeks, so we ignore typos like 0 or 99
    for weeks in guesses:
        if weeks is not None and 1 <= weeks <= 52:
            return weeks
    return None


def clean_bool(raw_value):
    # turns the housing cell into True / False
    # "Yes", "host families", "dorms of the NGO" -> True
    # "no", "not provided", "?", empty cell -> False
    if isinstance(raw_value, (int, float)):
        return raw_value > 0

    text = clean_text(raw_value)
    if text in NO_WORDS:
        return False

    # starts with the word NO or NOT, like "no, you find your own place"
    if re.match(r"(NO|NOT)\b", text):
        return False

    for phrase in NO_PHRASES:
        if phrase in text:
            return False

    # anything else describes a place to stay, so we count it as a yes
    return True


def resolve_sdg(raw_sdg, project_name):
    # returns the UN goal number (1 to 17), or None if we can't tell
    # first choice: the number written in the SDG cell (4, 4.0 or "SDG 13")
    match = re.search(r"\d+", str(raw_sdg))
    if match and 1 <= int(match.group()) <= 17:
        return int(match.group())

    # the cell is empty or wrong, so we guess from the project name.
    # "in" also catches longer titles like "Global Classroom - Teaching English"
    title = clean_text(project_name)
    for name, sdg in SDG_MAP.items():
        if name in title:
            return sdg
    return None


# ==============================================================================
# MAIN SCRIPT
# ==============================================================================

def main():
    # phase 1: download the excel file into memory and open it
    # data_only=True gives us the result of a formula cell, not the formula itself
    if len(sys.argv) > 1:
        print(f"Reading local file {sys.argv[1]}...")
        workbook = openpyxl.load_workbook(sys.argv[1], data_only=True)
    else:
        print("Downloading the Google Sheet...")
        response = requests.get(EXPORT_URL, timeout=30)

        # stop with an error so the GitHub Action fails instead of saving nothing
        if response.status_code != 200:
            print(f"Download failed. Status code: {response.status_code}")
            sys.exit(1)

        # BytesIO lets openpyxl read the downloaded bytes like a file,
        # so we never have to save the .xlsx to disk
        workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)

    # phase 2: make a master list to store projects from all sheets
    all_projects = []

    # phase 3: loop through each sheet (one sheet = one partner city)
    for sheet in workbook.worksheets:
        sheet_name = sheet.title.strip()

        # 3a: skip the summary sheets, they don't have a project table
        if "CLUSTER" in sheet_name.upper() or "LC X" in sheet_name.upper():
            continue

        # 3b: find the header row. the table starts on a different row in
        # every sheet, so we look for the row that has both of these cells
        rows = list(sheet.iter_rows())
        header = None
        header_position = 0
        for position, row in enumerate(rows):
            names = [clean_text(cell.value) for cell in row]
            if "PROJECT" in names and "OPPORTUNITY LINK" in names:
                header = [HEADER_FIXES.get(name, name) for name in names]
                header_position = position
                break

        # 3c: if there is no header row skip the sheet
        if header is None:
            continue

        # 3d: loop through the rows under the header
        projects = []
        for row in rows[header_position + 1:]:
            texts = [clean_text(cell.value) for cell in row]

            # stop at the "OUR EXPERIENCES" / "CURRENT STATE" section. below it
            # are notes about students who already went abroad, and those are private
            if any(text.startswith(("OUR EXPERIENCES", "CURRENT STATE")) for text in texts):
                break

            # skip empty rows
            if not any(texts):
                continue

            # pair every cell with its column name, like {"PROJECT": "Equify", "FEE": "75 EUR"}
            project = {}
            for name, cell in zip(header, row):
                # skip columns without a name, and repeated column names
                if name == "" or name in project:
                    continue
                value = cell.value

                # excel gives date cells back as datetime objects, so save them as text
                if isinstance(value, datetime):
                    value = value.isoformat()

                # trim spaces, and treat a cell with only spaces as empty
                if isinstance(value, str):
                    value = value.strip() or None

                # some editors pasted a link inside text, so the cell shows a title
                # like "Booklet.pdf" and the real url is hidden behind it.
                # if the text we see is not a link, we take the hidden one
                if name in ("OPPORTUNITY LINK", "BOOKLET") and cell.hyperlink and clean_url(value) is None:
                    value = cell.hyperlink.target

                project[name] = value

            # skip closed projects marked with "no slots now"
            timeline = str(project.get("TIMELINE") or "").lower()
            extra_info = str(project.get("EXTRA INFO") or "").lower()
            if "no slots now" in timeline or "no slots now" in extra_info:
                continue

            # keep the row only if it has a title or a link.
            # a row with neither is a leftover note, not a project
            title = str(project.get("PROJECT") or "").strip()
            link = clean_url(project.get("OPPORTUNITY LINK"))
            if not title and not link:
                continue

            # a project with a link but no name still gets a card on the website
            if not title:
                title = "Global Volunteer Opportunity"

            # add the cleaned fields that the website filters and sorts by.
            # row[0].row is the real row number in the sheet, so every ID is unique
            project["ID"] = f"{sheet_name}_{row[0].row}"
            project["COUNTRY"] = sheet_name
            project["PROJECT"] = title
            project["OPPORTUNITY LINK"] = link
            project["BOOKLET"] = clean_url(project.get("BOOKLET"))
            project["SDG"] = resolve_sdg(project.get("SDG"), title)
            project["FEE_NUMERIC"] = clean_fee(project.get("FEE"))
            project["FEE_CURRENCY"] = clean_currency(project.get("FEE"))
            project["DURATION_WEEKS"] = clean_duration(project.get("DURATION"), project.get("TIMELINE"))
            project["ACCOMMODATION_BOOL"] = clean_bool(project.get("ACCOMMODATION"))

            projects.append(project)

        # 3e: add the sheet's projects to the master list
        all_projects.extend(projects)
        print(f"[{sheet_name}] found {len(projects)} projects")

    # phase 4: save the data to a json file for the website
    # if we found nothing, the sheet layout probably changed. we keep the old
    # file so the website doesn't go empty, and exit with an error
    if not all_projects:
        print("Found 0 projects, so projects.json was not changed.")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        # ensure_ascii=False keeps names like "Iași🇷🇴" readable in the file
        # default=str turns anything json can't save (like a time) into text
        json.dump(all_projects, f, indent=2, ensure_ascii=False, default=str)
        f.write("\n")

    print(f"\nDone! Saved {len(all_projects)} projects to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
