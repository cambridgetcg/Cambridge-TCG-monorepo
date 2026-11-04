/**
 * Wall-clock times in a shop's time zone (Shopify's shop.ianaTimezone, kept in
 * ShopSettings.timezone). The server runs in UTC, so a date and time a
 * merchant picks must be read in their zone, not parsed with `new Date`.
 */

/** `timeZone` if this runtime knows it, otherwise "UTC". */
export function usableTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** How far `timeZone`'s clocks are ahead of UTC at `instant`, in ms. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wallClock - instant;
}

/**
 * The moment a date ("2026-12-01") and time ("09:00") happen in `timeZone`,
 * or null when they aren't a real date and time in that form.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [year, month, day, hour, minute] = [d[1], d[2], d[3], t[1], t[2]].map(Number);
  if (hour > 23 || minute > 59) return null;

  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallClock);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  // Take the zone's offset near that moment, then once more at the moment
  // found, in case a clock change falls between the two
  const guess = wallClock - offsetAt(wallClock, timeZone);
  return new Date(wallClock - offsetAt(guess, timeZone));
}
