"use client";

import Link from "next/link";
import { deckHref } from "@/lib/links";
import type { Deck } from "@/lib/types";
import { Sheet } from "../Sheet";
import styles from "./shell.module.css";

/** Decks tab on phones: every deck with its due count, and a way to start a new one. */
export function DecksSheet({ decks, dueCounts, onClose }: { decks: Deck[]; dueCounts: Record<string, number>; onClose: () => void }) {
  return (
    <Sheet title="Decks" onClose={onClose}>
      <div className={styles.sheetList}>
        {decks.map((d) => (
          <Link key={d.id} href={deckHref(d.id)} className={styles.sheetRow} onClick={onClose}>
            <span className={styles.sheetName}>{d.name}</span>
            <span className={`${styles.count} ${dueCounts[d.id] ? "" : styles.countZero}`}>{dueCounts[d.id] ?? 0}</span>
          </Link>
        ))}
        <Link href="/add?deck=new" className={`${styles.sheetRow} ${styles.sheetNew}`} onClick={onClose}>
          New deck
        </Link>
      </div>
    </Sheet>
  );
}
