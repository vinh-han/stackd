"""Anki .apkg import and export. Import keeps review progress; export writes new cards Anki will schedule itself."""

import hashlib
import html
import io
import json
import re
import sqlite3
import tempfile
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import genanki
import zstandard

MAX_APKG_BYTES = 100 * 1024 * 1024
MAX_COLLECTION_BYTES = 500 * 1024 * 1024  # decompressed; stops a zip bomb
MAX_CARDS = 20_000

_SEP = "\x1f"
_CLOZE = re.compile(r"\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}", re.S)


class AnkiError(ValueError):
    """The package cannot be used. The message is shown to the user."""


# ---------- import ----------


def _text(field: str) -> str:
    """Anki fields are HTML: keep line breaks, drop tags, media references and entities."""
    s = re.sub(r"<br\s*/?>|</div>|</p>|</li>", "\n", field, flags=re.I)
    s = re.sub(r"\[sound:[^\]]*\]", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(s)).strip()


def _open(data: bytes) -> sqlite3.Connection:
    if len(data) > MAX_APKG_BYTES:
        raise AnkiError(f"Anki package is larger than {MAX_APKG_BYTES // (1024 * 1024)} MB.")
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        names = set(z.namelist())
        if "collection.anki21b" in names:  # Anki 2.1.50+: zstd-compressed, newer schema
            reader = zstandard.ZstdDecompressor().stream_reader(z.open("collection.anki21b"))
            db = reader.read(MAX_COLLECTION_BYTES + 1)
        elif "collection.anki21" in names or "collection.anki2" in names:
            db = z.read("collection.anki21" if "collection.anki21" in names else "collection.anki2")
        else:
            raise AnkiError("This zip file is not an Anki package.")
    except (zipfile.BadZipFile, zstandard.ZstdError) as err:
        raise AnkiError("This is not a valid Anki package (.apkg).") from err
    if len(db) > MAX_COLLECTION_BYTES:
        raise AnkiError("This Anki collection is too large to import.")
    conn = sqlite3.connect(":memory:")
    try:
        conn.deserialize(db)
        conn.execute("select count(*) from notes").fetchone()
    except sqlite3.DatabaseError as err:
        raise AnkiError("This Anki package is damaged.") from err
    return conn


def _deck_names(conn: sqlite3.Connection) -> dict[int, str]:
    tables = {r[0] for r in conn.execute("select name from sqlite_master where type = 'table'")}
    if "decks" in tables:  # newer schema: one row per deck, path parts joined by \x1f
        return {did: name.replace(_SEP, "::") for did, name in conn.execute("select id, name from decks")}
    decks = json.loads(conn.execute("select decks from col").fetchone()[0])
    return {int(did): d["name"] for did, d in decks.items()}


def _cloze(text: str, n: int) -> tuple[str, str]:
    """Front hides cloze n as ___ (or its hint); other clozes show their answer. Back lists cloze n's answers."""
    answers: list[str] = []

    def hide(m: re.Match) -> str:
        if int(m.group(1)) != n:
            return m.group(2)
        answers.append(m.group(2))
        return f"___ ({m.group(3)})" if m.group(3) else "___"

    return _CLOZE.sub(hide, text), ", ".join(answers)


def _srs(ctype: int, due: int, ivl: int, factor: int, reps: int, lapses: int, data: str, crt: int) -> dict | None:
    """Anki scheduling as a ts-fsrs card. Review cards keep their interval and next due date; the rest start new."""
    if ctype != 2:
        return None  # new or (re)learning: restart as new, a few minutes of review lost at most
    try:
        memory = json.loads(data) if data else {}
    except json.JSONDecodeError:
        memory = {}
    due_at = datetime.fromtimestamp(crt, UTC) + timedelta(days=due)
    # FSRS memory state when Anki ran FSRS; otherwise interval as stability and ease mapped onto difficulty 1-10.
    stability = float(memory.get("s") or max(ivl, 1))
    difficulty = float(memory.get("d") or min(10.0, max(1.0, 5 + (2500 - factor) / 240)))
    return {
        "due": due_at.isoformat(),
        "stability": stability,
        "difficulty": difficulty,
        "elapsed_days": 0,
        "scheduled_days": ivl,
        "learning_steps": 0,
        "reps": reps,
        "lapses": lapses,
        "state": 2,
        "last_review": (due_at - timedelta(days=ivl)).isoformat(),
    }


def import_apkg(data: bytes) -> list[dict[str, Any]]:
    """Decks with their cards. Top-level Anki decks become decks; sub-decks become topics."""
    conn = _open(data)
    names = _deck_names(conn)
    crt = conn.execute("select crt from col").fetchone()[0]
    rows = conn.execute(
        """select c.did, c.ord, c.type, c.due, c.ivl, c.factor, c.reps, c.lapses, c.data, n.flds, n.tags
           from cards c join notes n on n.id = c.nid
           where c.queue != -1
           order by c.did, n.id, c.ord"""
    ).fetchall()
    if len(rows) > MAX_CARDS:
        raise AnkiError(f"This package has {len(rows):,} cards. The limit is {MAX_CARDS:,} per import.")

    decks: dict[str, list[dict]] = {}
    for did, ord_, ctype, due, ivl, factor, reps, lapses, card_data, flds, tags in rows:
        fields = [_text(f) for f in flds.split(_SEP)]
        if _CLOZE.search(fields[0]):
            front, back = _cloze(fields[0], ord_ + 1)
            extra = fields[1:]
            card_type = "cloze"
        else:
            first, second = fields[0], fields[1] if len(fields) > 1 else ""
            front, back = (second, first) if ord_ == 1 else (first, second)  # ord 1 = the reversed card
            extra = fields[2:]
            card_type = "qa"
        back = "\n\n".join(x for x in [back, *extra] if x)
        if not front or not back:
            continue
        path = names.get(did, "Imported").split("::")
        tag = tags.split()[0] if tags.strip() else ""
        decks.setdefault(path[0], []).append(
            {
                "front": front[:2000],
                "back": back[:4000],
                "type": card_type,
                "topic": " / ".join(path[1:]) or tag or "General",
                "srs": _srs(ctype, due, ivl, factor, reps, lapses, card_data, crt),
            }
        )
    if not decks:
        raise AnkiError("No cards found in this Anki package.")
    return [{"name": name, "cards": cards} for name, cards in decks.items()]


# ---------- export ----------

# Fixed ids: Anki merges re-imports into the same note type instead of piling up copies.
_MODEL = genanki.Model(
    1_839_411_774,
    "Stackd Basic",
    fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[{"name": "Card 1", "qfmt": "{{Front}}", "afmt": '{{FrontSide}}<hr id="answer">{{Back}}'}],
)


def _html(text: str) -> str:
    return html.escape(text).replace("\n", "<br>")


def export_apkg(deck_name: str, cards: list[dict[str, str]]) -> bytes:
    """An .apkg with one note per card. Card ids become note guids, so re-exporting updates notes in Anki."""
    deck = genanki.Deck(int(hashlib.sha1(deck_name.encode()).hexdigest()[:8], 16), deck_name)
    for c in cards:
        tags = [re.sub(r"\s+", "_", c["topic"].strip())] if c.get("topic", "").strip() else []
        deck.add_note(genanki.Note(_MODEL, fields=[_html(c["front"]), _html(c["back"])], tags=tags, guid=genanki.guid_for(c["id"])))
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "deck.apkg"
        genanki.Package(deck).write_to_file(path)
        return path.read_bytes()
