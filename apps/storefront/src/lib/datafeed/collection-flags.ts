import type { MemberPriceSource } from '@cambridge-tcg/data-ingest/member-prices';

/** Each collector's cron does its work only while its flag is exactly 'on'
 * (Yu sets it in production); otherwise the route answers ran:false. Copy
 * that says whether Cambridge collects on a schedule reads these, so it
 * changes with the flag instead of drifting. Scryfall has no collector.
 */
export const DATA_COLLECT_FLAGS = {
  cardmarket: 'DATA_COLLECT_CARDMARKET',
  cardrush: 'DATA_COLLECT_CARDRUSH',
  tcgplayer: 'DATA_COLLECT_TCGPLAYER',
} as const satisfies Partial<Record<MemberPriceSource, string>>;
export type CollectedSource = keyof typeof DATA_COLLECT_FLAGS;

/** Sources whose health is read from the member_price_batches rows their
 * collector writes, one or more per run (/api/v1/sources/[id],
 * audit:tributaries check 9): every source with a collector. CardRush's and
 * TCGplayer's legacy paths, which wrote ingest_run, stay locked; Cardmarket's
 * official files are ingested only here, which writes batches, never
 * ingest_run. A manual import's batch counts too: health says when the newest
 * batch was written, not who ran it.
 */
export const BATCH_COLLECTED_SOURCES = Object.keys(DATA_COLLECT_FLAGS) as readonly CollectedSource[];
export function batchCollected(source: string): source is CollectedSource {
  return Object.hasOwn(DATA_COLLECT_FLAGS, source);
}

/** Cardmarket games collected, by Cardmarket game id, in this order, one
 * batch each: the daily collector (cardmarket-collector.ts) reads this list,
 * and scheduling copy names it. One Piece only: it is the game Cambridge has
 * set crosswalks for (cardmarket-expansions.ts), so its rows can feed derived
 * data. It takes an estimated 15 to 30 s of the budget. Either Pokémon (6) or
 * Yu-Gi-Oh! (3), about 1.5 to 3 minutes each, should fit beside it, and both
 * only at the low estimate; each would add about six times One Piece's rows a
 * day to an append-only table with no crosswalk to use them. Magic (1) does
 * not fit. The measurements are in docs/plans/tcg-data-platform/paid-data-api.md
 * §2. Adding a game is Yu's call.
 */
export const CARDMARKET_COLLECT_GAMES: readonly number[] = [18];
const CARDMARKET_GAME_NAMES: Readonly<Record<number, string>> = { 1: 'Magic', 3: 'Yu-Gi-Oh!', 6: 'Pokémon', 18: 'One Piece' };

const prose = (parts: readonly string[]) =>
  parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

export function collectionOn(source: CollectedSource, env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[DATA_COLLECT_FLAGS[source]] === 'on';
}
export function collectionFlag(source: string): string | null {
  return Object.hasOwn(DATA_COLLECT_FLAGS, source) ? DATA_COLLECT_FLAGS[source as CollectedSource] : null;
}

/** What one collector reads and how often, to follow "Cambridge collects":
 * "Cardmarket's One Piece files daily". The rhythms are the collectors' own
 * (docs/plans/tcg-data-platform/paid-data-api.md §2).
 */
export function collectionSchedule(source: CollectedSource): string {
  switch (source) {
    case 'cardmarket':
      return `Cardmarket's ${prose(CARDMARKET_COLLECT_GAMES.map(id => CARDMARKET_GAME_NAMES[id] ?? `game ${id}`))} files daily`;
    case 'cardrush':
      return 'CardRush product pages every two hours (one host per run)';
    case 'tcgplayer':
      return 'TCGplayer price guides hourly (stalest sets first)';
  }
}

/** What Cambridge collects on a schedule now, in a fixed order, as prose to
 * follow "Cambridge collects" ("Cardmarket's One Piece files daily and
 * TCGplayer price guides hourly (stalest sets first)"); null when nothing is.
 */
export function scheduledCollection(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const parts = (Object.keys(DATA_COLLECT_FLAGS) as CollectedSource[]).filter(source => collectionOn(source, env)).map(collectionSchedule);
  return parts.length ? prose(parts) : null;
}
