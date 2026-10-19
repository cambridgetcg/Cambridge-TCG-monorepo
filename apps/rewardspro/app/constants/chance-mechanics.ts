/**
 * Raffles, mystery boxes and instant wins are paused.
 *
 * Shoppers pay for them with points earned mostly from purchases, and there
 * is no free entry route, published odds, rules or age check: that can make
 * them unlicensed lotteries (UK Gambling Act 2005 and similar laws). While
 * paused, nothing can be entered, opened, drawn or won, their storefront
 * lists are empty, the admin navigation hides them and their crons do
 * nothing. Their data stays, and cancelling a raffle still refunds points.
 *
 * This is deliberately a constant: only a code change, after legal review,
 * turns them back on. Not a setting, not an environment variable.
 */
export const CHANCE_MECHANICS_PAUSED = true;

export const CHANCE_MECHANICS_PAUSED_CODE = "CHANCE_MECHANICS_PAUSED";

export const CHANCE_MECHANICS_PAUSED_MESSAGE = "Raffles and mystery boxes are paused.";

/** HTTP status for refused raffle entries and box opens. */
export const CHANCE_MECHANICS_PAUSED_STATUS = 503;

/** The failure every entry, open, draw and instant-win path returns while paused. */
export function chanceMechanicsPausedResult() {
  return {
    success: false as const,
    code: CHANCE_MECHANICS_PAUSED_CODE,
    error: CHANCE_MECHANICS_PAUSED_MESSAGE,
  };
}
