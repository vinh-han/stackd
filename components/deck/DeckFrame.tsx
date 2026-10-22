"use client";

import Link from "next/link";
import { useMemo } from "react";
import { deckHref, reviewHref, type DeckTab } from "@/lib/links";
import { isDue } from "@/lib/scheduler";
import { useStore } from "@/lib/store";
import type { Deck } from "@/lib/types";
import { useNow } from "../ClientOnly";
import { AppShell } from "../shell/AppShell";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import styles from "./frame.module.css";

const TABS: readonly { key: DeckTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "cards", label: "Cards" },
  { key: "sources", label: "Sources" },
  { key: "settings", label: "Settings" },
];

interface Props {
  deck: Deck;
  tab: DeckTab;
  sidebarExtra?: React.ReactNode;
  children: React.ReactNode;
}

/** Every deck tab (designs 4c, 4e): breadcrumb, name, Review, then the tabs; each tab is its own URL. */
export function DeckFrame({ deck, tab, sidebarExtra, children }: Props) {
  const { cards, sources } = useStore();
  const tick = useNow();
  const counts = useMemo(() => {
    const now = new Date(Math.max(tick.getTime(), Date.now()));
    let total = 0;
    let due = 0;
    for (const c of cards) {
      if (c.deckId !== deck.id) continue;
      total++;
      if (isDue(c, now)) due++;
    }
    return { total, due, sources: sources.filter((s) => s.deckId === deck.id).length };
  }, [cards, sources, deck.id, tick]);

  const review = counts.due > 0 ? reviewHref({ deck: deck.id, from: deckHref(deck.id, tab) }) : undefined;
  const tabCount: Partial<Record<DeckTab, number>> = { cards: counts.total, sources: counts.sources };
  const here = TABS.find((t) => t.key === tab)!;

  return (
    <AppShell section="decks" activeDeckId={deck.id} accentHue={deck.accentHue} reviewHref={review} mobileTop={false} sidebarExtra={sidebarExtra}>
      <header className={styles.head}>
        <div className={`${styles.crumbs} ${ui.desktopOnly}`}>
          <Link href="/" className={styles.crumbLink}>
            Decks
          </Link>
          <span>/</span>
          <Link href={deckHref(deck.id)} className={styles.crumbHere}>
            {deck.name}
          </Link>
          <span>/</span>
          <span className={styles.crumbHere}>{here.label}</span>
        </div>
        <Link href="/" className={`${styles.mBack} ${ui.mobileOnly} ${ui.tap}`}>
          Decks
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{deck.name}</h1>
          {review && (
            <Link href={review} className={`${styles.review} ${ui.desktopOnly}`}>
              Review {counts.due}
            </Link>
          )}
        </div>
        <nav className={`${styles.tabs} ${ui.desktopOnly}`} aria-label="Deck">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={deckHref(deck.id, t.key)}
              className={`${styles.tab} ${t.key === tab ? styles.tabOn : ""}`}
              aria-current={t.key === tab ? "page" : undefined}
            >
              {t.label}
              {tabCount[t.key] !== undefined && <span className={styles.tabCount}>{tabCount[t.key]}</span>}
            </Link>
          ))}
        </nav>
        <nav className={`${styles.segments} ${ui.mobileOnly}`} aria-label="Deck">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={deckHref(deck.id, t.key)}
              className={`${styles.segment} ${t.key === "settings" ? styles.segmentMore : ""} ${t.key === tab ? styles.segmentOn : ""} ${ui.tap}`}
              aria-current={t.key === tab ? "page" : undefined}
              aria-label={t.key === "settings" ? "Settings" : undefined}
            >
              {t.key === "settings" ? "..." : t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </AppShell>
  );
}

export function DeckNotFound() {
  return (
    <AppShell section="decks">
      <div className={pages.page}>
        <h1 className={pages.h1}>Deck not found</h1>
        <p className={pages.lede}>
          It may have been deleted.{" "}
          <Link href="/" className={ui.textBtn}>
            Back to Today
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
