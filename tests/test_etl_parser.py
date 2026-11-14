import pytest

from scripts.etl_parser import (
    clean_bool,
    clean_currency,
    clean_duration,
    clean_fee,
    clean_url,
    resolve_sdg,
)

# every test below uses @pytest.mark.parametrize: we write a list of
# (input, expected answer) pairs and pytest runs the same test once per pair.
# most inputs are copied from real cells in the AIESEC sheet.


# phase 1: clean_url should give back a real link, or None when there isn't one
@pytest.mark.parametrize(
    "raw_url, expected",
    [
        # google wraps pasted links in a redirect, we want the real one back
        (
            "https://www.google.com/url?q=https://aiesec.org/opportunity/global-volunteer/1331721&sa=D&source=editors",
            "https://aiesec.org/opportunity/global-volunteer/1331721",
        ),
        # a normal link stays the same
        (
            "https://aiesec.org/opportunity/global-volunteer/1305759",
            "https://aiesec.org/opportunity/global-volunteer/1305759",
        ),
        # a link in the middle of a sentence
        (
            "see https://drive.google.com/drive/folders/1JgZc?usp=sharing for photos",
            "https://drive.google.com/drive/folders/1JgZc?usp=sharing",
        ),
        # text that only looks like a link is not a link
        ("Sisters at Law | Global Volunteer | AIESEC", None),
        ("GC Matale.pdf", None),
        (None, None),
    ],
)
def test_clean_url(raw_url, expected):
    assert clean_url(raw_url) == expected


# phase 2: clean_fee should turn any price text into a plain number
@pytest.mark.parametrize(
    "raw_fee, expected",
    [
        ("75 EUR", 75.0),
        ("57$", 57.0),
        # decimal comma and decimal point both work
        ("104,20€", 104.2),
        ("92.17 EUR", 92.17),
        # a price range keeps the lowest price
        ("190-450$", 190.0),
        # free projects are 0, which is different from "we don't know" (None)
        ("0 EUR", 0.0),
        # cells that are already numbers in excel
        (104.2, 104.2),
        (49, 49.0),
        # no number in the cell
        ("Inquire with LC", None),
        (None, None),
    ],
)
def test_clean_fee(raw_fee, expected):
    assert clean_fee(raw_fee) == expected


# phase 3: clean_duration should find the number of weeks
@pytest.mark.parametrize(
    "raw_duration, raw_timeline, expected",
    [
        ("6 weeks", None, 6),
        ("4 weeks (can be extended)", None, 4),
        # "6/4" means 6 weeks with a shorter 4 week option, so we keep the 6
        ("6/4 weeks", None, 6),
        # the cell is just a number
        (6, None, 6),
        # start and end dates instead of a number of weeks
        ("13 Jul - 24 Aug", None, 6),
        ("3 August - 14 September", None, 6),
        # a date range that crosses new year
        ("15 Dec - 26 Jan", None, 6),
        # DURATION is empty but TIMELINE says it
        (None, "6 weeks", 6),
        # dates without a dash between them are not a range we can trust
        ("18th of May 29th of July 1 slot", None, None),
        # no project is 99 weeks long, so this must be a typo
        ("99 weeks", None, None),
        (None, None, None),
    ],
)
def test_clean_duration(raw_duration, raw_timeline, expected):
    assert clean_duration(raw_duration, raw_timeline) == expected


# phase 4: clean_bool should turn the housing cell into True / False
@pytest.mark.parametrize(
    "raw_value, expected",
    [
        # any way of writing yes
        ("Yes", True),
        ("yEs", True),
        (1, True),
        # a description of the place also means housing is included
        ("host families", True),
        ("dorms of the NGO", True),
        ("provided ; covered", True),
        # any way of writing no
        ("No", False),
        ("not provided", False),
        # "provided" is in the text, but "not covered" means the student pays
        ("provided but not covered", False),
        # unknown counts as no, so we never promise housing by mistake
        ("?", False),
        (None, False),
    ],
)
def test_clean_bool(raw_value, expected):
    assert clean_bool(raw_value) is expected


# phase 5: resolve_sdg should read the SDG cell, or guess it from the project name
@pytest.mark.parametrize(
    "raw_sdg, project_name, expected",
    [
        # the number is in the SDG cell
        (10, "Equify", 10),
        (4.0, "Global Classroom", 4),
        ("SDG 13", "Green Leaders", 13),
        # the cell is empty, so the project name decides
        (None, "Raise your Voice", 5),
        (None, "Scale Up!", 17),
        (None, "Global Classroom - Teaching English", 4),
        # there are only 17 SDGs, so 99 is ignored and the name decides
        (99, "Rooted", 15),
        # unknown project name
        (None, "Eco City", None),
        (None, None, None),
    ],
)
def test_resolve_sdg(raw_sdg, project_name, expected):
    assert resolve_sdg(raw_sdg, project_name) == expected


# phase 6: clean_currency should say if a fee is in euros or dollars
@pytest.mark.parametrize(
    "raw_fee, expected",
    [
        # a dollar sign means dollars
        ("57$", "USD"),
        ("75 EUR", "EUR"),
        # only a number: the sheet is in euros unless it says something else
        (104.2, "EUR"),
        # no fee in the cell means there is no currency to show
        (None, None),
    ],
)
def test_clean_currency(raw_fee, expected):
    assert clean_currency(raw_fee) == expected
