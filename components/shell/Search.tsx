"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { State } from "ts-fsrs";
import { startOfDay } from "@/lib/format";
import { deckHref, here, reviewHref } from "@/lib/links";
import { search } from "@/lib/search";
import { useStore } from "@/lib/store";
import type { Deck, StudyCard } from "@/lib/types";
import { useIsDesktop } from "../ClientOnly";
import styles from "./search.module.css";

/** Cards listed before "See all N". */
const CARD_LIMIT = 5;
/** Review ids travel in the URL, so a huge result set is cut here. */
const REVIEW_LIMIT = 200;
const DAY = 24 * 60 * 60 * 1000;

function dueLabel(card: StudyCard, now: Date): string {
  if (card.suspended) return "suspended";
  if (card.srs.state === State.New) return "new";
  const days = Math.round((startOfDay(card.srs.due) - startOfDay(now)) / DAY);
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

interface Item {
  key: string;
  href: string;
  render: (active: boolean) => React.ReactNode;
}

/**
 * One box for cards, decks, topics and sources (designs 4c and 4f). A dialog on desktop, full screen above the
 * tab bar on phones. Up and down move, Enter opens, R (after moving) reviews every matching card.
 */
export function Search({ tabs, onClose }: { tabs: boolean; onClose: () => void }) {
  const { decks, cards, sources } = useStore();
  const router = useRouter();
  const desktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // R types into the box until the user starts moving through results with the arrow keys.
  const [navigating, setNavigating] = useState(false);
  const deferred = useDeferredValue(query);
  const results = useMemo(() => search({ decks, cards, sources }, deferred), [decks, cards, sources, deferred]);
  const listRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const shownCards = results.cards.slice(0, CARD_LIMIT);
  // "See all" points at the deck with the most matches, where the Cards tab shows the rest.
  const seeAll = useMemo(() => {
    if (results.cards.length <= CARD_LIMIT) return null;
    const per = new Map<string, number>();
    for (const c of results.cards) per.set(c.deckId, (per.get(c.deckId) ?? 0) + 1);
    const [deckId, count] = [...per].sort((a, b) => b[1] - a[1])[0];
    return { deck: decksById.get(deckId)!, count };
  }, [results.cards, decksById]);

  const cardItems: Item[] = shownCards.map((c) => {
    const deck = decksById.get(c.deckId)!;
    return {
      key: `c${c.id}`,
      href: `${deckHref(c.deckId, "cards")}?card=${c.id}`,
      render: (on) => <CardRow card={c} deck={deck} now={now} active={on} desktop={desktop} />,
    };
  });
  if (seeAll) {
    cardItems.push({
      key: "all",
      href: `${deckHref(seeAll.deck.id, "cards")}?q=${encodeURIComponent(query.trim())}`,
      render: () => (
        <span className={styles.seeAll}>
          See all {seeAll.count} in {seeAll.deck.name} / Cards
        </span>
      ),
    });
  }
  const otherItems: Item[] = [
    ...results.decks.map(({ deck, count }) => ({
      key: `d${deck.id}`,
      href: deckHref(deck.id),
      render: () => <NameRow name={deck.name} meta={desktop ? `deck / ${count} cards` : `Deck, ${count} cards`} />,
    })),
    ...results.topics.map(({ deck, name, count }) => ({
      key: `t${deck.id}\n${name}`,
      href: `${deckHref(deck.id, "cards")}?topic=${encodeURIComponent(name)}`,
      render: () => <NameRow name={name} meta={desktop ? `topic / ${count} cards` : `${deck.name}, ${count} cards`} />,
    })),
    ...results.sources.map(({ deck, source, count }) => ({
      key: `s${source.id}`,
      href: `${deckHref(deck.id, "sources")}?source=${source.id}`,
      render: () => <NameRow name={source.title} meta={desktop ? `source / ${count} cards` : `${deck.name}, ${count} cards`} />,
    })),
  ];
  const items = [...cardItems, ...otherItems];
  const otherLabel = [results.decks.length && "DECKS", results.topics.length && "TOPICS", results.sources.length && "SOURCES"]
    .filter(Boolean)
    .join(", ")
    .replace(/, ([A-Z]+)$/, " AND $1");

  useEffect(() => {
    setActive(0);
    setNavigating(false);
  }, [deferred]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const reviewMatches = () => {
    const ids = results.cards.filter((c) => !c.suspended).map((c) => c.id);
    if (ids.length > 0) go(reviewHref({ ids: ids.slice(0, REVIEW_LIMIT), from: here() }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      setNavigating(true);
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) go(items[active].href);
    } else if (navigating && e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      reviewMatches();
    }
  };

  const list = (group: Item[], offset: number) =>
    group.map((item, i) => (
      <button
        key={item.key}
        type="button"
        role="option"
        aria-selected={active === offset + i}
        data-active={active === offset + i}
        className={`${styles.item} ${active === offset + i ? styles.itemOn : ""}`}
        onMouseMove={() => active !== offset + i && setActive(offset + i)}
        onClick={() => go(item.href)}
      >
        {item.render(active === offset + i)}
      </button>
    ));

  return (
    <div className={`${styles.scrim} ${tabs ? "" : styles.noTabs}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className={styles.head}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards, decks, topics, sources"
            aria-label="Search"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <span className={styles.esc}>ESC</span>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className={styles.note}>Matches with or without tone marks.</div>
        <div className={styles.results} ref={listRef} role="listbox" aria-label="Results">
          {cardItems.length > 0 && (
            <>
              <div className={styles.label}>CARDS / {results.cards.length}</div>
              {list(cardItems, 0)}
            </>
          )}
          {otherItems.length > 0 && (
            <>
              <div className={`${styles.label} ${cardItems.length > 0 ? styles.labelGap : ""}`}>{otherLabel}</div>
              {list(otherItems, cardItems.length)}
            </>
          )}
          {deferred.trim() && items.length === 0 && <div className={styles.empty}>Nothing matches &quot;{deferred.trim()}&quot;.</div>}
        </div>
        {items.length > 0 && (
          <div className={styles.foot}>
            <span>up / down to move</span>
            <span>enter to open</span>
            <span>R to review results</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CardRow({ card, deck, now, active, desktop }: { card: StudyCard; deck: Deck; now: Date; active: boolean; desktop: boolean }) {
  const due = dueLabel(card, now);
  return (
    <>
      <span className={styles.front} lang={deck.lang}>
        {card.front}
      </span>
      {/* Desktop shows the answer for the highlighted card only; phones show it for every card. */}
      {(active || !desktop) && (
        <span className={styles.back} lang={deck.lang}>
          {card.back}
        </span>
      )}
      <span className={styles.meta}>{desktop ? `${deck.name} / ${card.topic} / ${due}` : `${deck.name}, ${due}`}</span>
    </>
  );
}

function NameRow({ name, meta }: { name: string; meta: string }) {
  return (
    <span className={styles.nameRow}>
      <span className={styles.name}>{name}</span>
      <span className={styles.nameMeta}>{meta}</span>
    </span>
  );
}
