"""Runs real Docling (and EasyOCR) on small fixture files. First run downloads models, later runs take seconds."""

from io import BytesIO
from pathlib import Path

import pypdfium2
import pytest

from stackd_api.extract import MAX_FILE_BYTES, MAX_PAGES, ExtractError, check_upload, extract

FIXTURES = Path(__file__).parent / "fixtures"


def run(name: str):
    return extract(name, (FIXTURES / name).read_bytes())


def all_text(chunks) -> str:
    return "\n".join(c.text for c in chunks)


def blank_pdf(pages: int) -> bytes:
    doc = pypdfium2.PdfDocument.new()
    for _ in range(pages):
        doc.new_page(200, 200)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ---------- formats ----------


def test_pdf_keeps_pages_and_tables():
    chunks = run("storage.pdf")
    text = all_text(chunks)
    assert "Expedited retrievals return data in 1 to 5 minutes." in text
    assert "| Expedited | 1-5 minutes" in text  # table survives as Markdown, not a flattened run of words
    assert sorted({p for c in chunks for p in c.pages}) == [1, 2]


def test_pptx_slides_are_pages():
    chunks = run("security.pptx")
    assert "IAM roles give temporary credentials through STS." in all_text(chunks)
    assert sorted({p for c in chunks for p in c.pages}) == [1, 2, 3]


def test_docx_has_text_tables_and_vietnamese():
    text = all_text(run("networking.docx"))
    assert "A NAT gateway lets instances in a private subnet" in text
    assert "| NLB" in text
    assert "Kiên nhẫn là chìa khoá của việc học ngoại ngữ." in text


# ---------- OCR ----------


def test_ocr_reads_vietnamese_photo_with_tone_marks():
    text = all_text(run("notes_vi.png"))
    for phrase in ["Kiên nhẫn", "việc học ngoại ngữ", "cà phê sữa đá"]:
        assert phrase in text


def test_ocr_reads_scanned_pdf_without_text_layer():
    chunks = run("scanned.pdf")
    text = all_text(chunks)
    assert "Expedited retrievals take 1 to 5 minutes" in text
    assert "5 to 12 hours" in text
    assert chunks[0].pages == [1]


# ---------- upload checks ----------


@pytest.mark.parametrize(
    ("name", "data", "message"),
    [
        ("notes.txt", b"hello", "Unsupported file type"),
        ("fake.pdf", b"PK\x03\x04 not a pdf", "not a valid PDF"),
        ("fake.webp", b"RIFF1234WAVE", "not a valid WEBP"),
        ("broken.pdf", b"%PDF-1.7 garbage", "damaged"),
    ],
    ids=["unsupported", "wrong-signature", "fake-webp", "damaged-pdf"],
)
def test_check_upload_rejects_bad_files(name, data, message):
    with pytest.raises(ExtractError, match=message):
        check_upload(name, data)


def test_check_upload_rejects_oversized_file():
    with pytest.raises(ExtractError, match="larger than 20 MB"):
        check_upload("huge.png", b"\x89PNG" + b"0" * MAX_FILE_BYTES)


def test_check_upload_rejects_too_many_pages():
    with pytest.raises(ExtractError, match=f"{MAX_PAGES + 1} pages"):
        check_upload("long.pdf", blank_pdf(MAX_PAGES + 1))


def test_check_upload_accepts_limit_and_uppercase_extension():
    check_upload("LONG.PDF", blank_pdf(MAX_PAGES))


def test_file_without_text_is_an_error():
    with pytest.raises(ExtractError, match="No text found"):
        extract("blank.pdf", blank_pdf(1))
