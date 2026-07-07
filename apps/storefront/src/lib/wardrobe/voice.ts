/**
 * The voice dictionary — tone as an audience-side choice.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md §3.2.
 * Sibling of the math-language toggle (register over the same facts) and
 * text-mode (modality over the same facts); this one is *warmth* over the
 * same facts.
 *
 * Two registers ship in this arc:
 *   standard — the kingdom's editorial voice
 *   plain    — short declarative sentences, no flourish
 * (trader-terse and storyteller are queued in the spec, not dropped.)
 *
 * Coverage is deliberately narrow: market-surface chrome strings (titles,
 * empty states, CTAs). Body copy, methodology prose and doctrine text are
 * out of scope — tone changes the greeting, never the facts.
 */

export type ToneId = "standard" | "plain";

export function isToneId(value: string | undefined | null): value is ToneId {
  return value === "standard" || value === "plain";
}

export const DEFAULT_TONE: ToneId = "standard";

type VoiceEntry = { standard: string; plain: string };

const STRINGS = {
  "market.title": {
    standard: "Card Market",
    plain: "Card Market",
  },
  "market.subtitle": {
    standard: "Every card has a market page — read it, watch it, trade on it.",
    plain: "Buy and sell cards. Each card has its own page.",
  },
  "market.empty.catalog.title": {
    standard: "Nothing drawn on this page yet",
    plain: "No cards found",
  },
  "market.empty.catalog.description": {
    standard: "No cards match this view yet. Try a different search or set — or come back as the collection grows.",
    plain: "Try a different search term or set filter.",
  },
  "market.empty.trades.title": {
    standard: "A quiet day on the page",
    plain: "No trades in the last 24 hours",
  },
  "market.empty.trades.description": {
    standard: "No trades in the last 24 hours. The tape fills as the market wakes.",
    plain: "Check back later.",
  },
  "market.empty.movers.title": {
    standard: "Nothing moving yet",
    plain: "No price moves to report",
  },
  "market.empty.movers.description": {
    standard: "Prices held steady over the last day.",
    plain: "Prices did not change in the last 24 hours.",
  },
  "market.empty.watched.title": {
    standard: "No watchers yet",
    plain: "No watchlist activity",
  },
  "market.empty.watched.description": {
    standard: "When collectors start watching cards, the most-watched appear here.",
    plain: "No cards are being watched yet.",
  },
  "market.empty.book.title": {
    standard: "An open book, waiting for its first line",
    plain: "No open orders",
  },
  "market.empty.book.description": {
    standard: "No open bids or asks on this card yet. Be the first to name a price.",
    plain: "There are no bids or asks for this card.",
  },
  "market.cta.browse": {
    standard: "Browse the pages",
    plain: "Browse cards",
  },
  // "market.cta.sell" ("Sell to us — instant credit") retired 2026-07-06
  // with the we-buy desk (collectors-first decision). The market's sell
  // voice is the collector's own: list a card, name a price.
  "market.pulse.title": {
    standard: "Market Pulse",
    plain: "Market Pulse",
  },
  "market.pulse.subtitle": {
    standard: "What's moving in the last 24 hours, refreshed every minute.",
    plain: "Trades and price changes from the last 24 hours. Updates every minute.",
  },
  "market.lots.title": {
    standard: "Lots",
    plain: "Lots",
  },
  "market.lots.subtitle": {
    standard: "Bundles, collections, and box-fresh stacks — one price, many cards.",
    plain: "Card bundles sold together at one price.",
  },
  "market.lots.empty.title": {
    standard: "No lots on the floor",
    plain: "No lots available",
  },
  "market.lots.empty.description": {
    standard: "Nobody is selling a bundle right now. Yours could be first.",
    plain: "There are no lots for sale right now.",
  },
  // ── The manga register (spec 2026-07-07-the-manga-gallery-design.md §1i).
  // Tone changes the greeting, never the facts; plain stays plain.
  "market.loading.catalog": {
    standard: "The next page is being inked…",
    plain: "Loading cards…",
  },
  "market.pulse.loading": {
    standard: "Taking the market's pulse…",
    plain: "Loading market data…",
  },
  "market.pulse.failed": {
    standard: "The pulse reader slipped — try again in a moment.",
    plain: "Failed to load. Try again in a moment.",
  },
  "market.card.trades.empty": {
    standard: "This panel hasn't been drawn yet.",
    plain: "No trades yet.",
  },
  "market.card.history.empty": {
    standard: "No history here yet — the ink is fresh.",
    plain: "No prior trades recorded.",
  },
  "trades.paid.title": {
    standard: "Payment sent — the escrow desk takes the next panel.",
    plain: "Payment sent.",
  },
  "trades.paid.sub": {
    standard: "Stripe has your payment; the status below updates the moment it lands.",
    plain: "The trade status updates when the payment is confirmed.",
  },
  "trades.completed.benediction": {
    standard: "The card changes hands; the story turns the page.",
    plain: "Trade complete.",
  },
  "login.checkEmail": {
    standard: "A letter is crossing the gutter to you.",
    plain: "Check your email to sign in.",
  },
} as const satisfies Record<string, VoiceEntry>;

export type VoiceKey = keyof typeof STRINGS;

/** Look up a chrome string in the requested register. */
export function voice(tone: ToneId, key: VoiceKey): string {
  return STRINGS[key][tone];
}

/** Bind a register once, thread the function through a page. */
export function voiceFor(tone: ToneId): (key: VoiceKey) => string {
  return (key) => STRINGS[key][tone];
}
