import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect } from "react-router";

import { GUIDE, periodLabel } from "~/admin/guide-words";
import { privatePageHeaders } from "~/admin/headers";
import { homeBanners, importOutcomeLines, themeEditorUrl } from "~/admin/home-rules";
import { requireMerchant } from "~/admin/require-merchant.server";
import { type TryItOrder, dismissGuide, guideSwitchedOnAt, tryItOrders } from "~/lib/guide.server";
import { suggestStarts } from "~/lib/ladder";
import { type LadderData, readGuideBasics, readLadder } from "~/lib/ladder.server";
import { type ConnectionContext, markSetupCompleted, setRunning } from "~/lib/merchant.server";
import { Money } from "~/lib/money";
import { homeState } from "~/lib/stats.server";
import { BASE_TIER_NAME, type LadderErrors, isFreshLadder, requestTierPass, saveLadder, tiersOf } from "~/lib/tiers.server";
import { pollImport } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { storeCreditSpendProblems } from "~/shopify/shop-checks.server";
import { syncWidgetConfig } from "~/shopify/widget-config.server";

/**
 * The first-time setup guide (RP-24, spec 3 and 4): How it works, Your tiers,
 * Go live, one step at a time from `?step=`. Steps 2 and 3 are for the stores
 * they suit: step 2 (and step 1's Next) only while the guide may write the
 * store's ladder (isFreshLadder) and the merchant isn't reading from
 * Settings (`?read=1`); step 3 once the store has tiers, since it writes
 * none. Any other step asked for falls back to the furthest the store may
 * see. The past-orders import is followed as Home follows it on every step
 * (spec 4.6). Not in the menu.
 */

/** How long one load may spend moving the import on, as on Home. */
const IMPORT_POLL_BUDGET_MS = 8_000;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const headers = privatePageHeaders;

/** Move the running import on; a failure is logged and the hourly job carries on (Home's followImport). */
async function followImport(admin: GraphqlClient, conn: ConnectionContext): Promise<void> {
  try {
    await pollImport(admin, conn.connectionId, Date.now() + IMPORT_POLL_BUDGET_MS);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[guide] Could not poll the past-orders import of ${conn.shop}: ${messageOf(error)}`);
  }
}

/**
 * After a change: re-place buyers when it can move them (Ruling 77), then
 * tell the widget; if Shopify can't take it now, the nightly run does (Tiers'
 * afterChange).
 */
async function afterChange(admin: GraphqlClient, conn: ConnectionContext, movesBuyers: boolean): Promise<void> {
  if (movesBuyers) await requestTierPass(conn.connectionId);
  try {
    await syncWidgetConfig(admin, conn);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[guide] Could not update the widget's settings for ${conn.shop}: ${messageOf(error)}`);
  }
}

