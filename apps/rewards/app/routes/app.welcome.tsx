import type { Decimal } from "decimal.js";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { data, redirect, useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";

import { formatMoney } from "~/admin/format";
import { GUIDE, periodLabel } from "~/admin/guide-words";
import { privatePageHeaders } from "~/admin/headers";
import { homeBanners, importOutcomeLines, themeEditorUrl } from "~/admin/home-rules";
import { LadderChart } from "~/admin/LadderChart";
import { PASS_FOLLOW_MS, usePolling } from "~/admin/polling";
import { requireMerchant } from "~/admin/require-merchant.server";
import { type WidgetEmbed, useWidgetEmbed } from "~/admin/widget-embed";
import { BUYER_IN_SHOPIFY, STATUS_TONE } from "~/admin/words";
import { type TryItOrder, dismissGuide, guideSwitchedOnAt, tryItOrders } from "~/lib/guide.server";
import { MAX_BINS, MIN_SPENDERS, type Starts, costFor, countsFor, exampleOrder, minEarningBase, onGrid, pictureBins, suggestStarts, validStarts } from "~/lib/ladder";
import { type LadderData, readGuideBasics, readLadder } from "~/lib/ladder.server";
import { type ConnectionContext, markSetupCompleted, setRunning } from "~/lib/merchant.server";
import { Money, cashbackFor } from "~/lib/money";
import { homeState } from "~/lib/stats.server";
import { BASE_TIER_NAME, type LadderErrors, TIER_ERRORS, TIER_NAME_MAX, isFreshLadder, requestTierPass, saveLadder, tiersOf } from "~/lib/tiers.server";
import { pollImport } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { storeCreditSpendProblems } from "~/shopify/shop-checks.server";
import { syncWidgetConfig } from "~/shopify/widget-config.server";

/**
 * The first-time setup guide (RP-24, spec 3 and 4): How it works, Your tiers,
 * Go live, one step at a time from `?step=`. Steps 2 and 3 are for the stores
 * they suit: step 2 (and step 1's Next) only while the guide may write the
 * store's ladder (isFreshLadder); step 3 once the store has tiers, since it
 * writes none. A step 2 or 3 asked for that the store may not see falls back
 * to the furthest step it may see, not to step 1 (R23): after the guide's own
 * save, `?step=2` (Back from step 3) gives 3, and a fresh store's `?step=3`
 * gives 2. Read from Settings (`?read=1`) it is always step 1. The
 * past-orders import is followed as Home follows it on every step (spec 4.6).
 * Not in the menu.
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
  /** Opened from Settings' "How RewardsPro works" (`?read=1`): step 1 to read, without the setup's progress, step names or Finish later */
  reading: boolean;
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
  /** The longest a tier's name may be, as the Tiers page's loader gives it (TIER_NAME_MAX stays on the server) */
  nameMax: number;
  /** Step 2 only: the store's ladder with suggestStarts' starts (fallbacks included) and whether they come from its data */
  ladder: (LadderData & { suggested: [number, number] | null; fromData: boolean }) | null;
  /** The lone Everyone tier's rate when that is the store's only tier, so row 1 starts at the merchant's own rate */
  everyonePercent: number | null;
  /** Tier 1's rate once saved */
  firstPercent: number | null;
  /** Step 3's own reads, null on steps 1 and 2, which never show them (8-F3) */
  goLive: GoLiveData | null;
  themeEditorUrl: string;
  /** Shopify's new draft order page, opened in a new tab */
  draftOrderUrl: string;
  /** A requested tier pass hasn't reached every buyer yet */
  placing: boolean;
};

/** What step 3 asks Shopify and the database for: its store-credit check and the try-it. */
export type GoLiveData = {
  /** Store credit can be spent: true, false (problems) or null (Shopify didn't say), as Home maps it */
  storeCredit: boolean | null;
  /** Home's store-credit banner text when there are problems */
  storeCreditBanner: string | null;
  /** That banner's link to Shopify's customer account settings, in Home's words */
  storeCreditLink: { label: string; href: string } | null;
  /** When the guide's switch-on happened (guideSwitchedOnAt), as ISO text; null while cashback is off */
  switchedOnAt: string | null;
  /** Once switched on: the orders since then */
  tryIt: TryItOrder[];
};

/**
 * Step 3's checks and try-it: whether buyers can spend store credit, in
 * Home's words and with Home's link, and the orders since the switch-on.
 */
