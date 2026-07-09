/**
 * Fair-share chunk allocation — pure arithmetic for the per-game fair
 * scheduler in `price-snapshot-v2.ts` (policy documented in that file's
 * header). Kept dependency-free so it stays trivially unit-testable.
 */

/**
 * Split `total` selection slots as evenly as possible across `parts`
 * games: every game gets floor(total/parts); the first (total % parts)
 * games get one extra. The result always sums to exactly `total` — no
 * slot is lost or invented.
 *
 * When `total < parts` the trailing games receive 0 slots for this run
 * (only meaningful for tiny dry-run caps; the production chunk of 2,000
 * across a handful of games never hits it). Callers order games
 * direct-host-first, so a starved-by-tiny-cap game is at worst the
 * proxied one — the same game a tiny cap could never meaningfully
 * sample anyway.
 *
 * `parts <= 0` returns `[]`.
 */
export function splitChunkAcrossGames(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const safeTotal = Math.max(0, Math.floor(total));
  const base = Math.floor(safeTotal / parts);
  const remainder = safeTotal % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}
