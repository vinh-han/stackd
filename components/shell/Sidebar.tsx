"use client";

import Link from "next/link";
import { deckHref } from "@/lib/links";
import type { Account } from "@/lib/store";
import type { Deck } from "@/lib/types";
import { Logo } from "../Logo";
import type { Section } from "./AppShell";
import { Avatar, displayName } from "./Avatar";
import styles from "./shell.module.css";

interface Props {
  decks: Deck[];
  dueCounts: Record<string, number>;
  section: Section;
  activeDeckId?: string;
  account: Account | null;
  addHref: string;
  onSearch: () => void;
  children?: React.ReactNode;
}

/** Desktop navigation (design 4b). Decks open their overview; review starts from the page, never from here. */
export function Sidebar({ decks, dueCounts, section, activeDeckId, account, addHref, onSearch, children }: Props) {
  const totalDue = Object.values(dueCounts).reduce((a, b) => a + b, 0);
  const today = section === "today";

  return (
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand} aria-label="Today">
        <Logo size={24} wordmark={18} />
      </Link>

      <button type="button" className={styles.searchField} onClick={onSearch}>
        <span className={styles.grow}>Search</span>
        <span className={styles.slash}>/</span>
      </button>

      <nav className={styles.group} aria-label="Main">
        <Link href="/" className={`${styles.item} ${today ? styles.itemOn : ""}`} aria-current={today ? "page" : undefined}>
          <span className={styles.itemName}>Today</span>
          <span className={styles.count}>{totalDue}</span>
        </Link>
        <Link href={addHref} className={`${styles.item} ${section === "add" ? styles.itemOn : ""}`}>
          <span className={`${styles.itemName} ${styles.itemSoft}`}>Add cards</span>
          <span className={styles.key}>N</span>
        </Link>
      </nav>

      <nav className={styles.group} aria-label="Decks">
        <div className={styles.label}>DECKS</div>
        {decks.map((d) => {
          const on = d.id === activeDeckId;
          const due = dueCounts[d.id] ?? 0;
          return (
            <Link
              key={d.id}
              href={deckHref(d.id)}
              className={`${styles.item} ${on ? styles.itemOn : ""}`}
              aria-current={on ? "page" : undefined}
            >
              <span className={styles.itemName}>{d.name}</span>
              <span className={`${styles.count} ${due === 0 ? styles.countZero : ""}`}>{due}</span>
            </Link>
          );
        })}
        <Link href="/add?deck=new" className={styles.newDeck}>
          New deck
        </Link>
      </nav>

      {children}

      <Link href="/account" className={`${styles.account} ${section === "account" ? styles.accountOn : ""}`}>
        <Avatar account={account} size={28} />
        <span className={styles.accountText}>
          <span className={styles.accountName}>{displayName(account)}</span>
          <span className={styles.accountSub}>Account and plan</span>
        </span>
      </Link>
    </aside>
  );
}
