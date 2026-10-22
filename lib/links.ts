/** URLs shared across pages. Each deck tab has its own path, so Back works between them. */

export type DeckTab = "overview" | "cards" | "sources" | "settings";

export const deckHref = (deckId: string, tab: DeckTab = "overview") => `/deck/${deckId}/${tab}`;

export const addHref = (deckId?: string) => (deckId ? `/add?deck=${deckId}` : "/add");

/** Review mode. `from` is where Esc and Back return to. */
export function reviewHref(opts: { deck?: string; topic?: string; ids?: string[]; from?: string }): string {
  const q = new URLSearchParams();
  if (opts.deck) q.set("deck", opts.deck);
  if (opts.topic) q.set("topic", opts.topic);
  if (opts.ids) q.set("ids", opts.ids.join(","));
  if (opts.from) q.set("from", opts.from);
  const s = q.toString();
  return s ? `/review?${s}` : "/review";
}

/** Only a path inside the app; anything else (another site, "//host") falls back to Today. */
export function safeFrom(from: string | undefined): string {
  return from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/\\") ? from : "/";
}

/** The current path and query, for `from`. */
export const here = () => window.location.pathname + window.location.search;
