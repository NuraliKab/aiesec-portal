import json
from datetime import date, datetime, time, timedelta

import pytest
from scripts.etl_parser import (
    normalize_text,
    canonical_header,
    is_header_row,
    is_sentinel_row,
    to_json_safe,
    find_field,
    clean_url,
    clean_fee,
    clean_duration,
    clean_bool,
    resolve_sdg,
    write_json_atomic,
)

# ==============================================================================
# phase 1: header / boundary detection helpers
# ==============================================================================

@pytest.mark.parametrize(
    "raw_input, expected",
    [
        ("OPPORTUNITY\nLINK", "OPPORTUNITY LINK"),
        ("OPPORTUNITY\xa0LINK", "OPPORTUNITY LINK"),
        ("  opportunity \t link  ", "OPPORTUNITY LINK"),
        ("Project", "PROJECT"),
        (4.0, "4.0"),
        (None, ""),
    ],
)
def test_normalize_text(raw_input, expected):
    assert normalize_text(raw_input) == expected


@pytest.mark.parametrize(
    "raw_header, expected",
    [
        ("ACCOMODATION", "ACCOMMODATION"),
        ("Accommodation", "ACCOMMODATION"),
        ("TIMELINE\nOPEN", "TIMELINE"),
        ("FEE", "FEE"),
        ("   ", None),
        (None, None),
    ],
)
def test_canonical_header(raw_header, expected):
    assert canonical_header(raw_header) == expected


@pytest.mark.parametrize(
    "row, expected",
    [
        # real header (Iași / Izmir / Ain Sham variants with wrapped whitespace)
        (["SDG", "PROJECT", "OPPORTUNITY\nLINK", "PROVIDER"], True),
        ([None, "Project\xa0", "Opportunity Link", None], True),
        # Ain Sham row 18: "4 WEEKS PROJECTS?" + Canva URL containing "LINK" -> must NOT match
        (["Possible 4 weeks projects?", "yes", "outings", "https://www.canva.com/...utm_medium=link2"], False),
        # Delhi IIT row 13: bare "LINK" cell with no project anchor
        (["SLOTS", "VISA", "BOOKLET:", "LINK"], False),
        # participant log header below the sentinel
        (["EP NAME", "CURRENT STATE", "PROJECT LINK", "PROJECT went well?"], False),
        ([None, None, None], False),
    ],
)
def test_is_header_row(row, expected):
    assert is_header_row(row) is expected


@pytest.mark.parametrize(
    "row, expected",
    [
        ([None, "OUR EXPERIENCES", None], True),
        (["EP NAME", "CURRENT\nSTATE", "WHERE (LC city?)"], True),
        (["our  experiences"], True),
        # a job description mentioning the phrase mid-sentence must not terminate the table
        ([4, "Global Classroom", "Assess the current state of local schools"], False),
        ([None, None], False),
    ],
)
def test_is_sentinel_row(row, expected):
    assert is_sentinel_row(row) is expected


# ==============================================================================
# phase 2: serialization safety
# ==============================================================================

@pytest.mark.parametrize(
    "raw_value, expected",
    [
        (datetime(2026, 3, 1, 0, 0), "2026-03-01T00:00:00"),
        (date(2026, 2, 23), "2026-02-23"),
        (time(11, 3, 26), "11:03:26"),
        (timedelta(days=1, hours=4, minutes=1, seconds=26), "1 day, 4:01:26"),
        ("  yes  ", "yes"),
        ("   ", None),
        (104.2, 104.2),
        (None, None),
    ],
)
def test_to_json_safe(raw_value, expected):
    result = to_json_safe(raw_value)
    assert result == expected
    json.dumps(result)  # must never raise TypeError


def test_write_json_atomic_roundtrip(tmp_path):
    target = tmp_path / "nested" / "projects.json"
    payload = [{"COUNTRY": "Iași🇷🇴", "TIMELINE": datetime(2026, 3, 1)}]
    write_json_atomic(payload, str(target))
    loaded = json.loads(target.read_text(encoding="utf-8"))
    assert loaded == [{"COUNTRY": "Iași🇷🇴", "TIMELINE": "2026-03-01 00:00:00"}]
    # no temp files left behind in the target directory
    assert [p.name for p in target.parent.iterdir()] == ["projects.json"]


@pytest.mark.parametrize(
    "record, keywords, expected",
    [
        # exact match wins over substring match regardless of column order
        ({"PROJECT LINK": "x", "PROJECT": "Equify"}, ("PROJECT",), "Equify"),
        ({"OPPORTUNITY LINK": "u"}, ("OPPORTUNITY LINK", "LINK"), "u"),
        ({"ACCOMMODATION": "yes"}, ("ACCOMMOD", "ACCOMOD"), "yes"),
        ({"FEE": None}, ("FEE",), None),
        ({}, ("FEE",), None),
    ],
)
def test_find_field(record, keywords, expected):
    assert find_field(record, *keywords) == expected