async function readGoLive(admin: GraphqlClient, conn: ConnectionContext, editorUrl: string): Promise<GoLiveData> {
  const [spend, switchedOn] = await Promise.all([storeCreditSpendProblems(admin, conn.shop), guideSwitchedOnAt(conn.merchantId)]);
  const tryIt = switchedOn ? await tryItOrders(conn, switchedOn) : [];
  const creditBanner = homeBanners(
    {
      privacyDueAt: null,
      spendProblems: spend.state === "problems" ? spend.problems : [],
      needsLook: 0,
      needsLookOrderId: null,
      timezone: conn.timezone,
      themeEditorUrl: editorUrl,
    },
    null,
  ).find((banner) => banner.kind === "store-credit");
  return {
    // Ruling 59: null when Shopify couldn't say, shown as not checked
    storeCredit: spend.state === "ok" ? true : spend.state === "unknown" ? null : false,
    storeCreditBanner: creditBanner?.text ?? null,
    storeCreditLink: creditBanner?.link ?? null,
    switchedOnAt: switchedOn?.toISOString() ?? null,
    tryIt,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const url = new URL(request.url);
  const reading = url.searchParams.get("read") === "1";
  const asked = url.searchParams.get("step");
  const now = new Date();

  const tiers = await tiersOf(conn.merchantId);
  let state = await homeState(conn, now);
  if (state.importState === "running") {
    await followImport(admin, conn);
    state = await homeState(conn, new Date());
  }

  const editable = !reading && isFreshLadder(tiers, conn.running);
  const canGoLive = tiers.length > 0;
  const furthest: WelcomeData["step"] = canGoLive ? 3 : editable ? 2 : 1;
  const step: WelcomeData["step"] = reading ? 1 : asked === "2" ? (editable ? 2 : furthest) : asked === "3" ? (canGoLive ? 3 : furthest) : 1;

  const editorUrl = themeEditorUrl(conn.shop, process.env.SHOPIFY_API_KEY);
  // Each step reads only what it shows: store credit and the switch-on only on step 3 (8-F3)
  const [basics, ladderData, goLive] = await Promise.all([
    step === 1 ? readGuideBasics(conn, now) : null,
    step === 2 ? readLadder(conn, now) : null,
    step === 3 ? readGoLive(admin, conn, editorUrl) : null,
  ]);

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

  const [first] = tiers;

  return {
    step,
    reading,
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
    nameMax: TIER_NAME_MAX,
    ladder,
    // A display percent (numeric(5,2)), never used in arithmetic
    everyonePercent: tiers.length === 1 && first.name === BASE_TIER_NAME ? first.cashbackPercent.toNumber() : null,
    firstPercent: first ? first.cashbackPercent.toNumber() : null,
    goLive,
    themeEditorUrl: editorUrl,
    draftOrderUrl: `https://${conn.shop}/admin/draft_orders/new`,
    placing: state.placing,
  } satisfies WelcomeData;
};

export type ActionResult = { ok: true } | { ok: false; error: string } | { ok: false; errors: LadderErrors };

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
};

const UNKNOWN = { ok: false, error: "Unknown action." } satisfies ActionResult;

