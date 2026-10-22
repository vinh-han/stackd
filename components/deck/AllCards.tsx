"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { State } from "ts-fsrs";
import {
  cardTag,
  dueDay,
  FILTERS,
  matchesFilter,
  sortCards,
  SORTS,
  type CardFilter,
  type CardSort,
} from "@/lib/deck-stats";
import { plural } from "@/lib/format";
import { isDue, topicStats } from "@/lib/scheduler";
import { store, useStore } from "@/lib/store";
import type { Deck, Source, StudyCard } from "@/lib/types";
import { useIsDesktop, useNow } from "../ClientOnly";
import { EditSheet, useCardEditor } from "../EditSheet";
import { Rail } from "../Rail";
import { Sheet } from "../Sheet";
import { SourceSheet } from "../SourceSheet";
import ui from "../ui.module.css";
import pages from "../pages.module.css";
import d from "./deck.module.css";
import styles from "./cards.module.css";

type View = "grid" | "table" | "topics";

const VIEWS: readonly { key: View; label: string }[] = [
  { key: "grid", label: "Grid" },
  { key: "table", label: "Table" },
  { key: "topics", label: "Topics" },
];

const VIEW_KEY = "stackd:cards-view";
/** Cards shown per topic before "Show N more". */
const TOPIC_PREVIEW = 4;

function savedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "table" || v === "topics" ? v : "grid";
  } catch {
    return "grid";
  }
}

/** "Leech", "Due today", "Tomorrow", "in 21d". */
function statusLabel(card: StudyCard, now: Date): string {
  const tag = cardTag(card);
  if (tag) return tag;
  const day = dueDay(card.srs.due, now);
  return day === "Today" ? "Due today" : day;
}

const confirmCount = (n: number) => (n === 1 ? "this card" : `these ${n} cards`);

