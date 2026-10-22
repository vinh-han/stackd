"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addHref as addLink } from "@/lib/links";
import { isDue } from "@/lib/scheduler";
import { useAccount, useStore } from "@/lib/store";
import { useNow } from "../ClientOnly";
import { Logo } from "../Logo";
import ui from "../ui.module.css";
import { Avatar } from "./Avatar";
import { DecksSheet } from "./DecksSheet";
import { Search } from "./Search";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import styles from "./shell.module.css";

export type Section = "today" | "decks" | "add" | "account" | "review";

interface Props {
  section: Section;
  activeDeckId?: string;
  /** Sets --accent-h for the page: the deck's hue on deck pages and in review. */
  accentHue?: number;
  /** Where R goes; leave out to turn R off. */
  reviewHref?: string;
  /** Phones: logo and avatar on top. Deck pages draw their own header instead. */
  mobileTop?: boolean;
  /** Phones: bottom tab bar. Off in review mode, which is full screen. */
  tabs?: boolean;
  /** Extra sidebar sections, under the deck list. */
  sidebarExtra?: React.ReactNode;
  children: React.ReactNode;
}

const typing = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable]");

/** Sidebar on desktop, tab bar on phones, search and the global shortcuts everywhere. */
export function AppShell({ section, activeDeckId, accentHue, reviewHref, mobileTop = true, tabs = true, sidebarExtra, children }: Props) {
  const state = useStore();
  const account = useAccount();
  const tick = useNow();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [decksOpen, setDecksOpen] = useState(false);

  const dueCounts = useMemo(() => {
    // Cards created after the last clock tick are due "now" too, so never compare against a stale time.
    const at = new Date(Math.max(tick.getTime(), Date.now()));
    const counts: Record<string, number> = {};
    for (const c of state.cards) if (isDue(c, at)) counts[c.deckId] = (counts[c.deckId] ?? 0) + 1;
    return counts;
  }, [state.cards, tick]);

  const add = section === "review" ? undefined : addLink(activeDeckId);

  // "/" search, N add, R review. Off while typing, and while a sheet or the search dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === "/") setSearchOpen(true);
      else if (key === "n" && add) router.push(add);
      else if (key === "r" && reviewHref) router.push(reviewHref);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [add, reviewHref, router]);

  const style = accentHue === undefined ? undefined : ({ "--accent-h": accentHue } as CSSProperties);

  return (
    <div className={`${ui.app} ${tabs ? styles.withTabs : ""}`} style={style} data-accent={accentHue === undefined ? undefined : ""}>
      <Sidebar
        decks={state.decks}
        dueCounts={dueCounts}
        section={section}
        activeDeckId={activeDeckId}
        account={account}
        addHref={add ?? addLink()}
        onSearch={() => setSearchOpen(true)}
      >
        {sidebarExtra}
      </Sidebar>
      <div className={styles.column}>
        {mobileTop && (
          <header className={`${styles.mTop} ${ui.mobileOnly}`}>
            <Link href="/" aria-label="Today">
              <Logo size={22} wordmark={17} />
            </Link>
            <span className={styles.grow} />
            <Link href="/account" className={ui.tap} aria-label="Account and plan">
              <Avatar account={account} size={34} />
            </Link>
          </header>
        )}
        <main className={`${ui.main} ${styles.main}`}>{children}</main>
        {tabs && (
          <TabBar
            active={searchOpen ? "search" : decksOpen ? "decks" : section}
            addHref={add ?? addLink()}
            onDecks={() => setDecksOpen(true)}
            onSearch={() => setSearchOpen(true)}
          />
        )}
      </div>
      {searchOpen && <Search tabs={tabs} onClose={() => setSearchOpen(false)} />}
      {decksOpen && <DecksSheet decks={state.decks} dueCounts={dueCounts} onClose={() => setDecksOpen(false)} />}
    </div>
  );
}
