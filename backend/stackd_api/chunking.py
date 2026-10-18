"""Splits pasted text into chunks small enough for one generation call."""

import re

# Target and hard limit per chunk, in characters. Roughly 750 to 1,000 tokens.
CHUNK_TARGET = 3000
CHUNK_MAX = 4000
# Per paste. Keeps one generation run cheap and well under a minute.
MAX_INPUT_CHARS = 50_000

_PARAGRAPH_BREAK = re.compile(r"\n\s*\n")
# `*` not `+`: a run like "..." right after a sentence must still match, or it is silently dropped.
_SENTENCE = re.compile(r"[^.!?。]*[.!?。]+[\"')\]]*\s*|[^.!?。]+$")


def chunk_text(text: str) -> list[str]:
    """Splits on paragraph boundaries, falling back to sentences, then hard cuts."""
    paragraphs = (p.strip() for p in _PARAGRAPH_BREAK.split(text.replace("\r\n", "\n")))
    pieces = [piece for p in paragraphs if p for piece in _split_long(p)]

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + len(piece) + 2 > CHUNK_TARGET:
            chunks.append(current)
            current = piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def _split_long(paragraph: str) -> list[str]:
    if len(paragraph) <= CHUNK_MAX:
        return [paragraph]
    sentences = _SENTENCE.findall(paragraph) or [paragraph]
    out: list[str] = []
    current = ""
    for s in sentences:
        if len(s) > CHUNK_MAX:
            if current.strip():
                out.append(current.strip())
            current = ""
            out.extend(s[i : i + CHUNK_MAX].strip() for i in range(0, len(s), CHUNK_MAX))
        elif len(current) + len(s) > CHUNK_MAX:
            out.append(current.strip())
            current = s
        else:
            current += s
    if current.strip():
        out.append(current.strip())
    return [piece for piece in out if piece]