/** The guide at `step`, keeping the request's other search parameters (shop, host and the rest). */
const stepHref = (step: WelcomeData["step"], search: URLSearchParams | string) => {
  const rest = new URLSearchParams(search);
  rest.delete("step");
  const kept = rest.toString();
  return `/app/welcome?step=${step}${kept ? `&${kept}` : ""}`;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "save-ladder": {
      const rows = [0, 1, 2].map((i) => ({ name: field(form, `name${i}`), minSpend: field(form, `minSpend${i}`), percent: field(form, `percent${i}`) }));
      const saved = await saveLadder(conn.merchantId, rows);
      // A 4xx, so React Router doesn't reload the page: step 2 stays, with its message (M-1)
      if (!saved.ok) {
        const status = saved.errors.form === TIER_ERRORS.ladderStale ? 409 : 422;
        return data({ ok: false, errors: saved.errors } satisfies ActionResult, { status });
      }
      // New tiers always move buyers
      await afterChange(admin, conn, true);
      throw redirect(stepHref(3, new URL(request.url).searchParams));
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

/**
 * Finish later's post goes on to Home, so the page isn't reloaded on the way.
 * Everything else is React Router's call, which skips a refused (4xx) post.
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({ formData, defaultShouldRevalidate }) =>
  formData?.get("intent") === "finish-later" ? false : defaultShouldRevalidate;

/** How often the page reloads its data while it follows something, as Home does. */
const FOLLOW_MS = 10_000;
/** Step 1's two tiles sit side by side when their section is this wide, and stack below it. */
const TILES_SIDE_BY_SIDE = "@container tiles (inline-size > 500px)";
/** A tier's three fields sit in one line when the rows are this wide, and stack below it. */
const ROW_IN_LINE = "@container tiers (inline-size > 500px)";
/** Yu's rates for tiers 1 to 3 (spec 3.4). */
const DEFAULT_PERCENTS = ["3", "5", "8"] as const;
/** A rate as saveLadder takes it: a whole percent from 0 to 100. */
const WHOLE_PERCENT = /^\d{1,3}$/;

const rateOf = (typed: string): number | null => {
  const text = typed.trim();
  return WHOLE_PERCENT.test(text) && Number(text) <= 100 ? Number(text) : null;
};

/** The suggested starts as the fields hold them; blank without a suggestion (no 200 or 500 here). */
const startsText = (suggested: [number, number] | null): [string, string] => (suggested ? [String(suggested[0]), String(suggested[1])] : ["", ""]);

const setAt = (list: string[], index: number, value: string) => list.map((item, i) => (i === index ? value : item));

/** Amounts in the shop's currency, as the page writes them. */
const moneyIn = (currency: string) => (amount: Decimal | number | string) => formatMoney(amount, currency);

/** Step 2's opening sentence: where the starts come from. */
function tiersSentence(d: WelcomeData, ladder: NonNullable<WelcomeData["ladder"]>): string {
  if (ladder.fromData) return GUIDE.tiersIntro(d.period);
  // Nothing to suggest in this currency: the fields are blank, so nothing is called a suggestion
  if (ladder.suggested === null) return GUIDE.tiersBlank;
  // A running import may still bring orders in, and a failed one has Home's sentence beside it
  if (d.importedOrders === 0 && (d.importState === "done" || d.importState === "not_started")) return GUIDE.tiersNoOrders;
  if (d.importState === "done" && ladder.spenders < MIN_SPENDERS) return GUIDE.tiersFewBuyers;
  return GUIDE.tiersFallback;
}

/** One check, in Home's states: done, not done, or not known yet. */
function Check({ ok, yes, no, unknown }: { ok: boolean | null; yes: string; no: string; unknown: string }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon type={ok ? "check-circle" : ok === null ? "circle-dashed" : "alert-circle"} tone={ok ? "success" : ok === null ? "neutral" : "warning"} />
      <s-text>{ok ? yes : ok === null ? unknown : no}</s-text>
    </s-stack>
  );
}

/**
 * The widget's status, under the progress on steps 1 and 2 and among the
 * checks on step 3. Until it is on, the theme editor's link and Check again
 * sit beside it: the link opens a new tab, so the guide stays where it was
 * and checks again on the way back.
 */
function WidgetRow({ widget, themeEditorUrl }: { widget: WidgetEmbed; themeEditorUrl: string }) {
  return (
    <s-stack gap="small-200">
      <Check ok={widget.on} yes={GUIDE.widgetYes} no={GUIDE.widgetNo} unknown={GUIDE.widgetUnknown} />
      {widget.on === true ? null : (
        <>
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-link href={themeEditorUrl} target="_blank">
              {GUIDE.turnOnWidget}
            </s-link>
            <s-button variant="tertiary" onClick={widget.recheck}>
              {GUIDE.checkAgain}
            </s-button>
          </s-stack>
          <s-text color="subdued">{GUIDE.saveInEditor}</s-text>
        </>
      )}
    </s-stack>
  );
}

/** Where buyer emails are switched on: the words' own sentence, its "RewardsPro's Settings" linked there (M-8). */
function EmailsLine() {
  const [before, after] = GUIDE.emails.split(GUIDE.emailsSettings);
  return (
    <s-text color="subdued">
      {before}
      <s-link href="/app/settings">{GUIDE.emailsSettings}</s-link>
      {after}
    </s-text>
  );
}

/** The chosen try-it order: what happened to its cashback, and where to see it. */
function TryItResult({ order }: { order: TryItOrder }) {
  return (
    <s-stack gap="small-200">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-text type="strong">{order.name}</s-text>
        <s-badge tone={STATUS_TONE[order.status.key]}>{order.status.label}</s-badge>
        {order.cashback ? <s-text>{formatMoney(order.cashback.amount, order.cashback.currency)}</s-text> : null}
      </s-stack>
      {order.status.detail ? <s-text color="subdued">{order.status.detail}</s-text> : null}
      <s-stack direction="inline" gap="base">
        <s-link href={`/app/orders/${order.orderId}`}>{GUIDE.openOrder}</s-link>
        {order.externalCustomerId === null ? null : (
          <s-link href={`shopify://admin/customers/${order.externalCustomerId}`} target="_top">
            {BUYER_IN_SHOPIFY}
          </s-link>
        )}
      </s-stack>
    </s-stack>
  );
}

/**
 * Step 2's fields, held by the page so they outlive a change of step. The
 * starts come only from the store's suggestions: a field the merchant has
 * typed in (or dragged) keeps its value through every refresh, and the
 * untouched ones move when the suggestions do.
 */
function useTierFields(d: WelcomeData) {
  const suggested = d.ladder?.suggested ?? null;
  const suggestedKey = suggested ? suggested.join(",") : "";
  const [names, setNames] = useState<string[]>(() => [...GUIDE.defaultNames]);
  const [percents, setPercents] = useState<string[]>(() => [String(d.everyonePercent ?? DEFAULT_PERCENTS[0]), DEFAULT_PERCENTS[1], DEFAULT_PERCENTS[2]]);
  const [starts, setStarts] = useState<[string, string]>(() => startsText(suggested));
  const [touched, setTouched] = useState<[boolean, boolean]>([false, false]);
  const [startsFrom, setStartsFrom] = useState(suggestedKey);
  if (startsFrom !== suggestedKey) {
    setStartsFrom(suggestedKey);
    const next = startsText(suggested);
    setStarts([touched[0] ? starts[0] : next[0], touched[1] ? starts[1] : next[1]]);
  }
  return {
    names,
    percents,
    /** Tier 2's and tier 3's starts, as typed */
    starts,
    setName: (index: number, value: string) => setNames((current) => setAt(current, index, value)),
    setPercent: (index: number, value: string) => setPercents((current) => setAt(current, index, value)),
    typeStart: (index: 0 | 1, value: string) => {
      setStarts((current) => (index === 0 ? [value, current[1]] : [current[0], value]));
      setTouched((current) => (index === 0 ? [true, current[1]] : [current[0], true]));
    },
    dragStarts: ([second, third]: [number, number]) => {
      setStarts([String(second), String(third)]);
      setTouched([true, true]);
    },
  };
}

type TierFields = ReturnType<typeof useTierFields>;

/** Where focus goes when a step, or "Cashback is on", replaces the control that was pressed (I-4). */
type Target = RefObject<HTMLDivElement | null>;

/**
 * A section's focus target: s-section draws its heading itself, where it
 * can't take focus, so focus goes to this wrapper, named as the heading is
 * for a screen reader. It moves without scrolling, as on the Tiers page.
 */
function FocusTarget({ target, label, children }: { target: Target; label: string; children: ReactNode }) {
  return (
    <div ref={target} tabIndex={-1} role="group" aria-label={label}>
      {children}
    </div>
  );
}

const focusOn = (target: Target) => target.current?.focus({ preventScroll: true });

/**
 * Step 1, How it works: what store credit is and why it brings buyers back,
 * then Next or the Tiers page. Read from Settings, the page's own heading
 * names it, so its section has none.
 */
function StepOne({ d, target, finishLater }: { d: WelcomeData; target: Target; finishLater: ReactNode }) {
  const money = moneyIn(d.currency);
  const order = exampleOrder(d.medianOrder === null ? null : new Money(d.medianOrder), d.currency);
  const { search } = useLocation();
  return (
    <FocusTarget target={target} label={d.reading ? GUIDE.howItWorks : GUIDE.steps[0]}>
      <s-section heading={d.reading ? undefined : GUIDE.steps[0]}>
        <s-stack gap="base">
          <s-query-container containerName="tiles">
            <s-grid gridTemplateColumns={`${TILES_SIDE_BY_SIDE} 1fr 1fr, 1fr`} gap="base">
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack gap="small-200">
                  <s-heading>{GUIDE.creditTitle}</s-heading>
                  <s-paragraph>{GUIDE.creditBody}</s-paragraph>
                  {d.multiCurrency ? <s-paragraph>{GUIDE.creditCurrency}</s-paragraph> : null}
                </s-stack>
              </s-box>
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack gap="small-200">
                  <s-heading>{GUIDE.nextTimeTitle}</s-heading>
                  <s-paragraph>{GUIDE.nextTimeBody}</s-paragraph>
                  {order === null ? null : (
                    <s-text color="subdued">{GUIDE.example(money(order), money(cashbackFor(order, d.firstPercent ?? 3, d.currency)))}</s-text>
                  )}
                </s-stack>
              </s-box>
            </s-grid>
          </s-query-container>
          <s-stack direction="inline" gap="small-200" justifyContent="end" alignItems="center">
            {finishLater}
            {d.editable ? (
              <s-button variant="primary" href={stepHref(2, search)}>
                {GUIDE.next}
              </s-button>
            ) : (
              <s-link href="/app/tiers">{GUIDE.editTiers}</s-link>
            )}
          </s-stack>
        </s-stack>
      </s-section>
    </FocusTarget>
  );
}

/** Step 2, Your tiers: the picture, the three tiers' fields, the counts and cost from them, and Save. */
function StepTwo({
  d,
  target,
  fields,
  rowErrors,
  saveError,
  ladderRefused,
  saveBusy,
  onSave,
  finishLater,
}: {
  d: WelcomeData;
  target: Target;
  fields: TierFields;
  rowErrors: LadderErrors["rows"] | null;
  saveError: string | undefined;
  /** The whole ladder was refused (`form`): its tiers changed elsewhere, so the Tiers page settles it */
  ladderRefused: boolean;
  saveBusy: boolean;
  onSave: () => void;
  finishLater: ReactNode;
}) {
  const { names, percents, starts } = fields;
  const money = moneyIn(d.currency);
  const { search } = useLocation();

  // Counts and cost from the typed starts, on the picture's grid (R9)
  const ladder = d.ladder;
  const valid = validStarts(starts[0], starts[1]);
  const rates = percents.map(rateOf);
  const gridStarts: Starts | null = ladder && valid ? [0, onGrid(valid[0], ladder.binWidth), onGrid(valid[1], ladder.binWidth)] : null;
  // Only from orders that are all in (I-2): a running import's would understate the cost and change on every
  // refresh. A failed one keeps the figures for what it brought in, which Home's sentence above them says.
  // And none when no buyer has spent (M-7): three zero counts say nothing.
  const noSpend = ladder !== null && d.importedOrders === 0 && ladder.buyers.every((n) => n === 0);
  const counts = ladder && gridStarts && d.importState !== "running" && !noSpend ? countsFor(ladder.buyers, ladder.binWidth, gridStarts) : null;
  const allRates = rates.every((rate) => rate !== null) ? (rates as [number, number, number]) : null;
  const cost = ladder && gridStarts && counts && allRates && d.importedOrders > 0 ? costFor(ladder.earnBase, ladder.binWidth, gridStarts, allRates, d.currency) : null;
  const beyondPicture = ladder !== null && valid !== null && valid.some((start) => start > (MAX_BINS - 1) * ladder.binWidth);
  const showPicture = ladder !== null && d.importState === "done" && d.importedOrders > 0;

  // After a refused save, focus goes to the first field with an error (I-4); Polaris's fields take focus, as on Tiers
  const fieldElements = useRef<Record<string, HTMLElement | null>>({});
  const fieldRef = (name: string) => (element: HTMLElement | null) => {
    fieldElements.current[name] = element;
  };
  useEffect(() => {
    if (!rowErrors) return;
    const errored = rowErrors.flatMap((row, i) => (["name", "minSpend", "percent"] as const).filter((key) => row[key]).map((key) => `${key}${i}`));
    const first = errored.find((name) => fieldElements.current[name]);
    if (first) fieldElements.current[first]?.focus();
  }, [rowErrors]);

  return (
    <FocusTarget target={target} label={GUIDE.steps[1]}>
      <s-section heading={GUIDE.steps[1]}>
        <s-stack gap="base">
          {ladder ? <s-paragraph>{tiersSentence(d, ladder)}</s-paragraph> : null}
          {d.importLines.map((line) => (
            <s-text key={line} color="subdued">
              {line}
            </s-text>
          ))}
          {d.importState === "running" ? <s-text color="subdued">{GUIDE.importRunning(d.importedOrders)}</s-text> : null}
          {showPicture ? (
            <s-stack gap="small-200">
              <s-text>{GUIDE.chartLabel(d.period)}</s-text>
              <LadderChart
                ariaLabel={
                  counts && valid ? GUIDE.chartSummary(GUIDE.chartLabel(d.period), counts, money(valid[0]), money(valid[1])) : GUIDE.chartLabel(d.period)
                }
                // Only the range where 99% of buyers spend, the rest folded into its last bar (R21);
                // counts, cost and beyondPicture keep the full MAX_BINS grid, and a start beyond the
                // shown range is drawn on its edge (LadderChart's lineX)
                buyers={pictureBins(ladder.buyers)}
                binWidth={ladder.binWidth}
                // The gridded starts (onGrid), not the typed ones, so it shades what the counts count (R15)
                starts={gridStarts ? [gridStarts[1], gridStarts[2]] : null}
                formatAmount={money}
                onStartsChange={fields.dragStarts}
              />
            </s-stack>
          ) : null}
          <s-query-container containerName="tiers">
            <s-stack gap="base">
              {[0, 1, 2].map((i) => (
                <s-grid key={i} gridTemplateColumns={`${ROW_IN_LINE} 2fr 2fr 1fr, 1fr`} gap="base" alignItems="start">
                  <s-text-field
                    ref={fieldRef(`name${i}`)}
                    label={GUIDE.rowName(i + 1)}
                    name={`name${i}`}
                    maxLength={d.nameMax}
                    value={names[i]}
                    error={rowErrors?.[i]?.name}
                    onInput={(event) => fields.setName(i, event.currentTarget.value)}
                  />
                  {i === 0 ? (
                    <s-stack gap="small-300">
                      <s-text>{GUIDE.firstStart(money(0))}</s-text>
                      <s-text color="subdued">{GUIDE.firstTier}</s-text>
                    </s-stack>
                  ) : (
                    // Polaris's money field has no step, so whole amounts are the save's rule, said as Tiers says it
                    <s-money-field
                      ref={fieldRef(`minSpend${i}`)}
                      label={GUIDE.rowStart(i + 1)}
                      name={`minSpend${i}`}
                      currencyCode={d.currency as HTMLElementTagNameMap["s-money-field"]["currencyCode"]}
                      min={0}
                      value={starts[i - 1]}
                      details={GUIDE.wholeAmounts}
                      error={rowErrors?.[i]?.minSpend}
                      onInput={(event) => fields.typeStart(i === 1 ? 0 : 1, event.currentTarget.value)}
                    />
                  )}
                  <s-number-field
                    ref={fieldRef(`percent${i}`)}
                    label={GUIDE.rowRate(i + 1)}
                    name={`percent${i}`}
                    suffix="%"
                    min={0}
                    max={100}
                    step={1}
                    value={percents[i]}
                    error={rowErrors?.[i]?.percent}
                    onInput={(event) => fields.setPercent(i, event.currentTarget.value)}
                  />
                </s-grid>
              ))}
            </s-stack>
          </s-query-container>
          {/* Announced as they change; there from the first render, empty, so the first figures are announced too */}
          <s-box accessibilityRole="status">
            {counts ? (
              <s-stack gap="small-200">
                {counts.map((count, i) => (
                  <s-text key={i}>{GUIDE.tierCount(names[i].trim() || GUIDE.defaultNames[i], count)}</s-text>
                ))}
                {cost ? <s-text>{GUIDE.cost(money(cost), d.period)}</s-text> : null}
                {beyondPicture ? <s-text color="subdued">{GUIDE.beyondPicture}</s-text> : null}
              </s-stack>
            ) : null}
          </s-box>
          {saveError ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text tone="critical">{saveError}</s-text>
              {ladderRefused ? <s-link href="/app/tiers">{GUIDE.editTiers}</s-link> : null}
            </s-stack>
          ) : null}
          <s-stack direction="inline" gap="small-200" justifyContent="end" alignItems="center">
            <s-button href={stepHref(1, search)}>{GUIDE.back}</s-button>
            {finishLater}
            <s-button variant="primary" loading={saveBusy} onClick={onSave}>
              {GUIDE.saveTiers}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </FocusTarget>
  );
}

