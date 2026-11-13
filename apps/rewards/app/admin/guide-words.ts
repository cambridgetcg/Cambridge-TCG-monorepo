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
  /** Step 1 read from Settings (its Help link says the same): the page's heading, without the setup's frame */
  howItWorks: "How RewardsPro works",
  steps: ["How it works", "Your tiers", "Go live"] as const,
  progress: (step: number) => `Step ${step} of 3`,
  finishLater: "Finish later",
  next: "Next",
  back: "Back",
  editTiers: "Edit your tiers on the Tiers page",
  creditTitle: "Store credit is Shopify's own",
  creditBody:
    "It's a balance on the buyer's account in your store. RewardsPro adds cashback to it when an order is paid. Buyers can choose to spend it at checkout on a later order, when signed in with Shopify's new customer accounts or Shop Pay. You can see a buyer's balance on their page in Shopify.",
  creditCurrency: "Credit applies only at a checkout in the currency it was earned in.",
  nextTimeTitle: "Earned now, spent later",
  nextTimeBody:
    "It isn't a discount: the price of today's order stays the same. The credit gives the buyer a reason to come back: they can spend it on a later order, when signed in with new customer accounts or Shop Pay.",
  example: (order: string, credit: string) => `Order ${order}, then ${credit} in store credit, to spend on a later order when signed in`,
  tiersIntro: (period: string) =>
    `Buyers move between tiers as their spend changes, unless you lock them to one. Where each tier starts is suggested from your orders over the last ${period}.`,
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
  /** Row 1's start, which isn't a field: every buyer starts there. */
  firstStart: (amount: string) => `Starts at ${amount}`,
  /** Each row's field labels name its tier (counted from 1), so a screen reader tells the three rows apart. */
  rowName: (n: number) => `Tier ${n} name`,
  rowStart: (n: number) => `Tier ${n} starts at`,
  rowRate: (n: number) => `Tier ${n} cashback`,
  /** Under a start field, as the Tiers page says it: the save takes whole amounts. */
  wholeAmounts: "Whole amounts only.",
  buyers,
  /** One tier's count on step 2, under the name typed for it. */
  tierCount: (name: string, n: number) => `${name}: ${buyers(n)}`,
  cost: (amount: string, period: string) =>
    `At these rates, the orders you brought in from the last ${period} would have earned buyers about ${amount} in store credit. This is an estimate: past orders earn no cashback.`,
  /** Under the estimate, in subdued text, whenever it shows: Shopify's charge to the merchant, which the estimate leaves out (ledger row sh-sc-fee) */
  costFee:
    "Not counted: Shopify's third-party transaction fees on the part of an order paid with store credit, for stores created on or after 12 May 2025.",
  saveTiers: "Save tiers",
  defaultNames: ["Bronze", "Silver", "Gold"] as const,
  checksHeading: "Before you switch on",
  /** The same checks once cashback is on (M-3) */
  checksHeadingLive: "Your store's checks",
  /**
   * Step 3's store-credit check, worded with who can spend (spec 5). Not Home's row ("Store credit can be spent")
   * on purpose: this row names who can do what, and step 1 names the accounts they sign in with.
   */
  storeCreditYes: "Buyers can sign in and spend store credit",
  storeCreditNo: "Buyers can't sign in and spend store credit yet",
  storeCreditUnknown: "Store credit: Shopify didn't say",
  widgetYes: "Widget is on",
  widgetNo: "Widget is off",
  widgetUnknown: "Widget: checking",
  turnOnWidget: "Turn on the widget in your theme",
  /** Beside the theme editor's link: the embed is on only once the merchant saves there (spec 4.7) */
  saveInEditor: "Save in the theme editor, then come back here.",
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
  emails: "A switch in RewardsPro's Settings, off by default, asks Shopify to email buyers when they earn store credit.",
  /** The part of `emails` the page links to RewardsPro's Settings page (M-8) */
  emailsSettings: "RewardsPro's Settings",
} as const;
