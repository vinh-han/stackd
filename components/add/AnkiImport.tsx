"use client";

import Link from "next/link";
import { useState } from "react";
import { importAnki, MAX_APKG_BYTES } from "@/lib/anki";
import { plural } from "@/lib/format";
import { store } from "@/lib/store";
import ui from "../ui.module.css";
import styles from "../pages.module.css";

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; decks: { id: string; name: string; cards: number }[]; scheduled: number }
  | { kind: "error"; message: string };

/** Anki import, free forever: every Anki user is a qualified lead. Reviewed cards keep their schedule. */
export function AnkiImport() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const run = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_APKG_BYTES) {
      setStatus({ kind: "error", message: "Anki package is larger than 100 MB. Export it without media and try again." });
      return;
    }
    setStatus({ kind: "busy" });
    try {
      const imported = await importAnki(file);
      // shortcut: every import makes new decks, so importing the same file twice duplicates it. Merge by note id if users ask.
      const decks = imported.map(({ name, cards }) => {
        const deck = store.createDeck({ name });
        store.addCards(cards.map((c) => ({ deckId: deck.id, type: c.type, topic: c.topic, front: c.front, back: c.back, sourceRef: `Anki: ${file.name}`, srs: c.srs })));
        return { id: deck.id, name, cards: cards.length };
      });
      setStatus({ kind: "done", decks, scheduled: imported.reduce((n, d) => n + d.cards.filter((c) => c.srs).length, 0) });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Could not import this file." });
    }
  };

  return (
    <section>
      <h2 className={styles.sectionLabel}>OR IMPORT FROM ANKI</h2>
      <div className={styles.formFoot}>
        <label className={ui.outlineBtn} aria-disabled={status.kind === "busy"}>
          {status.kind === "busy" ? "Importing..." : "Choose .apkg file"}
          <input
            type="file"
            accept=".apkg"
            className={styles.fileInput}
            disabled={status.kind === "busy"}
            onChange={(e) => {
              run(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <span className={styles.muted}>In Anki: File, Export, &quot;Anki Deck Package&quot;. Review progress comes with it.</span>
      </div>
      {status.kind === "done" && (
        <div className={styles.notice} role="status">
          Imported {plural(status.decks.reduce((n, d) => n + d.cards, 0), "card")} into{" "}
          {status.decks.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ", "}
              <Link href={`/deck/${d.id}`} className={ui.textBtn}>
                {d.name}
              </Link>
            </span>
          ))}
          . {status.scheduled > 0 && `${plural(status.scheduled, "card")} kept their Anki schedule.`}
        </div>
      )}
      {status.kind === "error" && (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
          {status.message}
        </div>
      )}
    </section>
  );
}