/** Step 3, Go live: the checks, then the switch, then once on the try-it with one order. */
function StepThree({
  d,
  target,
  liveTarget,
  switchTarget,
  goLive,
  widget,
  isLive,
  switchBusy,
  switchError,
  onSwitchOn,
  chosen,
  onPick,
  finishLater,
}: {
  d: WelcomeData;
  target: Target;
  /** "Cashback is on", where focus goes once it is */
  liveTarget: Target;
  /** The switch's section, where focus goes back when a switch-on is refused */
  switchTarget: Target;
  goLive: GoLiveData;
  widget: WidgetEmbed;
  isLive: boolean;
  switchBusy: boolean;
  switchError: string | null | undefined;
  onSwitchOn: () => void;
  /** The try-it order followed: the lone one, or the one picked */
  chosen: TryItOrder | null;
  onPick: (orderId: string | null) => void;
  finishLater: ReactNode;
}) {
  const money = moneyIn(d.currency);
  const minimum = d.firstPercent === null ? null : minEarningBase(d.firstPercent, d.currency);
  return (
    <>
      <FocusTarget target={target} label={GUIDE.steps[2]}>
        <s-section heading={isLive ? GUIDE.checksHeadingLive : GUIDE.checksHeading}>
          <s-stack gap="base">
            <s-stack gap="small-200">
              <Check ok={goLive.storeCredit} yes={GUIDE.storeCreditYes} no={GUIDE.storeCreditNo} unknown={GUIDE.storeCreditUnknown} />
              {goLive.storeCredit === false && goLive.storeCreditBanner ? (
                <s-text>
                  {goLive.storeCreditBanner}{" "}
                  {goLive.storeCreditLink ? (
                    <s-link href={goLive.storeCreditLink.href} target="_top">
                      {goLive.storeCreditLink.label}
                    </s-link>
                  ) : null}
                </s-text>
              ) : null}
            </s-stack>
            <WidgetRow widget={widget} themeEditorUrl={d.themeEditorUrl} />
            {d.placing ? <s-paragraph>{GUIDE.placing}</s-paragraph> : null}
          </s-stack>
        </s-section>
      </FocusTarget>

      {isLive ? (
        <FocusTarget target={liveTarget} label={GUIDE.liveHeading}>
          <s-section heading={GUIDE.liveHeading}>
            <s-stack gap="base">
              <s-heading>{GUIDE.tryItHeading}</s-heading>
              {minimum === null ? (
                <s-paragraph>{GUIDE.tryItNoRate}</s-paragraph>
              ) : (
                <>
                  <s-ordered-list>
                    {GUIDE.tryItSteps(money(minimum)).map((line) => (
                      <s-list-item key={line}>{line}</s-list-item>
                    ))}
                  </s-ordered-list>
                  <s-link href={d.draftOrderUrl} target="_blank">
                    {GUIDE.draftOrder}
                  </s-link>
                </>
              )}
              {goLive.tryIt.length === 0 ? <s-text color="subdued">{GUIDE.tryItNone}</s-text> : null}
              {goLive.tryIt.length > 1 ? (
                <s-choice-list
                  label={GUIDE.tryItPick}
                  name="tryIt"
                  onChange={(event) => {
                    const [value] = event.currentTarget.values;
                    onPick(value ?? null);
                  }}
                >
                  {goLive.tryIt.map((option) => (
                    <s-choice key={option.orderId} value={option.orderId} selected={option.orderId === chosen?.orderId}>
                      {option.name}
                    </s-choice>
                  ))}
                </s-choice-list>
              ) : null}
              {chosen ? <TryItResult order={chosen} /> : null}
              <EmailsLine />
              <s-stack direction="inline" justifyContent="end">
                <s-button variant="primary" href="/app">
                  {GUIDE.goHome}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </FocusTarget>
      ) : (
        // No heading of its own: named by its button, since the checks above are already "Go live"
        <FocusTarget target={switchTarget} label={GUIDE.switchOn}>
          <s-section>
            <s-stack gap="base">
              {switchError ? <s-text tone="critical">{switchError}</s-text> : null}
              <s-stack direction="inline" gap="small-200" justifyContent="end" alignItems="center">
                {finishLater}
                {/* Whatever the widget says: earning doesn't depend on it */}
                <s-button variant="primary" disabled={switchBusy} loading={switchBusy} onClick={onSwitchOn}>
                  {GUIDE.switchOn}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </FocusTarget>
      )}
    </>
  );
}

