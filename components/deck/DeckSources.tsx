"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { dayMonth, plural } from "@/lib/format";
import { addHref } from "@/lib/links";
import { useStore } from "@/lib/store";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import { DeckFrame, DeckNotFound } from "./DeckFrame";
import styles from "./tabs.module.css";

/** Sources tab: everything this deck was made from, with how many cards each one produced. */
export function DeckSources({ id, focusId }: { id: string; focusId?: string }) {
  const state = useStore();
  const deck = state.decks.find((d) => d.id === id);

  const { rows, unsourced } = useMemo(() => {
    const perSource = new Map<string, number>();
    let none = 0;
    for (const c of state.cards) {
      if (c.deckId !== id) continue;
      if (c.sourceId) perSource.set(c.sourceId, (perSource.get(c.sourceId) ?? 0) + 1);
      else none++;
    }
    const list = state.sources
      .filter((s) => s.deckId === id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((source) => ({ source, count: perSource.get(source.id) ?? 0 }));
    return { rows: list, unsourced: none };
  }, [state.cards, state.sources, id]);

  // Opened from search: bring that source into view.
  useEffect(() => {
    if (focusId) document.getElementById(`source-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  if (!deck) return <DeckNotFound />;

  return (
    <DeckFrame deck={deck} tab="sources">
      <div className={pages.scroll}>
        <div className={styles.page}>
          {rows.length === 0 ? (
            <p className={styles.empty}>
              No sources yet. Cards made from pasted text or an uploaded file list it here.{" "}
              <Link href={addHref(id)} className={ui.textBtn}>
                Add cards
              </Link>
            </p>
          ) : (
            <div className={styles.list}>
              {rows.map(({ source, count }) => (
                <div
                  key={source.id}
                  id={`source-${source.id}`}
                  className={`${styles.row} ${source.id === focusId ? styles.rowOn : ""}`}
                >
                  <div className={styles.rowText}>
                    <div className={styles.rowName}>{source.title}</div>
                    <div className={styles.rowMeta}>
                      {source.kind === "file" ? "File" : "Pasted text"}, added {dayMonth.format(source.createdAt)}
                    </div>
                  </div>
                  <span className={styles.rowCount}>{plural(count, "card")}</span>
                </div>
              ))}
            </div>
          )}
          {unsourced > 0 && (
            <p className={styles.hint}>
              {plural(unsourced, "card")} {unsourced === 1 ? "has" : "have"} no source: written by hand or imported from Anki.
            </p>
          )}
        </div>
      </div>
    </DeckFrame>
  );
}
