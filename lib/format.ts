const DAY = 24 * 60 * 60 * 1000;

export const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.round((startOfDay(date) - startOfDay(now)) / DAY));
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "today at 14:00", "tomorrow at 08:00", "on 13 Sep". */
export function formatWhen(date: Date, now: Date): string {
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY);
  if (days <= 0) return `today at ${clock.format(date)}`;
  if (days === 1) return `tomorrow at ${clock.format(date)}`;
  return `on ${dayMonth.format(date)}`;
}

/** Compact due label for card lists: "now", "in 3h", "in 4d". */
export function formatDue(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return "now";
  if (ms < 60 * 60 * 1000) return `in ${Math.ceil(ms / 60000)}m`;
  if (ms < DAY) return `in ${Math.round(ms / 3600000)}h`;
  return `in ${Math.round(ms / DAY)}d`;
}

/** "p.12", "p.12-14", or "slide 3" for presentations. Empty when the format has no real pages (Word, photos). */
export function formatPages(pages: number[], filename: string): string {
  if (pages.length === 0 || /\.(png|jpe?g|webp|tiff?)$/i.test(filename)) return "";
  const lo = Math.min(...pages);
  const hi = Math.max(...pages);
  const range = lo === hi ? `${lo}` : `${lo}-${hi}`;
  return /\.pptx$/i.test(filename) ? `slide${lo === hi ? "" : "s"} ${range}` : `p.${range}`;
}

/** yyyy-mm-dd for <input type="date">, in local time. */
export function toDateInput(d?: Date): string {
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 9, 0);
}
