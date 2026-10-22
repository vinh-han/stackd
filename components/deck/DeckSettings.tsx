"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { exportAnki } from "@/lib/anki";
import { dayMonth, daysUntil, fromDateInput, plural, startOfDay, toDateInput } from "@/lib/format";
import { store, useStore } from "@/lib/store";
import { useNow } from "../ClientOnly";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import { DeckFrame, DeckNotFound } from "./DeckFrame";
import d from "./deck.module.css";
import styles from "./tabs.module.css";

/** "Vietnamese" for "vi"; the tag itself when the browser does not know it. */
function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** Settings tab: name, exam date, card language, Anki export, delete. */
export function DeckSettingsPage({ id }: { id: string }) {
  const state = useStore();
  const now = useNow();
  const router = useRouter();
  const deck = state.decks.find((x) => x.id === id);
  const deckCards = useMemo(() => state.cards.filter((c) => c.deckId === id), [state.cards, id]);
  const [editingDate, setEditingDate] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!deck) return <DeckNotFound />;

  const exam = deck.examDate;
  const past = exam && startOfDay(exam) < startOfDay(now);
  const days = exam ? daysUntil(exam, now) : 0;

  const doExport = () => {
    setExportError(null);
    exportAnki(deck, deckCards).catch((err: Error) => setExportError(err.message));
  };

  const deleteDeck = () => {
    if (!window.confirm(`Delete "${deck.name}" and its ${plural(deckCards.length, "card")}? This cannot be undone.`)) return;
    store.deleteDeck(deck.id);
    router.replace("/");
  };

  return (
    <DeckFrame deck={deck} tab="settings">
      <div className={pages.scroll}>
        <div className={styles.page}>
          <label className={ui.field}>
            <span className={ui.fieldLabel}>NAME</span>
            <input
              key={deck.name}
              className={ui.input}
              defaultValue={deck.name}
              maxLength={200}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== deck.name) store.updateDeck(deck.id, { name });
                else e.target.value = deck.name;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.currentTarget.value = deck.name;
                if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              }}
            />
          </label>

          <div className={d.exam}>
            {editingDate ? (
              <label className={`${ui.field} ${d.examMain}`}>
                <span className={ui.fieldLabel}>EXAM DATE</span>
                <input
                  type="date"
                  className={ui.input}
                  autoFocus
                  defaultValue={toDateInput(exam)}
                  onChange={(e) => store.updateDeck(deck.id, { examDate: fromDateInput(e.target.value) })}
                  onBlur={() => setEditingDate(false)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
                />
              </label>
            ) : (
              <>
                <div className={d.examMain}>
                  <div className={d.examDays}>
                    {!exam ? "No exam date" : past ? "Exam passed" : days === 0 ? "Exam today" : `${plural(days, "day")} left`}
                  </div>
                  <div className={d.examDate}>{exam ? `Exam on ${dayMonth.format(exam)}` : "Set one to count down to it"}</div>
                </div>
                <button type="button" className={`${ui.textBtn} ${ui.tap} ${d.sideBtn}`} onClick={() => setEditingDate(true)}>
                  {exam ? "Change" : "Set"}
                </button>
              </>
            )}
          </div>

          <label className={ui.field}>
            <span className={ui.fieldLabel}>CARD LANGUAGE</span>
            <input
              key={deck.lang ?? ""}
              className={ui.input}
              defaultValue={deck.lang ?? ""}
              placeholder="Same as source, or a code like vi, fr"
              maxLength={10}
              onBlur={(e) => store.updateDeck(deck.id, { lang: e.target.value.trim().toLowerCase() || undefined })}
              onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
            />
            {deck.lang && <span className={styles.hint}>{languageName(deck.lang)}</span>}
          </label>

          <section className={styles.block}>
            <div className={ui.fieldLabel}>ANKI</div>
            <p className={styles.hint}>Download this deck as an .apkg file. Exporting again updates the same notes in Anki.</p>
            <div>
              <button type="button" className={ui.outlineBtn} onClick={doExport} disabled={deckCards.length === 0}>
                Export to Anki
              </button>
            </div>
            {exportError && (
              <div className={`${pages.notice} ${pages.noticeError}`} role="alert">
                {exportError}
              </div>
            )}
          </section>

          <section className={styles.block}>
            <div className={ui.fieldLabel}>DELETE</div>
            <p className={styles.hint}>Removes the deck, its {plural(deckCards.length, "card")} and their review history.</p>
            <div>
              <button type="button" className={`${ui.outlineBtn} ${ui.dangerText}`} onClick={deleteDeck}>
                Delete deck
              </button>
            </div>
          </section>
        </div>
      </div>
    </DeckFrame>
  );
}
