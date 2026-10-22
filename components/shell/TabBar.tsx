"use client";

import Link from "next/link";
import styles from "./shell.module.css";

type Tab = "today" | "decks" | "search" | "add";

interface Props {
  active: string;
  addHref: string;
  onDecks: () => void;
  onSearch: () => void;
}

/** Phones (design 4d): four places, always in the same spot. The active one gets a short bar above its label. */
export function TabBar({ active, addHref, onDecks, onSearch }: Props) {
  const item = (label: string) => (
    <>
      <span className={styles.tabBar} />
      <span className={styles.tabLabel}>{label}</span>
    </>
  );
  const cls = (tab: Tab) => `${styles.tab} ${active === tab ? styles.tabOn : ""}`;

  return (
    <nav className={styles.tabs} aria-label="Main">
      <Link href="/" className={cls("today")} aria-current={active === "today" ? "page" : undefined}>
        {item("Today")}
      </Link>
      <button type="button" className={cls("decks")} onClick={onDecks}>
        {item("Decks")}
      </button>
      <button type="button" className={cls("search")} onClick={onSearch}>
        {item("Search")}
      </button>
      <Link href={addHref} className={cls("add")} aria-current={active === "add" ? "page" : undefined}>
        {item("Add")}
      </Link>
    </nav>
  );
}
