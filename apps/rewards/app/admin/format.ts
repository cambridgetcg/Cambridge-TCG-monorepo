/**
 * Display formatting for the admin pages. Not a .server module: components
 * use it too. formatMoney lives with the money rules (the engine words its
 * statuses with it, M3a-F6) and is re-exported here for the pages.
 */

export { formatMoney } from "~/lib/money";

/** A day as the admin shows it, on every page and Home's banner: "June 5, 2026", in `timezone`. */
export function formatDay(date: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(new Date(date));
}
