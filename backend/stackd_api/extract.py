"""Turns uploaded files (PDF, Word, PowerPoint, images) into generation-sized chunks with page numbers, via Docling."""

from collections.abc import Callable, Iterator
from functools import cache
from io import BytesIO
from pathlib import PurePath

import pypdfium2
from docling.datamodel.base_models import InputFormat
from docling.datamodel.document import DocumentStream
from docling.datamodel.pipeline_options import EasyOcrOptions, PdfPipelineOptions
from docling.datamodel.progress import PageCompletedProgress
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption
from docling_core.types.doc import DoclingDocument, TableItem, TextItem

from .chunking import Chunk, group_pieces

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PAGES = 100

# Extension -> accepted leading bytes. Checked before Docling ever sees the file.
_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    ".pdf": (b"%PDF",),
    ".docx": (b"PK\x03\x04",),
    ".pptx": (b"PK\x03\x04",),
    ".png": (b"\x89PNG",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".webp": (b"RIFF",),
    ".tif": (b"II*\x00", b"MM\x00*"),
    ".tiff": (b"II*\x00", b"MM\x00*"),
}
SUPPORTED_EXTENSIONS = tuple(_SIGNATURES)

ProgressFn = Callable[[int, int], None]


class ExtractError(ValueError):
    """The file cannot be used. The message is shown to the user."""


def check_upload(filename: str, data: bytes) -> None:
    """Cheap checks that run before the file is queued, so bad uploads fail fast."""
    ext = PurePath(filename).suffix.lower()
    if ext not in _SIGNATURES:
        raise ExtractError("Unsupported file type. Upload a PDF, Word (.docx), PowerPoint (.pptx) or image file.")
    if len(data) > MAX_FILE_BYTES:
        raise ExtractError(f"File is larger than {MAX_FILE_BYTES // (1024 * 1024)} MB.")
    if not data.startswith(_SIGNATURES[ext]) or (ext == ".webp" and data[8:12] != b"WEBP"):
        raise ExtractError(f"This file is not a valid {ext[1:].upper()} file.")
    if ext == ".pdf":
        try:
            pages = len(pypdfium2.PdfDocument(data))
        except pypdfium2.PdfiumError as err:
            raise ExtractError("This PDF is damaged or password-protected.") from err
        if pages > MAX_PAGES:
            raise ExtractError(f"This PDF has {pages} pages. The limit is {MAX_PAGES}; split it and upload the parts.")


@cache
def _converter() -> DocumentConverter:
    # EasyOCR: in testing it kept Vietnamese tone marks that RapidOCR dropped ("học mỗi" -> "hc mi").
    # It only runs on regions without a text layer, so scans and photos get OCR and digital text does not.
    ocr = PdfPipelineOptions(ocr_options=EasyOcrOptions(lang=["vi", "en"]))
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF, InputFormat.DOCX, InputFormat.PPTX, InputFormat.IMAGE],
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=ocr),
            InputFormat.IMAGE: ImageFormatOption(pipeline_options=ocr),
        },
    )


def _pieces(doc: DoclingDocument) -> Iterator[tuple[str, list[int]]]:
    """Every text block and table in reading order, with its pages. Headings stay in as plain text."""
    for item, _ in doc.iterate_items():
        if isinstance(item, TableItem):
            text = item.export_to_markdown(doc=doc)
        elif isinstance(item, TextItem):
            text = item.text
        else:
            continue  # pictures without text, groups
        if text.strip():
            yield text.strip(), [p.page_no for p in item.prov]


def extract(filename: str, data: bytes, on_progress: ProgressFn | None = None) -> list[Chunk]:
    check_upload(filename, data)

    def report(event: object) -> None:
        if on_progress and isinstance(event, PageCompletedProgress):
            on_progress(event.completed_pages, event.total_pages)

    result = _converter().convert(
        DocumentStream(name=filename, stream=BytesIO(data)),
        max_num_pages=MAX_PAGES,
        max_file_size=MAX_FILE_BYTES,
        progress_callback=report,
    )
    chunks = group_pieces(_pieces(result.document))
    if not chunks:
        raise ExtractError("No text found in this file.")
    return chunks