# ==============================================================================
# phase 3: pure field sanitizers
# ==============================================================================

@pytest.mark.parametrize(
    "raw_input, expected",
    [
        (
            "https://www.google.com/url?q=https://aiesec.org/opportunity/global-volunteer/1331721&sa=D&source=editors",
            "https://aiesec.org/opportunity/global-volunteer/1331721",
        ),
        (
            "https://aiesec.org/opportunity/global-volunteer/1305759",
            "https://aiesec.org/opportunity/global-volunteer/1305759",
        ),
        (
            "see https://drive.google.com/drive/folders/1JgZc?usp=sharing for photos",
            "https://drive.google.com/drive/folders/1JgZc?usp=sharing",
        ),
        ("Sisters at Law | Global Volunteer | AIESEC", None),
        ("GC Matale.pdfk", None),
        ("2026-03-01T00:00:00", None),
        ("   ", None),
        (None, None),
    ],
)
def test_clean_url(raw_input, expected):
    assert clean_url(raw_input) == expected


@pytest.mark.parametrize(
    "raw_fee, expected_float",
    [
        ("75 EUR", 75.0),
        ("104,20€", 104.20),
        ("76,32", 76.32),
        ("92.17 EUR", 92.17),
        ("103,56 EUr", 103.56),
        ("200 EUR ", 200.0),
        ("190-450$", 190.0),
        ("0 EUR", 0.0),
        (104.2, 104.2),
        (49, 49.0),
        ("Inquire with LC", None),
        (-5, None),
        (True, None),
        (None, None),
    ],
)
def test_clean_fee(raw_fee, expected_float):
    assert clean_fee(raw_fee) == expected_float


@pytest.mark.parametrize(
    "raw_duration, raw_timeline, expected_weeks",
    [
        ("6 weeks", None, 6),
        ("6/4 weeks", None, 6),
        ("6 / 4 weeks", None, 6),
        ("6 weeks (4?)", None, 6),
        ("4 weeks (can be extended)", None, 4),
        ("6/4 weeks (link for the 4 weeks: https://aiesec.org/opportunity/x)", None, 6),
        ("8 wks", None, 8),
        ("6w", None, 6),
        (None, "6 weeks", 6),
        # explicit realization windows in the DURATION column
        ("23 Feb - 6 Apr", None, 6),
        ("13 Jul - 24 Aug", None, 6),
        ("3 August - 14 September", None, 6),
        ("15 Dec - 26 Jan", None, 6),
        # availability windows (no dash) are not a realization length
        ("18th of May 29th of July 1 slot", None, None),
        # "2026 with" must not be read as 2026 weeks
        (None, "from 1 Jan 2026 with flexible start", None),
        # numeric cells and out-of-range values
        (6, None, 6),
        (0, None, None),
        ("99 weeks", None, None),
        (None, None, None),
    ],
)
def test_clean_duration(raw_duration, raw_timeline, expected_weeks):
    assert clean_duration(raw_duration, raw_timeline) == expected_weeks


@pytest.mark.parametrize(
    "raw_val, expected_bool",
    [
        ("Yes", True),
        ("yEs", True),
        (" YES https://drive.google.com/drive/folders/1u3db", True),
        ("host families", True),
        ("dorms of the NGO", True),
        ("provided ; covered", True),
        ("in a tent", True),
        (1, True),
        ("No", False),
        ("no ", False),
        ("not provided", False),
        ("Not Covered and Not Provided", False),
        ("provided but not covered", False),
        ("To be checked with the project coordinator", False),
        ("?", False),
        (".", False),
        (0, False),
        (None, False),
    ],
)
def test_clean_bool(raw_val, expected_bool):
    assert clean_bool(raw_val) is expected_bool


@pytest.mark.parametrize(
    "raw_sdg, project_name, expected_sdg",
    [
        (10, "Equify", 10),
        (4.0, "Global Classroom", 4),
        ("SDG 13", "Green Leaders", 13),
        (None, "Raise your Voice", 5),
        (None, "Happy Bus", 4),
        (None, "Eat 4 Change", 12),
        (None, "Aquatica", 14),
        (None, "Scale Up!", 17),
        (None, "Global Classroom - Teaching English", 4),
        (None, "  on the\nmap ", 8),
        # out-of-range numeric SDG falls back to the taxonomy
        (99, "Rooted", 15),
        (None, "Eco City", None),
        (None, None, None),
    ],
)
def test_resolve_sdg(raw_sdg, project_name, expected_sdg):
    assert resolve_sdg(raw_sdg, project_name) == expected_sdg