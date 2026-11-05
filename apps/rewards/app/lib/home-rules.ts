/**
 * Home's rules that need no database (spec 4.3): which banners show and in
 * what order, when setup is finished, when the review request is due, what
 * the switch's sentence says and what a ledger event's status is. Not a
 * .server module: the page uses these in the browser too, where the widget
 * check runs.
 */

/** The theme block (extensions/…/blocks/membership_widget.liquid) whose embed Home looks for. */
export const WIDGET_EMBED_HANDLE = "membership_widget";

/** The name of the tier the base rate creates. */
export const BASE_TIER_NAME = "Everyone";

/** The review request waits for this many cashback entries… */
export const REVIEW_MIN_CASHBACK = 3;
/** …and for the merchant to be this many days old. */
export const REVIEW_MIN_AGE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The theme editor with the widget embed opened, ready to switch on (Shopify's deep link for app embeds). */
export function themeEditorUrl(shop: string, apiKey: string): string {
  return `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${apiKey}/${WIDGET_EMBED_HANDLE}`;
}

/**
 * Whether the widget embed is on, from App Bridge's `shopify.app.extensions()`:
 * true when its activation is `active`, false when it is there but not
 * active, null when the list has no theme extension holding it (nothing to
 * go on).
 */
export function widgetEmbedOn(extensions: ReadonlyArray<{ type: string; activations: ReadonlyArray<object> }>): boolean | null {
  for (const extension of extensions) {
    if (extension.type !== "theme_app_extension") continue;
    const embed = extension.activations.find(
      (activation): activation is { handle: string; status?: unknown } => "handle" in activation && activation.handle === WIDGET_EMBED_HANDLE,
    );
    if (embed) return embed.status === "active";
  }
  return null;
}

/**
 * The review request is due once, after REVIEW_MIN_CASHBACK cashback
 * entries and REVIEW_MIN_AGE_DAYS days, unless the merchant dismissed it or
 * Shopify has shown it (spec 4.3).
 */
export function reviewDue(i: {
  cashbackEntries: number;
  merchantCreatedAt: Date;
  dismissedAt: Date | null;
  shownAt: Date | null;
  now: Date;
}): boolean {
  if (i.dismissedAt || i.shownAt) return false;
  return i.cashbackEntries >= REVIEW_MIN_CASHBACK && i.now.getTime() - i.merchantCreatedAt.getTime() >= REVIEW_MIN_AGE_DAYS * DAY_MS;
}

/** What `shopify.reviews.request()` answered when the request should not be made again. */
export function reviewWasShown(code: string): boolean {
  return code === "success" || code === "already-reviewed";
}

/** A base rate as the merchant types it: a whole percent from 0 to 100, or null. */
export function parseBaseRate(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value.trim())) return null;
  const percent = Number(value.trim());
  return percent <= 100 ? percent : null;
}

/** The sentence beside the switch. */
export function runningSentence(running: boolean): string {
  return running ? "On: every paid order earns cashback as store credit." : "Off: orders still count toward tiers but earn no cashback.";
}

export interface RunningChecks {
  storeCredit: boolean;
  /** null while the browser hasn't said */
  widget: boolean | null;
  tiers: boolean;
}

/** The one-line Running summary phones show above the numbers. */
export function runningSummary(running: boolean, checks: RunningChecks): string {
  const failing = [checks.storeCredit, checks.widget !== false, checks.tiers].filter((ok) => !ok).length;
  const state = running ? "Cashback is on." : "Cashback is off.";
  if (failing > 0) return `${state} ${failing} ${failing === 1 ? "check needs" : "checks need"} you.`;
  // Nothing failing, but the widget check hasn't answered: claim nothing about it
  return checks.widget === null ? state : `${state} All checks pass.`;
}

/**
 * Setup is finished when there is a tier, cashback is on and the widget is
 * not known to be off, and the past-orders import is no longer running (its
 * progress is a line of the setup card).
 */
export function setupDone(i: { hasTiers: boolean; running: boolean; widgetOn: boolean | null; importState: string }): boolean {
  return i.hasTiers && i.running && i.widgetOn !== false && i.importState !== "running";
}

/**
 * A cashback or take-back's status on Home, from its own payout's state
 * (every such ledger entry has one).
 */
export function rewardStatus(kind: "cashback" | "reversal", state: string): string {
  switch (state) {
    case "sent":
      return kind === "reversal" ? "Taken back" : "Issued";
    case "pending":
    case "sending":
    case "unconfirmed":
    case "held":
      return "Waiting";
    case "needs_look":
      return "Needs a look";
    case "nothing_to_send":
      // A credit a refund cancelled before it went out, or a take-back from that unsent credit
      return "Taken back";
    case "closed":
      return "No cashback";
    default:
      throw new RangeError(`Unknown payout state ${JSON.stringify(state)}`);
  }
}

export type BannerKind = "privacy" | "store-credit" | "needs-look" | "widget";

export interface HomeBanner {
  kind: BannerKind;
  tone: "warning" | "info";
  text: string;
  link: { label: string; href: string } | null;
}

export interface BannerFacts {
  /** The soonest due date of an open customer data request */
  privacyDueAt: Date | null;
  /** storeCreditSpendProblems, in the order the merchant fixes them */
  spendProblems: string[];
  /** Payouts that need a look */
  needsLook: number;
  timezone: string;
  themeEditorUrl: string;
}

const SPEND_PROBLEMS: Record<string, string> = {
  "legacy-accounts": "your store uses legacy customer accounts",
  "sign-in-links-hidden": "sign-in links are hidden on your store and at checkout",
  "store-credit-off": "store credit is turned off in Settings > Customer accounts",
};

/**
 * The banners, only those that apply, most urgent first (spec 4.3): a data
 * request to download (a legal duty), store credit buyers can't spend,
 * payouts that need a look, and the widget embed off (`widgetOn` comes from
 * the browser; null shows nothing).
 */
export function homeBanners(facts: BannerFacts, widgetOn: boolean | null): HomeBanner[] {
  const banners: HomeBanner[] = [];
  if (facts.privacyDueAt) {
    const due = new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: facts.timezone }).format(
      new Date(facts.privacyDueAt),
    );
    banners.push({
      kind: "privacy",
      tone: "warning",
      text: `A customer asked for their data. Download it by ${due}.`,
      link: { label: "Open data requests", href: "/app/settings/privacy" },
    });
  }
  const problems = facts.spendProblems.map((problem) => SPEND_PROBLEMS[problem]).filter((text): text is string => Boolean(text));
  if (problems.length > 0) {
    banners.push({
      kind: "store-credit",
      tone: "warning",
      text: `Buyers can't spend their store credit yet: ${problems.join("; ")}.`,
      link: { label: "Open customer account settings", href: "shopify://admin/settings/customer_accounts" },
    });
  }
  if (facts.needsLook > 0) {
    banners.push({
      kind: "needs-look",
      tone: "warning",
      text: facts.needsLook === 1 ? "1 cashback payment needs a look." : `${facts.needsLook} cashback payments need a look.`,
      link: { label: "Open orders", href: "/app/orders" },
    });
  }
  if (widgetOn === false) {
    banners.push({
      kind: "widget",
      tone: "info",
      text: "The rewards widget is off in your theme.",
      link: { label: "Open the theme editor", href: facts.themeEditorUrl },
    });
  }
  return banners;
}

/** The `n` calendar days ending on `today` (YYYY-MM-DD), oldest first. */
export function daysEnding(today: string, n: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end)) throw new RangeError(`Not a calendar day: ${JSON.stringify(today)}`);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}
