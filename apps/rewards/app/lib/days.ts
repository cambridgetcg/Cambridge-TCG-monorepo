const DAY_MS = 24 * 60 * 60 * 1000;

/** The `n` calendar days ending on `today` (YYYY-MM-DD), oldest first. */
export function daysEnding(today: string, n: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end)) throw new RangeError(`Not a calendar day: ${JSON.stringify(today)}`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}
