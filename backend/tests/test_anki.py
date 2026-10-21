import io
import sqlite3
import zipfile
from datetime import UTC, datetime, timedelta

import genanki
import pytest
import zstandard

from stackd_api.anki import AnkiError, export_apkg, import_apkg

BASIC = genanki.Model(
    1, "Basic (and reversed card)", fields=[{"name": "Front"}, {"name": "Back"}],
    templates=[{"name": "Card 1", "qfmt": "{{Front}}", "afmt": "{{Back}}"}, {"name": "Card 2", "qfmt": "{{Back}}", "afmt": "{{Front}}"}],
)
CLOZE = genanki.Model(
    2, "Cloze", fields=[{"name": "Text"}, {"name": "Extra"}],
    templates=[{"name": "Cloze", "qfmt": "{{cloze:Text}}", "afmt": "{{cloze:Text}}<br>{{Extra}}"}], model_type=genanki.Model.CLOZE,
)


def build_apkg(tmp_path) -> bytes:
    """AWS deck with a sub-deck: a reversed basic note, a 2-deletion cloze, an HTML-heavy note."""
    aws, s3 = genanki.Deck(10, "AWS"), genanki.Deck(11, "AWS::Storage::S3")
    aws.add_note(genanki.Note(BASIC, ["What is <b>IAM</b>?", "Identity &amp; access<br>management"], tags=["security"]))
    s3.add_note(genanki.Note(CLOZE, ["{{c1::Glacier}} retrieval takes {{c2::1-5 minutes::time}}.", "Expedited tier"]))
    s3.add_note(genanki.Note(BASIC, ['<div>Max object size?</div><img src="x.png">', "5 TB [sound:a.mp3]"]))
    path = tmp_path / "in.apkg"
    genanki.Package([aws, s3]).write_to_file(path)
    return path.read_bytes()


def patch_collection(apkg: bytes, sql: list[str], modern: bool = False) -> bytes:
    """Edits the SQLite inside a package. modern=True re-packs it the way Anki 2.1.50+ does (zstd, decks table)."""
    src = zipfile.ZipFile(io.BytesIO(apkg))
    conn = sqlite3.connect(":memory:")
    conn.deserialize(src.read("collection.anki2"))
    for statement in sql:
        conn.execute(statement)
    if modern:
        import json

        decks = json.loads(conn.execute("select decks from col").fetchone()[0])
        conn.execute("create table decks (id integer primary key, name text)")
        conn.executemany("insert into decks values (?, ?)", [(int(k), d["name"].replace("::", "\x1f")) for k, d in decks.items()])
    conn.commit()
    db = conn.serialize()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        if modern:
            z.writestr("collection.anki21b", zstandard.ZstdCompressor().compress(db))
            z.writestr("collection.anki2", b"stub: please update Anki")  # what modern Anki writes for old clients
        else:
            z.writestr("collection.anki2", db)
        z.writestr("media", "{}")
    return out.getvalue()


def cards_by_front(decks):
    return {c["front"]: c for d in decks for c in d["cards"]}


def test_imports_decks_topics_and_card_kinds(tmp_path):
    decks = import_apkg(build_apkg(tmp_path))
    assert [d["name"] for d in decks] == ["AWS"]  # sub-deck folds into the top-level deck
    cards = cards_by_front(decks)

    assert cards["What is IAM?"]["back"] == "Identity & access\nmanagement"  # HTML and entities cleaned
    assert cards["Identity & access\nmanagement"]["back"] == "What is IAM?"  # reversed card
    assert cards["What is IAM?"]["topic"] == "security"  # top-level deck: first tag as topic

    c1 = cards["___ retrieval takes 1-5 minutes."]
    assert (c1["type"], c1["back"], c1["topic"]) == ("cloze", "Glacier\n\nExpedited tier", "Storage / S3")
    c2 = cards["Glacier retrieval takes ___ (time)."]
    assert c2["back"].startswith("1-5 minutes")

    assert cards["Max object size?"]["back"] == "5 TB"  # image and sound references dropped
    assert all(c["srs"] is None for c in cards.values())  # all new in this package


