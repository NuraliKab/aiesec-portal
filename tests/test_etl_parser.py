import pytest
from scripts.etl_parser import (
    clean_url,
    clean_fee,
    clean_duration,
    clean_bool,
    resolve_sdg,
)

@pytest.mark.parametrize(
    "raw_input, expected",
    [
        (
            "https://www.google.com/url?q=https://aiesec.org/opportunity/global-volunteer/1331721&sa=D&source=editors",
            "https://aiesec.org/opportunity/global-volunteer/1331721",
        ),
        ("Sisters at Law | Global Volunteer | AIESEC", None),
        ("GC Matale.pdfk", None),
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
        ("92.17 EUR", 92.17),
        ("190-450$", 190.0),
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
        ("6 weeks (4?)", None, 6),
        (None, "6 weeks", 6),
        ("23 Feb - 6 Apr", None, None),
    ],
)
def test_clean_duration(raw_duration, raw_timeline, expected_weeks):
    assert clean_duration(raw_duration, raw_timeline) == expected_weeks


@pytest.mark.parametrize(
    "raw_val, expected_bool",
    [
        ("Yes", True),
        ("yEs", True),
        ("host families", True),
        ("dorms of the NGO", True),
        ("No", False),
        ("not provided", False),
        (".", False),
        (None, False),
    ],
)
def test_clean_bool(raw_val, expected_bool):
    assert clean_bool(raw_val) is expected_bool


@pytest.mark.parametrize(
    "raw_sdg, project_name, expected_sdg",
    [
        (10, "Equify", 10),
        (None, "Raise your Voice", 5),
        (None, "Happy Bus", 4),
        (None, "Eat 4 Change", 12),
        (None, "Aquatica", 14),
    ],
)
def test_resolve_sdg(raw_sdg, project_name, expected_sdg):
    assert resolve_sdg(raw_sdg, project_name) == expected_sdg