export function AllCards({ id }: { id: string }) {
  const state = useStore();
  const tick = useNow();
  // A card reset or added since the last tick is due at once; comparing against the stale tick would hide it.
  const now = useMemo(() => new Date(Math.max(tick.getTime(), Date.now())), [tick, state.cards]);
  const router = useRouter();
  const desktop = useIsDesktop();
  const deck = state.decks.find((x) => x.id === id);

  const [view, setView] = useState<View>(savedView);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CardFilter>("all");
  const [sort, setSort] = useState<CardSort>("hardest");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** Grid and mobile: taps pick cards instead of flipping or opening them. Table always has checkboxes. */
  const [selecting, setSelecting] = useState(false);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [inlineId, setInlineId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<StudyCard | null>(null);
  const [viewing, setViewing] = useState<StudyCard | null>(null);
  const [moreFor, setMoreFor] = useState<StudyCard | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const deckCards = useMemo(() => state.cards.filter((c) => c.deckId === id), [state.cards, id]);
  const counts = useMemo(() => {
    const out = {} as Record<CardFilter, number>;
    for (const f of FILTERS) out[f.key] = deckCards.filter((c) => matchesFilter(c, f.key, now)).length;
    return out;
  }, [deckCards, now]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = deckCards.filter(
      (c) => matchesFilter(c, filter, now) && (!q || `${c.front} ${c.back} ${c.topic}`.toLowerCase().includes(q)),
    );
    return sortCards(list, sort);
  }, [deckCards, filter, query, sort, now]);
  const groups = useMemo(() => {
    const byTopic = new Map<string, StudyCard[]>();
    for (const c of visible) {
      const list = byTopic.get(c.topic);
      if (list) list.push(c);
      else byTopic.set(c.topic, [c]);
    }
    return topicStats(deckCards)
      .sort((a, b) => a.mastery - b.mastery)
      .filter((t) => byTopic.has(t.name))
      .map((t) => ({ ...t, due: deckCards.filter((c) => c.topic === t.name && isDue(c, now)).length, cards: byTopic.get(t.name)! }));
  }, [visible, deckCards, now]);

  // Bulk actions only touch picked cards that are on screen, never ones hidden by a filter or search.
  const picked = useMemo(() => visible.filter((c) => selected.has(c.id)), [visible, selected]);
  const sourcesById = useMemo(() => new Map(state.sources.map((s) => [s.id, s])), [state.sources]);
  const dueCount = counts.due;

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggle = (cardId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });
  const flip = (cardId: string) =>
    setFlipped((s) => {
      const next = new Set(s);
      if (!next.delete(cardId)) next.add(cardId);
      return next;
    });

  const pickView = (v: View) => {
    setView(v);
    setSelecting(false);
    setInlineId(null);
    clearSelection();
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // private mode: the choice just isn't remembered
    }
  };

  const sheetOpen = !!(editing || viewing || moreFor || filterOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || sheetOpen) return;
      if (selected.size > 0) clearSelection();
      else setSelecting(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, selected.size, clearSelection]);

  // ---------- Actions ----------

  const suspend = (cards: StudyCard[]) => store.setSuspended(cards.map((c) => c.id), !cards.every((c) => c.suspended));
  const reset = (cards: StudyCard[]) => {
    if (!window.confirm(`Reset progress on ${confirmCount(cards.length)}? They start over as new cards.`)) return false;
    store.resetProgress(cards.map((c) => c.id));
    return true;
  };
  const remove = (cards: StudyCard[]) => {
    if (!window.confirm(`Delete ${confirmCount(cards.length)}? This cannot be undone.`)) return false;
    store.deleteCards(cards.map((c) => c.id));
    return true;
  };
  const bulk = {
    count: picked.length,
    allSuspended: picked.length > 0 && picked.every((c) => c.suspended),
    onSuspend: () => {
      suspend(picked);
      clearSelection();
    },
    onReset: () => reset(picked) && clearSelection(),
    onReview: () => router.push(`/review?deck=${id}&cards=${picked.map((c) => c.id).join(",")}`),
    onDelete: () => remove(picked) && clearSelection(),
    onClear: clearSelection,
  };

  if (!deck) {
    return (
      <div className={ui.app}>
        <main className={ui.main}>
          <div className={pages.page}>
            <h1 className={pages.h1}>Deck not found</h1>
            <p className={pages.lede}>
              It may have been deleted. <Link href="/" className={ui.textBtn}>Back to decks</Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const reviewHref = `/review?deck=${id}`;
  const empty =
    deckCards.length === 0 ? (
      <p className={styles.empty}>
        No cards yet. <Link href={`/add?deck=${id}`} className={ui.textBtn}>Add cards</Link>
      </p>
    ) : visible.length === 0 ? (
      <p className={styles.empty}>No cards match.</p>
    ) : null;
  const editingTopic = inlineId ? deckCards.find((c) => c.id === inlineId)?.topic : undefined;

  return (
    <div className={ui.app} style={{ "--accent-h": deck.accentHue } as CSSProperties} data-accent>
      <Rail state={state} now={now} activeDeckId={deck.id} showGoal={false}>
        {desktop && view === "topics" && groups.length > 0 && (
          <nav className={ui.railGroup} aria-label="Topics">
            <div className={ui.railLabel}>JUMP TO TOPIC</div>
            {groups.map((g, i) => (
              <button
                key={g.name}
                type="button"
                className={`${styles.jump} ${g.name === editingTopic ? styles.jumpOn : ""}`}
                onClick={() => document.getElementById(`topic-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <span>{g.name}</span>
                <span className={styles.jumpN}>{g.count}</span>
              </button>
            ))}
          </nav>
        )}
      </Rail>

      <main className={ui.main}>
        {desktop ? (
          <>
            <header className={d.topbar}>
              <Link href={`/deck/${id}`} className={d.crumb}>
                {deck.name}
              </Link>
              <span className={d.crumbSep}>/</span>
              <span className={d.crumbHere}>All cards</span>
              <span className={d.crumbCount}>{deckCards.length}</span>
              <span className={pages.grow} />
              <div className={styles.viewSwitch} role="tablist" aria-label="Layout">
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    role="tab"
                    aria-selected={view === v.key}
                    className={`${styles.viewBtn} ${view === v.key ? styles.viewBtnOn : ""}`}
                    onClick={() => pickView(v.key)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {dueCount > 0 && (
                <Link href={reviewHref} className={`${ui.primaryBtn} ${pages.small}`}>
                  Review {dueCount}
                </Link>
              )}
            </header>

            <div className={styles.body}>
              <div className={styles.toolbar}>
                <input
                  className={`${ui.input} ${styles.search}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search front, back or topic"
                  aria-label="Search cards"
                />
                <FilterChips filter={filter} counts={counts} onPick={setFilter} />
                <span className={pages.grow} />
                <label className={styles.sort}>
                  Sort:
                  <select value={sort} onChange={(e) => setSort(e.target.value as CardSort)}>
                    {SORTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                {view === "grid" && (
                  <button
                    type="button"
                    className={`${styles.selectBtn} ${selecting ? styles.selectBtnOn : ""}`}
                    onClick={() => {
                      setSelecting((s) => !s);
                      clearSelection();
                    }}
                  >
                    {selecting ? "Done" : "Select"}
                  </button>
                )}
              </div>

              <div className={`${styles.list} ${picked.length > 0 ? styles.listBulk : ""}`}>
                {empty}
                {view === "grid" && (
                  <div className={styles.grid}>
                    {visible.map((c) => {
                      const back = flipped.has(c.id);
                      const isPicked = selecting && selected.has(c.id);
                      const act = () => (selecting ? toggle(c.id) : flip(c.id));
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={selecting ? isPicked : back}
                          className={`${styles.tile} ${back ? styles.tileFlipped : ""} ${isPicked ? styles.tilePicked : ""}`}
                          onClick={act}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                            e.preventDefault();
                            act();
                          }}
                        >
                          <div className={styles.tileHead}>
                            <span className={styles.tileTopic}>{c.topic.toUpperCase()}</span>
                            <span className={styles.pill}>{statusLabel(c, now).toUpperCase()}</span>
                          </div>
                          {back && <div className={styles.answerLabel}>ANSWER</div>}
                          <div className={styles.face} lang={deck.lang}>
                            {back ? c.back : c.front}
                          </div>
                          <div className={styles.tileFoot}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(c);
                              }}
                            >
                              Edit
                            </button>
                            {c.sourceId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewing(c);
                                }}
                              >
                                Source
                              </button>
                            )}
                            <span className={styles.flipHint}>
                              {selecting ? (isPicked ? "selected" : "click to select") : back ? "click to flip back" : "click to flip"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {view === "table" && visible.length > 0 && (
                  <div>
                    <div className={`${styles.trow} ${styles.thead}`}>
                      <span />
                      <span>FRONT</span>
                      <span>BACK</span>
                      <span>TOPIC</span>
                      <span>DUE</span>
                      <span>DIFFICULTY</span>
                    </div>
                    {visible.map((c) => (
                      <TableRow
                        key={c.id}
                        card={c}
                        deck={deck}
                        now={now}
                        picked={selected.has(c.id)}
                        onToggle={() => toggle(c.id)}
                        onOpen={() => setEditing(c)}
                      />
                    ))}
                  </div>
                )}

                {view === "topics" &&
                  groups.map((g, i) => {
                    const open = expandedTopics.has(g.name);
                    // Keep the card being edited on screen even when it sits past the preview.
                    const shown = open ? g.cards : g.cards.filter((c, j) => j < TOPIC_PREVIEW || c.id === inlineId);
                    return (
                      <section key={g.name} className={styles.group}>
                        <div id={`topic-${i}`} className={styles.groupHead}>
                          <h2 className={styles.groupName}>{g.name}</h2>
                          <span className={styles.groupMeta}>
                            {plural(g.count, "card")} / {g.due} due
                          </span>
                          <div className={`${ui.bar} ${styles.groupBar}`}>
                            <div className={ui.barFill} style={{ width: `${g.mastery}%` }} />
                          </div>
                          <span className={styles.groupPct}>{g.mastery}%</span>
                          <span className={pages.grow} />
                          <Link href={`/review?deck=${id}&topic=${encodeURIComponent(g.name)}`} className={ui.ghostBtn}>
                            Review this topic
                          </Link>
                        </div>
                        <div className={styles.topicRows}>
                          {shown.map((c) =>
                            c.id === inlineId ? (
                              <InlineEditor
                                key={c.id}
                                card={c}
                                deck={deck}
                                source={c.sourceId ? sourcesById.get(c.sourceId) : undefined}
                                onClose={() => setInlineId(null)}
                                onOpenSource={() => setViewing(c)}
                                onSuspend={() => suspend([c])}
                                onReset={() => reset([c])}
                                onDelete={() => remove([c]) && setInlineId(null)}
                              />
                            ) : (
                              <button key={c.id} type="button" className={styles.crow} onClick={() => setInlineId(c.id)}>
                                <span className={styles.crowFront} lang={deck.lang}>
                                  {c.front}
                                </span>
                                {cardTag(c) && <span className={styles.tag}>{cardTag(c)}</span>}
                                <span className={styles.crowDue}>{dueDay(c.srs.due, now)}</span>
                              </button>
                            ),
                          )}
                          {g.cards.length > TOPIC_PREVIEW && (
                            <button
                              type="button"
                              className={styles.showMore}
                              onClick={() =>
                                setExpandedTopics((s) => {
                                  const next = new Set(s);
                                  if (!next.delete(g.name)) next.add(g.name);
                                  return next;
                                })
                              }
                            >
                              {open ? "Show fewer" : `Show ${g.cards.length - TOPIC_PREVIEW} more`}
                            </button>
                          )}
                        </div>
                      </section>
                    );
                  })}
              </div>

              {picked.length > 0 && <BulkBar {...bulk} />}
            </div>
          </>
        ) : (
          <>
            <header className={`${d.mHead} ${styles.mHead}`}>
              <Link href={`/deck/${id}`} className={`${d.mBack} ${ui.tap}`}>
                Back
              </Link>
              <span className={pages.grow} />
              {deckCards.length > 0 && (
                <button
                  type="button"
                  className={`${d.mBack} ${ui.tap} ${styles.mSelect}`}
                  onClick={() => {
                    setSelecting((s) => !s);
                    setOpenId(null);
                    clearSelection();
                  }}
                >
                  {selecting ? "Done" : "Select"}
                </button>
              )}
            </header>
            <div className={styles.mTop}>
              <div className={styles.mTitleRow}>
                <h1 className={`${pages.h1} ${styles.mTitle}`}>All cards</h1>
                <span className={styles.mCount}>{deckCards.length}</span>
              </div>
              <div className={styles.mSearchRow}>
                <input
                  className={`${ui.input} ${styles.mSearch}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards"
                  aria-label="Search cards"
                />
                <button type="button" className={styles.mFilterBtn} onClick={() => setFilterOpen(true)}>
                  {filter === "all" ? "Filter" : `${FILTERS.find((f) => f.key === filter)!.label} ${counts[filter]}`}
                </button>
              </div>
            </div>
            <div className={styles.mList}>
              {empty}
              {visible.map((c) =>
                !selecting && openId === c.id ? (
                  <div key={c.id} className={styles.mOpen}>
                    <button type="button" className={styles.mFront} style={{ textAlign: "left" }} lang={deck.lang} onClick={() => setOpenId(null)}>
                      {c.front}
                    </button>
                    <div className={styles.mBack} lang={deck.lang}>
                      {c.back}
                    </div>
                    <div className={styles.mActions}>
                      <button type="button" className={styles.mAct} onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      {c.sourceId && (
                        <button type="button" className={styles.mAct} onClick={() => setViewing(c)}>
                          Source
                        </button>
                      )}
                      <button type="button" className={`${styles.mAct} ${styles.mMore}`} onClick={() => setMoreFor(c)}>
                        More
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.mRow}
                    aria-pressed={selecting ? selected.has(c.id) : undefined}
                    onClick={() => (selecting ? toggle(c.id) : setOpenId(c.id))}
                  >
                    {selecting && <span className={`${styles.check} ${selected.has(c.id) ? styles.checkOn : ""}`} />}
                    <span className={styles.mRowBody}>
                      <span className={`${styles.mFront} ${styles.clamp2}`} lang={deck.lang}>
                        {c.front}
                      </span>
                      <span className={styles.mMeta}>
                        <span>{c.topic}</span>
                        <span>{statusLabel(c, now)}</span>
                      </span>
                    </span>
                  </button>
                ),
              )}
            </div>
            {(picked.length > 0 || dueCount > 0) && (
              <div className={styles.mDock}>
                {picked.length > 0 ? (
                  <BulkBar {...bulk} dock />
                ) : (
                  <Link href={reviewHref} className={`${ui.primaryBtn} ${d.dockBtn}`} style={{ width: "100%" }}>
                    Review {dueCount} due
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <EditSheet
          card={editing}
          onSave={(patch) => {
            store.updateCard(editing.id, patch);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {viewing && (
        <SourceSheet card={viewing} source={viewing.sourceId ? sourcesById.get(viewing.sourceId) : undefined} onClose={() => setViewing(null)} />
      )}
      {filterOpen && (
        <Sheet title="Filter" onClose={() => setFilterOpen(false)}>
          <FilterChips filter={filter} counts={counts} onPick={setFilter} inSheet />
          <label className={ui.field}>
            <span className={ui.fieldLabel}>SORT</span>
            <select className={`${ui.input} ${pages.select}`} value={sort} onChange={(e) => setSort(e.target.value as CardSort)}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className={ui.sheetActions}>
            <button type="button" className={ui.primaryBtn} onClick={() => setFilterOpen(false)}>
              Done
            </button>
          </div>
        </Sheet>
      )}
      {moreFor && (
        <Sheet title={moreFor.front} onClose={() => setMoreFor(null)}>
          <div className={styles.sheetList}>
            <button
              type="button"
              className={ui.outlineBtn}
              onClick={() => {
                suspend([moreFor]);
                setMoreFor(null);
              }}
            >
              {moreFor.suspended ? "Unsuspend" : "Suspend"}
            </button>
            <button type="button" className={ui.outlineBtn} onClick={() => reset([moreFor]) && setMoreFor(null)}>
              Reset progress
            </button>
            <button type="button" className={`${ui.outlineBtn} ${ui.dangerText}`} onClick={() => remove([moreFor]) && setMoreFor(null)}>
              Delete
            </button>
            <button type="button" className={ui.textBtn} onClick={() => setMoreFor(null)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function FilterChips({
  filter,
  counts,
  onPick,
  inSheet,
}: {
  filter: CardFilter;
  counts: Record<CardFilter, number>;
  onPick: (f: CardFilter) => void;
  inSheet?: boolean;
}) {
  return (
    <div className={inSheet ? styles.sheetChips : styles.filters} role="group" aria-label="Filter">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          aria-pressed={filter === f.key}
          className={`${styles.filter} ${filter === f.key ? styles.filterOn : ""}`}
          onClick={() => onPick(f.key)}
        >
          {f.label} <span className={styles.filterN}>{counts[f.key]}</span>
        </button>
      ))}
    </div>
  );
}

interface RowProps {
  card: StudyCard;
  deck: Deck;
  now: Date;
  picked: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

function TableRow({ card: c, deck, now, picked, onToggle, onOpen }: RowProps) {
  const tag = cardTag(c);
  const day = dueDay(c.srs.due, now);
  const rated = c.srs.state !== State.New;
  return (
    <div
      className={`${styles.trow} ${styles.tbodyRow} ${picked ? styles.trowPicked : ""} ${c.suspended ? styles.dim : ""}`}
      onClick={onOpen}
    >
      <span className={styles.checkCell}>
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label="Select card"
          className={`${styles.check} ${picked ? styles.checkOn : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      </span>
      <span className={styles.cellFront} lang={deck.lang}>
        {c.front}
      </span>
      <span className={styles.cellBack} lang={deck.lang}>
        {c.back}
      </span>
      <span className={styles.cellTopic}>{c.topic}</span>
      {tag ? (
        <span className={styles.tag}>{tag}</span>
      ) : (
        <span className={`${styles.due} ${day === "Today" || day === "Tomorrow" ? "" : styles.dueLater}`}>{day}</span>
      )}
      {!rated ? (
        <span className={styles.diffNone}>not rated</span>
      ) : c.suspended ? (
        <span className={`${styles.diffNum} ${styles.dueLater}`}>{c.srs.difficulty.toFixed(1)}</span>
      ) : (
        <span className={styles.diff}>
          <span className={styles.diffNum}>{c.srs.difficulty.toFixed(1)}</span>
          <span className={ui.bar}>
            <span className={ui.barFill} style={{ display: "block", width: `${c.srs.difficulty * 10}%` }} />
          </span>
        </span>
      )}
    </div>
  );
}

interface BulkProps {
  count: number;
  allSuspended: boolean;
  onSuspend: () => void;
  onReset: () => void;
  onReview: () => void;
  onDelete: () => void;
  onClear: () => void;
  dock?: boolean;
}

function BulkBar({ count, allSuspended, onSuspend, onReset, onReview, onDelete, onClear, dock }: BulkProps) {
  const actions = (
    <>
      <button type="button" className={styles.bulkBtn} onClick={onSuspend}>
        {allSuspended ? "Unsuspend" : "Suspend"}
      </button>
      <button type="button" className={styles.bulkBtn} onClick={onReset}>
        Reset progress
      </button>
      <button type="button" className={styles.bulkBtn} onClick={onReview}>
        Review these
      </button>
      <button type="button" className={`${styles.bulkBtn} ${styles.bulkDanger}`} onClick={onDelete}>
        Delete
      </button>
    </>
  );
  const clear = (
    <button type="button" className={`${styles.bulkBtn} ${styles.bulkClear}`} onClick={onClear}>
      Clear{!dock && <span className={styles.bulkKbd}>ESC</span>}
    </button>
  );
  if (dock) {
    return (
      <div className={styles.bulkDock} role="toolbar" aria-label="Selected cards">
        <div className={styles.bulkDockHead}>
          <span className={styles.bulkCount}>{count} selected</span>
          {clear}
        </div>
        <div className={styles.bulkDockGrid}>{actions}</div>
      </div>
    );
  }
  return (
    <div className={styles.bulk} role="toolbar" aria-label="Selected cards">
      <span className={styles.bulkCount}>{count} selected</span>
      {actions}
      <span className={styles.bulkSep} />
      {clear}
    </div>
  );
}

interface EditorProps {
  card: StudyCard;
  deck: Deck;
  source?: Source;
  onClose: () => void;
  onOpenSource: () => void;
  onSuspend: () => void;
  onReset: () => void;
  onDelete: () => void;
}

/** Topics view: the card opens in place, with the passage it came from beside it to check against. */
function InlineEditor({ card, deck, source, onClose, onOpenSource, onSuspend, onReset, onDelete }: EditorProps) {
  const { front, setFront, back, setBack, canSave, submit, onKeyDown } = useCardEditor({
    card,
    onSave: (patch) => {
      store.updateCard(card.id, patch);
      onClose();
    },
    onCancel: onClose,
  });
  const { reps, lapses } = card.srs;

  return (
    <form className={styles.editor} aria-label="Edit card" onSubmit={submit} onKeyDown={onKeyDown}>
      <div className={styles.editorFields}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>FRONT</span>
          <textarea
            className={`${ui.textarea} ${styles.editorText}`}
            rows={2}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            lang={deck.lang}
            autoFocus
          />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>BACK</span>
          <textarea className={`${ui.textarea} ${styles.editorText}`} rows={3} value={back} onChange={(e) => setBack(e.target.value)} lang={deck.lang} />
        </label>
        <div className={styles.editorActions}>
          <button type="button" className={styles.editorBtn} onClick={onSuspend}>
            {card.suspended ? "Unsuspend" : "Suspend"}
          </button>
          <button type="button" className={styles.editorBtn} onClick={onReset}>
            Reset progress
          </button>
          <button type="button" className={`${styles.editorDelete} ${ui.dangerText}`} onClick={onDelete}>
            Delete
          </button>
          <span className={styles.editorHint}>ctrl + enter to save</span>
          <button type="button" className={`${ui.outlineBtn} ${pages.small}`} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${ui.primaryBtn} ${pages.small} ${styles.saveBtn}`} disabled={!canSave}>
            Save
          </button>
        </div>
      </div>
      <div className={styles.editorSource}>
        <div className={ui.fieldLabel}>SOURCE</div>
        <div className={styles.sourceTitle}>{card.sourceRef || "Written by you"}</div>
        {card.sourceQuote && <p className={styles.sourceQuote}>&quot;{card.sourceQuote}&quot;</p>}
        <div className={styles.sourceFoot}>
          <span>{reps === 0 ? "not reviewed yet" : `failed ${lapses} of ${reps} reviews`}</span>
          {source && (
            <button type="button" className={styles.sourceOpen} onClick={onOpenSource}>
              Open source
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
