import type { StoreCreditSpendProblem } from "~/shopify/shop-checks.server";
import { formatDay } from "./format";

/**
 * Home's page rules (spec 4.3): which banners show and in what order, when
 * the setup card shows, what the import's outcome says, what the switch's
 * sentence says, and how App Bridge's extensions() answer is read. They are
 * the page's, not the engine's (A19-F4): the engine's rules (the base rate,
 * the review request's counts) live in app/lib. A ledger event's status is
 * the pages' shared one (admin/words.ts payoutStatus). Not a .server
 * module: the page uses these in the browser too, where the widget check
 * runs; the shop-checks import is a type only.
 */

/** The theme block (extensions/…/blocks/membership_widget.liquid) whose embed Home looks for. */
export const WIDGET_EMBED_HANDLE = "membership_widget";

/** The theme editor with the widget embed opened, ready to switch on (Shopify's deep link for app embeds). */
export function themeEditorUrl(shop: string, apiKey: string | undefined): string {
  // A config error, reported where it is thrown, never a link that quietly goes nowhere (A19-F6)
  if (!apiKey) throw new Error("SHOPIFY_API_KEY is not set, so the theme editor link can't name the app");
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

/** What `shopify.reviews.request()` answered when the request should not be made again. */
export function reviewWasShown(code: string): boolean {
  return code === "success" || code === "already-reviewed";
}

/** The sentence beside the switch. */
export function runningSentence(running: boolean): string {
  return running ? "On: every paid order earns cashback as store credit." : "Off: orders still count toward tiers but earn no cashback.";
}

export interface RunningChecks {
  /** null when Shopify couldn't say (storeCreditSpendProblems answered unknown, Ruling 59) */
  storeCredit: boolean | null;
  /** null while the browser hasn't said */
  widget: boolean | null;
  tiers: boolean;
}

/** The one-line Running summary a phone shows above the numbers, beside the switch. */
export function runningSummary(running: boolean, checks: RunningChecks): string {
  const failing = [checks.storeCredit !== false, checks.widget !== false, checks.tiers].filter((ok) => !ok).length;
  const state = running ? "Cashback is on." : "Cashback is off.";
  if (failing > 0) return `${state} ${failing} ${failing === 1 ? "check needs" : "checks need"} you.`;
  // Nothing failing, but a check has no answer: claim nothing about it
  return checks.widget === null || checks.storeCredit === null ? state : `${state} All checks pass.`;
}

/**
 * Whether the setup card shows how the past-orders import ended: from the
 * moment it ends until the merchant dismisses it.
 */
export function importOutcomeShown(importState: string, importDismissed: boolean): boolean {
  return (importState === "done" || importState === "failed") && !importDismissed;
}

/** What decides the setup card. */
export interface SetupFacts {
  /** Every step was done once (merchant.setupCompletedAt, Ruling 60) */
  completed: boolean;
  hasTiers: boolean;
  running: boolean;
  /** From the browser; null while it hasn't said, or when it can't */
  widgetOn: boolean | null;
  importState: string;
  importDismissed: boolean;
}

/** The three steps are done: once completed for good, or now (a widget the browser can't see is not counted against it). */
function stepsDone(f: SetupFacts): boolean {
  return f.completed || (f.hasTiers && f.running && f.widgetOn !== false);
}

/**
 * The setup card (spec 4.3, "only until setup is done") shows while a step
 * is left, and while the past-orders import runs or has an outcome to show,
 * since both are lines of the card. Once setup was completed (Ruling 60) a
 * later pause or an embed turned off doesn't bring it back: the Running
 * checks and the widget banner say those.
 */
export function setupCardShown(f: SetupFacts): boolean {
  return !stepsDone(f) || f.importState === "running" || importOutcomeShown(f.importState, f.importDismissed);
}

/**
 * Setup is completed now, for the first time: a base rate, cashback on and
 * the widget seen on. Home then records it (setupCompletedAt).
 */
export function setupJustCompleted(f: SetupFacts): boolean {
  return !f.completed && f.hasTiers && f.running && f.widgetOn === true;
}

/** What the import's outcome is told from. */
export interface ImportOutcome {
  state: "done" | "failed";
  /** Orders the import wrote, whatever their buyers' tiers */
  importedOrders: number;
  /** Buyers with an imported order, erased ones aside, whatever their tier (Ruling 76) */
  importedBuyers: number;
  /** Some of the file's orders couldn't be read (a done import's importError) */
  unreadable: boolean;
  hasTiers: boolean;
  /** A requested tier pass hasn't reached every buyer yet */
  placing: boolean;
}

const counted = (n: number) => new Intl.NumberFormat("en").format(n);
const PART = (orders: number) => `Brought in ${counted(orders)} of your past orders; the rest couldn't be read.`;
const NONE = "Your past orders couldn't be brought in, so buyers start in the lowest tier.";

/**
 * The import's outcome, in plain sentences (Ruling 74, Ruling 76): never the
 * raw error, which stays in the log and the database.
 * - Failed: one sentence, counting the orders it brought in before it failed.
 * - Done: how many of the past orders it brought in, when some couldn't be
 *   read; then its buyers, whatever their tier: with no tier yet, that they
 *   are placed when the base rate is saved; while the requested pass runs,
 *   that they are being placed; then "Done: N buyers placed in tiers".
 */
export function importOutcomeLines(o: ImportOutcome): string[] {
  if (o.importedOrders === 0) return o.state === "failed" || o.unreadable ? [NONE] : ["Done: there were no past orders to bring in."];
  if (o.state === "failed") return [PART(o.importedOrders)];
  const buyers = `${counted(o.importedBuyers)} ${o.importedBuyers === 1 ? "buyer's" : "buyers'"} past orders`;
  const placed = !o.hasTiers
    ? `Brought in ${buyers}. They're placed in tiers when you save your base rate.`
    : o.placing
      ? `Brought in ${buyers}. They're being placed in tiers.`
      : `Done: ${counted(o.importedBuyers)} ${o.importedBuyers === 1 ? "buyer" : "buyers"} placed in tiers`;
  return o.unreadable ? [PART(o.importedOrders), placed] : [placed];
}

export type BannerKind = "privacy" | "store-credit" | "needs-look" | "widget";

export interface HomeBanner {
  kind: BannerKind;
  tone: "warning" | "info";
  text: string;
  link: { label: string; href: string } | null;
}

export interface BannerFacts {
  /** The soonest due date of an open customer data request not past its expiry (Ruling 64) */
  privacyDueAt: Date | string | null;
  /** storeCreditSpendProblems, in the order the merchant fixes them */
  spendProblems: StoreCreditSpendProblem[];
  /** Orders with a payout that needs a look, counted as the Orders page counts them (Ruling 56) */
  needsLook: number;
  /** The one such order, when there is exactly one */
  needsLookOrderId: string | null;
  timezone: string;
  themeEditorUrl: string;
}

/** Each code storeCreditSpendProblems gives, in words: the compiler checks every code has its own (A19-F4). */
const SPEND_PROBLEMS: Record<StoreCreditSpendProblem, string> = {
  "legacy-accounts": "your store uses legacy customer accounts",
  "sign-in-links-hidden": "sign-in links are hidden on your store and at checkout",
  "store-credit-off": "store credit is turned off in Settings > Customer accounts",
};

/**
 * The banners, only those that apply, most urgent first (spec 4.3): a data
 * request to download (a legal duty), store credit buyers can't spend,
 * orders that need a look (straight to the order when there is one,
 * DESIGN-12), and the widget embed off (`widgetOn` comes from the browser;
 * null shows nothing).
 */
export function homeBanners(facts: BannerFacts, widgetOn: boolean | null): HomeBanner[] {
  const banners: HomeBanner[] = [];
  if (facts.privacyDueAt) {
    const due = formatDay(facts.privacyDueAt, facts.timezone);
    banners.push({
      kind: "privacy",
      tone: "warning",
      text: `A customer asked for their data. Download it by ${due}.`,
      link: { label: "Open customer data requests", href: "/app/settings/privacy" },
    });
  }
  if (facts.spendProblems.length > 0) {
    banners.push({
      kind: "store-credit",
      tone: "warning",
      text: `Buyers can't spend their store credit yet: ${facts.spendProblems.map((problem) => SPEND_PROBLEMS[problem]).join("; ")}.`,
      link: { label: "Open customer account settings", href: "shopify://admin/settings/customer_accounts" },
    });
  }
  if (facts.needsLook > 0) {
    banners.push({
      kind: "needs-look",
      tone: "warning",
      text: facts.needsLook === 1 ? "1 order needs a look." : `${facts.needsLook} orders need a look.`,
      link:
        facts.needsLook === 1 && facts.needsLookOrderId
          ? { label: "Open the order", href: `/app/orders/${facts.needsLookOrderId}` }
          : { label: "Open orders", href: "/app/orders?look=1" },
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