/**
 * The guide's page: the progress and the widget's status on every step,
 * then the step the loader chose. Each control posts on its own fetcher, one
 * post at a time (CONCURRENCY-2). One poll serves the whole page: the import
 * while it runs, the tier pass while buyers are placed, and the try-it once
 * switched on (its refund comes after its order settles); all but the import
 * for two minutes, restarted when the merchant comes back to the tab.
 * The fetchers and the steps' state live here, so they outlive a change of step.
 */
export default function Welcome() {
  const d: WelcomeData = useLoaderData<typeof loader>();
  const finishFetcher = useFetcher<typeof action>();
  const saveFetcher = useFetcher<typeof action>();
  const switchFetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const widget = useWidgetEmbed();

  // Home only once Finish later is recorded, so Home's guard sees the stamp
  const finished = finishFetcher.data?.ok === true;
  useEffect(() => {
    if (finished) navigate("/app");
  }, [finished, navigate]);
  const finishBusy = finishFetcher.state !== "idle";
  // Reading from Settings leaves nothing to finish
  const finishLater = d.reading ? null : (
    <s-button
      loading={finishBusy}
      onClick={() => {
        if (!finishBusy) finishFetcher.submit({ intent: "finish-later" }, { method: "post" });
      }}
    >
      {GUIDE.finishLater}
    </s-button>
  );

  // Step 2
  const fields = useTierFields(d);
  const saveBusy = saveFetcher.state !== "idle";
  const saveAnswer = saveFetcher.data;
  const ladderErrors = saveAnswer && !saveAnswer.ok && "errors" in saveAnswer ? saveAnswer.errors : undefined;
  const rowErrors = ladderErrors?.rows ?? null;
  const saveError = ladderErrors ? ladderErrors.form : saveAnswer && !saveAnswer.ok && "error" in saveAnswer ? saveAnswer.error : undefined;
  const save = () => {
    if (saveBusy) return;
    const { names, percents, starts } = fields;
    saveFetcher.submit(
      {
        intent: "save-ladder",
        name0: names[0],
        percent0: percents[0],
        name1: names[1],
        minSpend1: starts[0],
        percent1: percents[1],
        name2: names[2],
        minSpend2: starts[1],
        percent2: percents[2],
      },
      { method: "post" },
    );
  };

  // Step 3: on at once when pressed, as Home's switch is; the action's answer settles it. A refusal
  // gives the switch back while the page reloads, busy, so it isn't pressed twice (9-F8)
  const switchBusy = switchFetcher.state !== "idle";
  const switchAnswer = switchFetcher.data;
  const switchRefused = switchFetcher.state === "loading" && switchAnswer?.ok === false;
  const isLive = d.running || (switchFetcher.formData?.get("intent") === "running" && !switchRefused);
  const switchError = switchAnswer && !switchAnswer.ok && "error" in switchAnswer ? switchAnswer.error : null;
  const switchOn = () => {
    if (!switchBusy) switchFetcher.submit({ intent: "running", running: "on" }, { method: "post" });
  };
  // The order followed, by its id: a lone order is taken as picked, so a newer one coming in doesn't drop it (9-F5)
  const [picked, setPicked] = useState<string | null>(null);
  const tryIt = d.goLive?.tryIt ?? [];
  if (tryIt.length === 1 && picked !== tryIt[0].orderId) setPicked(tryIt[0].orderId);
  const chosen = tryIt.find((order) => order.orderId === picked) ?? null;

  // Focus follows what replaced the control pressed (I-4): the new step's heading when the step changes,
  // "Cashback is on" once it is, and the switch's section, with its refusal, if it goes off again and took
  // focus with it (F5-F2; cashback paused in another tab moves nothing, F6-F1); none of them when the page opens
  const stepTarget = useRef<HTMLDivElement>(null);
  const liveTarget = useRef<HTMLDivElement>(null);
  const switchTarget = useRef<HTMLDivElement>(null);
  const shownStep = useRef(d.step);
  useEffect(() => {
    if (shownStep.current === d.step) return;
    shownStep.current = d.step;
    focusOn(stepTarget);
  }, [d.step]);
  const wasLive = useRef(isLive);
  useEffect(() => {
    if (isLive && !wasLive.current) focusOn(liveTarget);
    if (!isLive && wasLive.current && (document.activeElement === null || document.activeElement === document.body)) focusOn(switchTarget);
    wasLive.current = isLive;
  }, [isLive]);

  const importRunning = d.importState === "running";
  const switchedOnAt = d.goLive?.switchedOnAt ?? null;
  // Followed whatever the order's status: a settled one can still be refunded, which takes the credit back off (R14)
  const tryItWaiting = d.step === 3 && switchedOnAt !== null;
  usePolling(importRunning || d.placing || tryItWaiting, FOLLOW_MS, {
    forMs: importRunning ? undefined : PASS_FOLLOW_MS,
    restartKey: `${d.importState}:${switchedOnAt ?? ""}:${widget.returns}`,
  });

  return (
    <s-page heading={d.reading ? GUIDE.howItWorks : GUIDE.heading} inlineSize="base">
      <s-section>
        <s-stack gap="small-200">
          {d.reading ? null : (
            <>
              <s-progress value={d.step} max={3} accessibilityLabel={GUIDE.progress(d.step)} />
              <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="small-200">
                {GUIDE.steps.map((name, i) => (
                  <s-text key={name} type={i + 1 === d.step ? "strong" : "generic"} color={i + 1 === d.step ? "base" : "subdued"}>
                    {name}
                  </s-text>
                ))}
              </s-grid>
            </>
          )}
          {/* Step 3 shows it among its checks */}
          {d.step === 3 ? null : <WidgetRow widget={widget} themeEditorUrl={d.themeEditorUrl} />}
        </s-stack>
      </s-section>

      {d.step === 1 ? <StepOne d={d} target={stepTarget} finishLater={finishLater} /> : null}
      {d.step === 2 ? (
        <StepTwo d={d} target={stepTarget} fields={fields} rowErrors={rowErrors} saveError={saveError} ladderRefused={Boolean(ladderErrors?.form)} saveBusy={saveBusy} onSave={save} finishLater={finishLater} />
      ) : null}
      {d.step === 3 && d.goLive ? (
        <StepThree
          d={d}
          target={stepTarget}
          liveTarget={liveTarget}
          switchTarget={switchTarget}
          goLive={d.goLive}
          widget={widget}
          isLive={isLive}
          switchBusy={switchBusy}
          switchError={switchError}
          onSwitchOn={switchOn}
          chosen={chosen}
          onPick={setPicked}
          finishLater={finishLater}
        />
      ) : null}
    </s-page>
  );
}
