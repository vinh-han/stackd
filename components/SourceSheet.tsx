"use client";

import { useEffect, useRef } from "react";
import type { Source, StudyCard } from "@/lib/types";
import ui from "./ui.module.css";
import styles from "./SourceSheet.module.css";

interface Props {
  card: StudyCard;
  source?: Source;
  onClose: () => void;
}

/** Shows the chunk a card came from, with its supporting quote marked, so users can check AI output. */
export function SourceSheet({ card, source, onClose }: Props) {
  const markRef = useRef<HTMLElement>(null);
  const chunk = source && card.chunkIndex !== undefined ? source.chunks[card.chunkIndex] : undefined;
  const at = chunk && card.sourceQuote ? chunk.indexOf(card.sourceQuote) : -1;

  // Once on open: re-scrolling on re-render would yank the reader back to the quote.
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={ui.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={ui.sheet} role="dialog" aria-modal="true" aria-label="Source">
        <div className={ui.sheetTitle}>{card.sourceRef}</div>
        {chunk ? (
          <div className={styles.passage}>
            {at >= 0 ? (
              <>
                {chunk.slice(0, at)}
                <mark ref={markRef} className={styles.mark}>
                  {card.sourceQuote}
                </mark>
                {chunk.slice(at + card.sourceQuote!.length)}
              </>
            ) : (
              chunk
            )}
          </div>
        ) : (
          <p className={styles.missing}>The original text for this card is not stored.</p>
        )}
        {chunk && at < 0 && <p className={styles.missing}>No supporting quote was found for this card. Check it against the passage.</p>}
        <div className={ui.sheetActions}>
          <button type="button" className={ui.primaryBtn} onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
