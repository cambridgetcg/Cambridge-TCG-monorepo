// Daily Run types — pure shapes, no imports.

/** A card in the day's deck, snapshotted at commit time so the whole day
 *  judges against one consistent set of prices. */
export interface DailyCard {
  sku: string;
  name: string;
  image_url: string | null;
  set_code: string | null;
  card_number: string | null;
  /** The price the game judges against, in pence, as of the morning's snapshot. */
  price_pence: number;
}

/** A DailyCard as sent to the player BEFORE their guess — no price. */
export type HiddenCard = Omit<DailyCard, "price_pence">;

export interface DailyRunDay {
  run_date: string; // YYYY-MM-DD (UTC)
  draw_id: string;
  cards: DailyCard[];
}

export type Guess = "higher" | "lower";

/** The signed, stateless position of one run. */
export interface RunCursor {
  /** run_date this cursor belongs to */
  d: string;
  /** index of the card currently face-up */
  i: number;
  /** correct guesses so far */
  r: number;
}