export type WelcomeData = {
  step: 1 | 2 | 3;
  /** The guide may write the store's ladder and the merchant isn't reading: step 2 and step 1's Next are offered */
  editable: boolean;
  /** The store has tiers: step 3 is offered (it writes no tiers) */
  canGoLive: boolean;
  running: boolean;
  currency: string;
  /** The import's own period (periodLabel) */
  period: string;
  importState: "not_started" | "running" | "done" | "failed";
  importedOrders: number;
  /** Home's one outcome sentence, only for a failed import or a done one with unreadable orders */
  importLines: string[];
  /** Steps 1 and 2 */
  medianOrder: string | null;
  /** Steps 1 and 2 */
  multiCurrency: boolean;
  /** Step 2 only: the store's ladder with suggestStarts' starts (fallbacks included) and whether they come from its data */
  ladder: (LadderData & { suggested: [number, number] | null; fromData: boolean }) | null;
  /** The lone Everyone tier's rate when that is the store's only tier, so row 1 starts at the merchant's own rate */
  everyonePercent: number | null;
  /** Tier 1's rate once saved */
  firstPercent: number | null;
  /** Store credit can be spent: true, false (problems) or null (Shopify didn't say), as Home maps it */
  storeCredit: boolean | null;
  /** Home's store-credit banner text when there are problems */
  storeCreditBanner: string | null;
  themeEditorUrl: string;
  /** Shopify's new draft order page, opened in a new tab */
  draftOrderUrl: string;
  /** A requested tier pass hasn't reached every buyer yet */
  placing: boolean;
  /** When the guide's switch-on happened (guideSwitchedOnAt), as ISO text */
  switchedOnAt: string | null;
  /** Step 3, once switched on: the orders since then */
  tryIt: TryItOrder[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const url = new URL(request.url);
  const reading = url.searchParams.get("read") === "1";
  const asked = url.searchParams.get("step");
  const now = new Date();

  const [tiers, spend] = await Promise.all([tiersOf(conn.merchantId), storeCreditSpendProblems(admin, conn.shop)]);
  let state = await homeState(conn, now);
  if (state.importState === "running") {
    await followImport(admin, conn);
    state = await homeState(conn, new Date());
  }

  const editable = !reading && isFreshLadder(tiers, conn.running);
  const canGoLive = tiers.length > 0;
  const step: WelcomeData["step"] = asked === "2" ? (editable ? 2 : 1) : asked === "3" ? (canGoLive ? 3 : editable ? 2 : 1) : 1;

  const [basics, ladderData, switchedOn] = await Promise.all([
    step === 1 ? readGuideBasics(conn, now) : null,
    step === 2 ? readLadder(conn, now) : null,
    guideSwitchedOnAt(conn.merchantId),
  ]);
  const tryIt = step === 3 && switchedOn ? await tryItOrders(conn, switchedOn) : [];

  let ladder: WelcomeData["ladder"] = null;
  if (ladderData) {
    const { starts, fromData } = suggestStarts({
      p80: ladderData.p80 === null ? null : new Money(ladderData.p80),
      p95: ladderData.p95 === null ? null : new Money(ladderData.p95),
      spenders: ladderData.spenders,
      binWidth: ladderData.binWidth,
      horizonDays: state.importHorizonDays,
      importState: state.importState,
      currency: conn.currency,
    });
    ladder = { ...ladderData, suggested: starts, fromData };
  }

  const unreadable = state.importState === "done" && state.importError !== null;
  const importLines =
    state.importState === "failed" || unreadable
      ? importOutcomeLines({
          state: state.importState === "failed" ? "failed" : "done",
          importedOrders: state.importedOrders,
          importedBuyers: state.importedBuyers,
          unreadable,
          hasTiers: canGoLive,
          placing: state.placing,
        }).slice(0, 1)
      : [];

  const editorUrl = themeEditorUrl(conn.shop, process.env.SHOPIFY_API_KEY);
  const storeCreditBanner =
    homeBanners(
      {
        privacyDueAt: null,
        spendProblems: spend.state === "problems" ? spend.problems : [],
        needsLook: 0,
        needsLookOrderId: null,
        timezone: conn.timezone,
        themeEditorUrl: editorUrl,
      },
      null,
    ).find((banner) => banner.kind === "store-credit")?.text ?? null;
  const [first] = tiers;

  return {
    step,
    editable,
    canGoLive,
    running: conn.running,
    currency: conn.currency,
    period: periodLabel(state.importHorizonDays),
    importState: state.importState,
    importedOrders: state.importedOrders,
    importLines,
    medianOrder: (basics ?? ladderData)?.medianOrder ?? null,
    multiCurrency: (basics ?? ladderData)?.multiCurrency ?? false,
    ladder,
    // A display percent (numeric(5,2)), never used in arithmetic
    everyonePercent: tiers.length === 1 && first.name === BASE_TIER_NAME ? first.cashbackPercent.toNumber() : null,
    firstPercent: first ? first.cashbackPercent.toNumber() : null,
    // Ruling 59: null when Shopify couldn't say, shown as not checked
    storeCredit: spend.state === "ok" ? true : spend.state === "unknown" ? null : false,
    storeCreditBanner,
    themeEditorUrl: editorUrl,
    draftOrderUrl: `https://${conn.shop}/admin/draft_orders/new`,
    placing: state.placing,
    switchedOnAt: switchedOn?.toISOString() ?? null,
    tryIt,
  } satisfies WelcomeData;
};

export type ActionResult = { ok: true } | { ok: false; error: string } | { ok: false; errors: LadderErrors };

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

const UNKNOWN = { ok: false, error: "Unknown action." } satisfies ActionResult;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "save-ladder": {
      const rows = [0, 1, 2].map((i) => ({ name: field(form, `name${i}`), minSpend: field(form, `minSpend${i}`), percent: field(form, `percent${i}`) }));
      const saved = await saveLadder(conn.merchantId, rows);
      if (!saved.ok) return { ok: false, errors: saved.errors } satisfies ActionResult;
      // New tiers always move buyers
      await afterChange(admin, conn, true);
      // On to step 3, keeping the request's other parameters (shop, host and the rest)
      const rest = new URL(request.url).searchParams;
      rest.delete("step");
      const kept = rest.toString();
      throw redirect(`/app/welcome?step=3${kept ? `&${kept}` : ""}`);
    }
    case "running": {
      // Only on: the guide never switches cashback off
      if (form.get("running") !== "on") return data(UNKNOWN, { status: 400 });
      const result = await setRunning(conn.merchantId, true);
      if (!result.ok) return { ok: false, error: GUIDE.saveTiersFirst } satisfies ActionResult;
      // Done: the guide never sends this store to itself again (spec 4.3)
      await markSetupCompleted(conn.merchantId);
      await afterChange(admin, conn, false);
      return { ok: true } satisfies ActionResult;
    }
    case "finish-later":
      // The signed-in store's own merchant, never one the form names
      await dismissGuide(conn.merchantId);
      return { ok: true } satisfies ActionResult;
    default:
      return data(UNKNOWN, { status: 400 });
  }
};

/** The page itself comes with the guide's steps (RP-24 Task 9). */
export default function Welcome() {
  return null;
}