def test_keeps_review_progress(tmp_path):
    crt = int(datetime(2026, 1, 1, tzinfo=UTC).timestamp())
    apkg = patch_collection(
        build_apkg(tmp_path),
        [
            f"update col set crt = {crt}",
            # One reviewed card that Anki ran FSRS on; one reviewed under the old algorithm (ease 2500).
            "update cards set type = 2, queue = 2, due = 300, ivl = 30, factor = 2500, reps = 7, lapses = 1,"
            " data = '{\"s\": 41.5, \"d\": 4.2}' where id = (select min(id) from cards)",
            "update cards set type = 2, queue = 2, due = 290, ivl = 12, factor = 1300, data = '' where id = (select max(id) from cards)",
        ],
    )
    reviewed = [c for c in cards_by_front(import_apkg(apkg)).values() if c["srs"]]
    fsrs, legacy = sorted(reviewed, key=lambda c: -c["srs"]["stability"])

    assert fsrs["srs"]["stability"] == 41.5 and fsrs["srs"]["difficulty"] == 4.2
    assert fsrs["srs"]["due"] == (datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=300)).isoformat()
    assert (fsrs["srs"]["state"], fsrs["srs"]["reps"], fsrs["srs"]["lapses"], fsrs["srs"]["scheduled_days"]) == (2, 7, 1, 30)
    assert legacy["srs"]["stability"] == 12  # interval stands in for stability
    assert legacy["srs"]["difficulty"] == 10  # lowest ease maps to hardest


def test_skips_suspended_cards(tmp_path):
    apkg = patch_collection(build_apkg(tmp_path), ["update cards set queue = -1 where id = (select min(id) from cards)"])
    assert sum(len(d["cards"]) for d in import_apkg(apkg)) == 5  # 6 cards minus one suspended


def test_reads_modern_zstd_packages(tmp_path):
    decks = import_apkg(patch_collection(build_apkg(tmp_path), [], modern=True))
    assert [d["name"] for d in decks] == ["AWS"]
    assert cards_by_front(decks)["___ retrieval takes 1-5 minutes."]["topic"] == "Storage / S3"


def zip_with(name: str, content: bytes) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(name, content)
    return out.getvalue()


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (b"not a zip", "not a valid Anki package"),
        (zip_with("notes.txt", b"hi"), "not an Anki package"),
        (zip_with("collection.anki2", b"garbage, not sqlite"), "damaged"),
    ],
    ids=["not-zip", "zip-without-collection", "damaged-collection"],
)
def test_rejects_bad_packages(data, message):
    with pytest.raises(AnkiError, match=message):
        import_apkg(data)


def test_export_round_trips_through_import():
    cards = [
        {"id": "c1", "front": "What is <S3>?", "back": "Object storage.\nDurable.", "topic": "Cloud storage"},
        {"id": "c2", "front": "duy trì", "back": "to maintain", "topic": ""},
    ]
    decks = import_apkg(export_apkg("Stackd deck", cards))
    assert [d["name"] for d in decks] == ["Stackd deck"]
    back = cards_by_front(decks)
    assert back["What is <S3>?"]["back"] == "Object storage.\nDurable."  # escaped on export, unescaped on import
    assert back["What is <S3>?"]["topic"] == "Cloud_storage"  # Anki tags cannot hold spaces
    assert back["duy trì"]["back"] == "to maintain"


def test_export_is_stable_for_reimport():
    """Same card ids, same note guids: re-importing into Anki updates notes instead of duplicating them."""
    cards = [{"id": "c1", "front": "Q", "back": "A", "topic": ""}]

    def guids(apkg):
        conn = sqlite3.connect(":memory:")
        conn.deserialize(zipfile.ZipFile(io.BytesIO(apkg)).read("collection.anki2"))
        return [r[0] for r in conn.execute("select guid from notes")]

    assert guids(export_apkg("D", cards)) == guids(export_apkg("D", cards))
