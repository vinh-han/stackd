import re

from stackd_api.chunking import CHUNK_MAX, CHUNK_TARGET, chunk_text


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s)


def test_short_text_is_one_chunk():
    assert chunk_text("  One short paragraph.  ") == ["One short paragraph."]


def test_blank_text_has_no_chunks():
    assert chunk_text("\n\n   \n") == []


def test_paragraphs_are_grouped_up_to_target():
    paragraphs = [f"Paragraph {i}. " + "word " * 150 for i in range(10)]  # ~760 chars each
    chunks = chunk_text("\n\n".join(paragraphs))

    assert 1 < len(chunks) < len(paragraphs)
    assert all(len(c) <= CHUNK_TARGET for c in chunks)
    # Paragraphs are never split across chunks when they fit.
    for p in paragraphs:
        assert sum(p.strip() in c for c in chunks) == 1


def test_long_paragraph_splits_on_sentences():
    sentences = [f"Sentence number {i} explains one idea in some detail." for i in range(200)]
    text = " ".join(sentences)
    chunks = chunk_text(text)

    assert len(chunks) > 1
    assert all(len(c) <= CHUNK_MAX for c in chunks)
    assert all(c.endswith(".") for c in chunks)
    assert squash("".join(chunks)) == squash(text)


def test_long_paragraph_keeps_stray_punctuation():
    text = "...and so on. " + "Sentence here. ... " * 300 + "?? trailing words"
    assert len(text) > CHUNK_MAX
    assert squash("".join(chunk_text(text))) == squash(text)


def test_text_without_punctuation_is_hard_cut():
    text = "x" * (CHUNK_MAX * 2 + 10)
    chunks = chunk_text(text)

    assert all(len(c) <= CHUNK_MAX for c in chunks)
    assert "".join(chunks) == text


def test_windows_line_endings_split_paragraphs():
    a, b = "a" * 2000, "b" * 2000
    assert chunk_text(f"{a}\r\n\r\n{b}") == [a, b]


def test_vietnamese_diacritics_survive():
    text = "Duy trì thói quen học mỗi ngày.\n\nKiên nhẫn là chìa khoá. Đừng bỏ cuộc!"
    assert chunk_text(text) == ["Duy trì thói quen học mỗi ngày.\n\nKiên nhẫn là chìa khoá. Đừng bỏ cuộc!"]
