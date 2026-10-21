from datetime import date

import pytest

from app.services.transcript_parser import parse_transcript_pdf, parse_transcript_text

LAYOUT = """
NAME OF STUDENT   :   TEST STUDENT   MATRIC NO   : U2522702E
PROGRAMME   :   COMPUTING (COMPUTER SCIENCE)   DATE OF BIRTH   :1 JANUARY 2004

2025-2026 SEMESTER 1   2025-2026 SEMESTER 2
       Code   Course   AU   Grade   Point   Code   Course   AU   Grade   Point
       CC0003   ETHICS & CIVICS IN A MULTICULTURAL   2.0   B+   4.00   CC0001   INQUIRY & COMMUNICATION   2.0   A   5.00
                  WORLD   SC1006   COMPUTER ORGANISATION   3.0   F   0.00
   *   CC0015   HEALTH & WELLBEING   2.0   PASS   SC1007   DATA STRUCTURES   3.0   W
       MH1812   DISCRETE MATHEMATICS   3.0   A-   4.50
                  Cumulative Grade Point Average :   4.51
Print date : 21 OCTOBER 2026
"""


def test_REQ_PROF_1_fields_from_layout_text():
    out = parse_transcript_text(LAYOUT, "")
    assert out["cgpa"] == 4.51
    assert (out["school"], out["degree"]) == ("CCDS", "Computer Science")
    assert out["year_of_study"] == 2  # admitted 2025, printed Oct 2026 = academic year 2026-27
    assert out["completed_modules"] == ["CC0001", "CC0003", "CC0015", "MH1812"]  # F and W left out


def test_REQ_PROF_1_year_of_study_follows_as_of_date():
    assert parse_transcript_text(LAYOUT, "", as_of=date(2026, 3, 1))["year_of_study"] == 1
    assert parse_transcript_text(LAYOUT, "", as_of=date(2026, 9, 7))["year_of_study"] == 2


def test_REQ_PROF_1_plain_text_fallback_lists_codes_before_grading_key():
    plain = "PROGRAMME         ACCOUNTANCY (SUSTAINABILITY):\nAB1202\nAC1103\nCumulative GPA : 4.21\nGRADINGS\nXX9999"
    out = parse_transcript_text("", plain)
    assert out["completed_modules"] == ["AB1202", "AC1103"]
    assert (out["school"], out["cgpa"]) == ("NBS", 4.21)


def test_REQ_PROF_1_unknown_programme_keeps_printed_name():
    out = parse_transcript_text("PROGRAMME : UNDERWATER BASKETRY      \n", "")
    assert (out["school"], out["degree"]) == ("", "Underwater Basketry")
    assert out["cgpa"] is None and out["completed_modules"] == []


def test_REQ_PROF_3_unreadable_pdf_rejected():
    with pytest.raises(ValueError):
        parse_transcript_pdf(b"not a pdf")


def _upload(name="t.pdf", content_type="application/pdf"):
    import io

    return {"file": (name, io.BytesIO(b"%PDF-1.4 x"), content_type)}


def test_REQ_PROF_1_parse_endpoint_returns_fields_and_drops_unknown_modules(client_for, monkeypatch):
    from app.routers import profile

    monkeypatch.setattr(
        profile,
        "parse_transcript_pdf",
        lambda _b: {
            "cgpa": 4.51,
            "school": "CCDS",
            "degree": "Computer Science",
            "year_of_study": 2,
            "completed_modules": ["SC1003", "ZZ9999"],
        },
    )
    resp = client_for("stu-1").post("/me/transcript/parse", files=_upload())
    assert resp.status_code == 200
    assert resp.json() == {
        "cgpa": 4.51,
        "school": "CCDS",
        "degree": "Computer Science",
        "year_of_study": 2,
        "completed_modules": ["SC1003"],  # ZZ9999 is not in the catalog, so saving the profile would refuse it
    }


def test_REQ_PROF_1_parse_endpoint_saves_nothing(client_for, monkeypatch):
    from app.routers import profile

    monkeypatch.setattr(
        profile,
        "parse_transcript_pdf",
        lambda _b: {"cgpa": 1.0, "school": "EEE", "degree": "", "year_of_study": 1, "completed_modules": []},
    )
    client = client_for("stu-1")
    before = client.get("/me/profile").json()
    client.post("/me/transcript/parse", files=_upload())
    assert client.get("/me/profile").json() == before


def test_REQ_PROF_1_parse_endpoint_rejects_non_pdf_and_unreadable(client_for):
    client = client_for("stu-1")
    assert client.post("/me/transcript/parse", files=_upload("notes.txt", "text/plain")).status_code == 422
    resp = client.post("/me/transcript/parse", files=_upload())  # %PDF header but no real pages
    assert resp.status_code == 422 and resp.json()["code"] == "unreadable_transcript"


def test_REQ_PROF_1_parse_endpoint_is_student_only(client_for):
    assert client_for("sup-1").post("/me/transcript/parse", files=_upload()).status_code == 403


@pytest.mark.parametrize(
    ("programme", "school", "degree"),
    [
        ("COMPUTING (COMPUTER SCIENCE)", "CCDS", "Computer Science"),
        ("MATHEMATICS & COMPUTER SCIENCE", "SPMS", "Mathematics & Computer Science"),
        ("BUSINESS & COMPUTER SCIENCE", "NBS", "Business & Computer Science"),
        ("ACCOUNTANCY & DATA SCIENCE AND AI", "NBS", "Accountancy & Data Science and AI"),
        ("ACCOUNTANCY (SUSTAINABILITY MANAGEMENT & ANALYTICS)", "NBS", "Accountancy"),
    ],
)
def test_REQ_PROF_1_combined_programmes_map_to_their_own_school(programme, school, degree):
    out = parse_transcript_text(f"PROGRAMME : {programme}      \n", "")
    assert (out["school"], out["degree"]) == (school, degree)
