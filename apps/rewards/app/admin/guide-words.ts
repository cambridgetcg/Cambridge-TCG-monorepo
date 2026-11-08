/**
 * Every sentence the first-time setup guide shows (RP-24), in one place so
 * the house rules can be checked over all of them: business register, UK
 * English, "buyers", no exclamation marks, no timing words, and the sign-in
 * limit with every mention of spending. Not a .server module: the page uses
 * it. The words on other pages stay in words.ts and are imported from there.
 */

/** The import's own period, as Home says it: "12 months" for a full year, else "N days". */
export function periodLabel(horizonDays: number): string {
  return horizonDays === 365 ? "12 months" : `${horizonDays} days`;
}

/** A count of buyers: "1 buyer", "1,200 buyers". */
const buyers = (n: number) => (n === 1 ? "1 buyer" : `${new Intl.NumberFormat("en").format(n)} buyers`);

export const GUIDE = {
  heading: "Set up RewardsPro",
  steps: ["How it works", "Your tiers", "Go live"] as const,
  progress: (step: number) => `Step ${step} of 3`,
  finishLater: "Finish later",
  next: "Next",
  back: "Back",
  editTiers: "Edit your tiers on the Tiers page",
  creditTitle: "Store credit is Shopify's own",
  creditBody:
    "It's a balance in the buyer's Shopify account. RewardsPro adds cashback to it when an order is paid, and buyers spend it at checkout on a later order when they're signed in to their account. You can see a buyer's balance on their page in Shopify.",
  creditCurrency: "Credit is spent in the currency it was earned in.",
  nextTimeTitle: "Earned now, spent next time",
  nextTimeBody: "It isn't a discount: the price of today's order stays the same. The credit gives the buyer a reason to come back.",
  example: (order: string, credit: string) => `Order ${order}, then ${credit} in store credit, spent on the next order`,
  tiersIntro: (period: string) =>
    `Buyers move up a tier as their spend grows. Where each tier starts is suggested from your orders over the last ${period}.`,
  tiersFallback: "These are starting suggestions. Change any of them.",
  tiersFewBuyers: "There are too few past buyers to suggest from yet, so these are starting suggestions.",
  tiersNoOrders: "There are no past orders yet, so these are starting suggestions.",
  tiersBlank: "Enter where tiers 2 and 3 start, in your store's currency.",
  importRunning: (n: number) => `Still bringing in your past orders: ${n} so far. The picture appears when they're all in.`,
  chartLabel: (period: string) => `Buyers by what they spent over the last ${period}`,
  /** The picture's spoken summary, for a screen reader. */
  chartSummary: (label: string, counts: [number, number, number], start2: string, start3: string) =>
    `${label}: ${buyers(counts[0])} below ${start2}, ${buyers(counts[1])} from ${start2}, ${buyers(counts[2])} from ${start3}`,
  /** Beside a tier start typed above the picture's highest spend. */
  beyondPicture: "This start is above the highest spend the picture shows, so that tier's count and the estimate may be low.",
  /** The right-hand end of the picture's scale: its last bar holds every spend from there up. */
  andAbove: (amount: string) => `${amount} and above`,
  firstTier: "Everyone starts here",
  starts: "Starts at",
  cashback: "Cashback",
  name: "Name",
  buyers,
  cost: (amount: string, period: string) =>
    `At these rates, the orders you brought in from the last ${period} would have earned buyers about ${amount} in store credit. This is an estimate: past orders earn no cashback.`,
  saveTiers: "Save tiers",
  defaultNames: ["Bronze", "Silver", "Gold"] as const,
  checksHeading: "Before you switch on",
  storeCreditYes: "Store credit can be spent",
  storeCreditNo: "Store credit can't be spent yet",
  storeCreditUnknown: "Store credit: Shopify didn't say",
  widgetYes: "Widget is on",
  widgetNo: "Widget is off",
  widgetUnknown: "Widget: checking",
  turnOnWidget: "Turn on the widget in your theme",
  checkAgain: "Check again",
  switchOn: "Switch cashback on",
  /** The switch's answer when the store has no tiers yet. */
  saveTiersFirst: "Save your tiers first.",
  placing: "Some buyers are still being placed in their tiers. Until they are, they earn the first tier's rate.",
  liveHeading: "Cashback is on",
  tryItHeading: "See it work with one order",
  tryItSteps: (min: string) => [
    `Make a draft order with yourself as the customer, using a custom item worth at least ${min} so nothing ships or leaves stock, and mark it as paid without sending a receipt.`,
    "Watch the cashback appear below and on your page in Shopify.",
    "Refund the item, not only the shipping, and watch the credit come back off.",
  ],
  draftOrder: "Make a draft order",
  tryItNoRate:
    "Your first tier gives no cashback, so a test order from a new buyer earns nothing. Raise the first tier's rate on the Tiers page to try it.",
  tryItPick: "Which order is your test?",
  tryItNone: "No orders since you switched on yet.",
  openOrder: "Open the order",
  goHome: "Go to Home",
  emails: "Shopify emails a buyer about store credit only if buyer emails are switched on in Settings.",
} as const;
