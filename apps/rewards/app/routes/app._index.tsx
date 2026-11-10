import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";

import { Chart } from "~/admin/Chart";
import { formatMoney } from "~/admin/format";
import { privatePageHeaders } from "~/admin/headers";
import {
  type RunningChecks,
  homeBanners,
  importOutcomeLines,
  importOutcomeShown,
  importPlacing,
  reviewWasShown,
  runningSentence,
  runningSummary,
  setupCardShown,
  setupJustCompleted,
  themeEditorUrl,
  widgetEmbedOn,
} from "~/admin/home-rules";
import { PASS_FOLLOW_MS, usePolling } from "~/admin/polling";
import { requireMerchant } from "~/admin/require-merchant.server";
import { useReviewAfterSave } from "~/admin/review-request";
import { TierChip } from "~/admin/TierChip";
import { CASHBACK_BASE, ERASED_BUYER, rewardLine } from "~/admin/words";
import { type ConnectionContext, dismissImportOutcome, markSetupCompleted, recordReviewPrompt, setRunning } from "~/lib/merchant.server";
import { homeState, homeStats } from "~/lib/stats.server";
import { parseBaseRate, requestTierPass, setBaseRate } from "~/lib/tiers.server";
import { pollImport } from "~/shopify/bulk-import.server";
import type { GraphqlClient } from "~/shopify/graphql";
import { customerNames } from "~/shopify/names.server";
import { storeCreditSpendProblems } from "~/shopify/shop-checks.server";
import { syncWidgetConfig } from "~/shopify/widget-config.server";

/**
 * Home (spec 4.3, layout B: main + side). Banners when the merchant has to
 * act, the setup card until setup is done, this month's numbers, the chart
 * and recent rewards in the main column; Running and Tiers in the aside.
 * The widget embed is checked in the browser (shopify.app.extensions()),
 * and the past-orders import, and the tier pass a base rate asks for, are
 * followed while they run (plan Decision 13, Ruling 76).
 *
 * Two widths decide the layout (Ruling 70), each measured on Polaris 2's own
 * page in both admin appearances (the milestone 3 review's Chromium harness):
 * - Whether the side column sits beside the main one: Polaris puts it there
 *   once the page is 784 px wide. The page sits in its own query container
 *   ("home"), so the main column's one-line Running (with the switch) and
 *   the side column's Running card each show on one side of that width, and
 *   the switch is on the page exactly once at every width.
 * - How much the main column holds: wider than 415 px it shows three numbers
 *   to a row, the chart and every recent reward with its tier and status; at
 *   or below, two numbers to a row, no chart and the newest two rewards,
 *   amount only. Beside the side column the main column is never narrower
 *   than 416 px; a phone up to 430 px wide gives it at most 414 px.
 */

/** The App Store listing, opened on its review form (the anchor Shopify's manage-app-reviews page documents). */
const REVIEW_URL = "https://apps.shopify.com/rewards-pro#modal-show=WriteReviewModal";
/** The review card's one sentence: neutral, asking for no sentiment (App Store requirement 1.3.1). */
const REVIEW_ASK = "How is RewardsPro working for your shop? An honest review, good or bad, helps other merchants decide.";
/** How often the page reloads its data while the import runs or buyers are being placed. */
const FOLLOW_MS = 10_000;
/** How long one Home load may spend moving the import on. */
const IMPORT_POLL_BUDGET_MS = 8_000;
/** Recent rewards a phone shows. */
const PHONE_ROWS = 2;
/** The side column is beside the main one (Polaris's page layout switch). */
const BESIDE = "@container home (inline-size >= 784px)";
/** The main column holds the wide layout. */
const WIDE = "@container main (inline-size > 415px)";
const WIDE_ONLY = `${WIDE} auto, none`;
const RECENT_COLUMNS = `${WIDE} 'minmax(0, 1fr) auto 7rem', 'minmax(0, 1fr) auto'`;
const CHART_EMPTY = "No cashback given or store credit spent in the last 30 days.";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Move the running import on; a failure is logged and the hourly job carries on. */
async function followImport(admin: GraphqlClient, conn: ConnectionContext): Promise<void> {
  try {
    await pollImport(admin, conn.connectionId, Date.now() + IMPORT_POLL_BUDGET_MS);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[home] Could not poll the past-orders import of ${conn.shop}: ${messageOf(error)}`);
  }
}

/** Tell the widget the new state; if Shopify can't take it now, the nightly run does. */
async function tellWidget(admin: GraphqlClient, conn: ConnectionContext): Promise<void> {
  try {
    await syncWidgetConfig(admin, conn);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error(`[home] Could not update the widget's settings for ${conn.shop}: ${messageOf(error)}`);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const now = new Date();

  const [stats, spend] = await Promise.all([homeStats(conn, now), storeCreditSpendProblems(admin, conn.shop)]);
  let state = await homeState(conn, now);
  if (state.importState === "running") {
    await followImport(admin, conn);
    state = await homeState(conn, new Date());
  }
  const names = await customerNames(
    admin,
    stats.recent.map((r) => r.customerId).filter((id) => id !== ""),
  );
  const editorUrl = themeEditorUrl(conn.shop, process.env.SHOPIFY_API_KEY);

  return {
    shop: conn.shop,
    currency: conn.currency,
    running: conn.running,
    stats: {
      cashbackGiven: stats.cashbackGiven.toFixed(),
      creditSpent: stats.creditSpent.toFixed(),
      cameBack: stats.cameBack,
      daily: stats.daily.map((d) => ({ date: d.date, given: d.given.toFixed(), spent: d.spent.toFixed() })),
      // What really moved, in the pages' shared words (Ruling 65)
      recent: stats.recent.map((r) => ({
        orderId: r.orderId,
        orderName: r.orderName,
        buyer: r.customerId === "" ? ERASED_BUYER : names.get(r.customerId)!,
        tierName: r.tierName,
        ratePercent: r.ratePercent?.toFixed() ?? null,
        ...rewardLine(r),
      })),
      tiers: stats.tiers.map((t) => ({ id: t.id, name: t.name, percent: t.percent.toFixed(), members: t.members })),
    },
    bannerFacts: {
      privacyDueAt: state.privacyDueAt,
      spendProblems: spend.state === "problems" ? spend.problems : [],
      needsLook: stats.needsLook,
      needsLookOrderId: stats.needsLookOrderId,
      timezone: conn.timezone,
      themeEditorUrl: editorUrl,
    },
    // The import's raw error stays in the log and the database (Ruling 74)
    setup: {
      completed: state.setupCompleted,
      importState: state.importState,
      importDismissed: state.importDismissed,
      importHorizonDays: state.importHorizonDays,
      importedOrders: state.importedOrders,
      importedBuyers: state.importedBuyers,
      unreadable: state.importState === "done" && state.importError !== null,
      placing: state.placing,
    },
    reviewDue: state.reviewDue,
    // Ruling 59: null when Shopify couldn't say, shown as not checked
    storeCreditReady: spend.state === "ok" ? true : spend.state === "unknown" ? null : false,
    themeEditorUrl: editorUrl,
  };
};

type ActionResult = { ok: true } | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "running": {
      // Only on or off: a malformed post never switches cashback off (BOUNDARY-6)
      const running = form.get("running");
      if (running !== "on" && running !== "off") return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
      const result = await setRunning(conn.merchantId, running === "on");
      if (!result.ok) return { ok: false, error: "Set your base cashback rate first." } satisfies ActionResult;
      await tellWidget(admin, conn);
      return { ok: true } satisfies ActionResult;
    }
    case "base-rate": {
      const percent = parseBaseRate(form.get("percent"));
      if (percent === null) return { ok: false, error: "Enter a whole number from 0 to 100." } satisfies ActionResult;
      const { created } = await setBaseRate(conn.merchantId, percent);
      // The first tier: buyers seen before it (the import's, say) hold none yet
      if (created) await requestTierPass(conn.connectionId);
      await tellWidget(admin, conn);
      return { ok: true } satisfies ActionResult;
    }
    case "setup-done":
      // The browser saw the widget on; the tier and the switch are checked here (Ruling 60)
      await markSetupCompleted(conn.merchantId);
      return { ok: true } satisfies ActionResult;
    case "import-dismissed":
      await dismissImportOutcome(conn.connectionId);
      return { ok: true } satisfies ActionResult;
    case "review-dismissed":
      await recordReviewPrompt(conn.merchantId, "dismissed");
      return { ok: true } satisfies ActionResult;
    case "review-shown": {
      // Any other answer (a cooldown, say) leaves it for a later visit
      const code = form.get("code");
      if (typeof code === "string" && reviewWasShown(code)) await recordReviewPrompt(conn.merchantId, "shown");
      return { ok: true } satisfies ActionResult;
    }
    default:
      return data({ ok: false, error: "Unknown action." } satisfies ActionResult, { status: 400 });
  }
};

/** Whether the widget embed is on, once App Bridge says; null until then or when it can't. */
function useWidgetEmbed(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof shopify === "undefined" || typeof shopify.app?.extensions !== "function") return;
    let live = true;
    shopify.app.extensions().then(
      (extensions) => live && setOn(widgetEmbedOn(extensions)),
      () => live && setOn(null),
    );
    return () => {
      live = false;
    };
  }, []);
  return on;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One of this month's numbers: its label, then the figure, emphasised as Polaris's number docs show a total (DESIGN-10). */
function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <s-stack gap="small-300">
      <s-text color="subdued">{label}</s-text>
      <s-number fontSize="large" fontWeight="bold">
        {value}
      </s-number>
      {note ? <s-text color="subdued">{note}</s-text> : null}
    </s-stack>
  );
}

function Check({ ok, yes, no, unknown }: { ok: boolean | null; yes: string; no: string; unknown?: string }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon type={ok ? "check-circle" : ok === null ? "circle-dashed" : "alert-circle"} tone={ok ? "success" : ok === null ? "neutral" : "warning"} />
      <s-text>{ok ? yes : ok === null ? (unknown ?? no) : no}</s-text>
    </s-stack>
  );
}

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon type={done ? "check-circle" : "circle-dashed"} tone={done ? "success" : "neutral"} />
      {children}
    </s-stack>
  );
}

export default function Home() {
  const d = useLoaderData<typeof loader>();
  const switchFetcher = useFetcher<typeof action>();
  const rateFetcher = useFetcher<typeof action>();
  // Its own, so "Don't ask again" never aborts the review-shown post in flight (A19-F7)
  const reviewDismissFetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  const setupFetcher = useFetcher<typeof action>();
  const widgetOn = useWidgetEmbed();
  const [rate, setRate] = useState("");

  const hasTiers = d.stats.tiers.length > 0;
  // Hidden at once on Dismiss, before the action answers
  const importDismissed = d.setup.importDismissed || importFetcher.formData?.get("intent") === "import-dismissed";
  const setupFacts = { completed: d.setup.completed, hasTiers, running: d.running, widgetOn, importState: d.setup.importState, importDismissed };

  // Setup is recorded as completed the first time every step is seen done (Ruling 60)
  const recorded = useRef(false);
  const submitSetup = setupFetcher.submit;
  const justCompleted = setupJustCompleted(setupFacts);
  useEffect(() => {
    if (!justCompleted || recorded.current) return;
    recorded.current = true;
    void submitSetup({ intent: "setup-done" }, { method: "post" });
  }, [justCompleted, submitSetup]);

  const pending = switchFetcher.formData?.get("intent") === "running" ? switchFetcher.formData.get("running") === "on" : null;
  const running = pending ?? d.running;
  const checks: RunningChecks = { storeCredit: d.storeCreditReady, widget: widgetOn, tiers: hasTiers };
  const banners = homeBanners(d.bannerFacts, widgetOn);
  const showImportOutcome = importOutcomeShown(d.setup.importState, importDismissed);
  const showSetup = setupCardShown(setupFacts);
  const reviewDismissed = reviewDismissFetcher.state !== "idle" || reviewDismissFetcher.data?.ok === true;
  // The review request follows a save that worked: here, cashback switched on (#173). "Don't ask again" counts at
  // once, so a save answered before its post is done never asks
  useReviewAfterSave(d.reviewDue && !reviewDismissed, switchFetcher, switchFetcher.data?.ok === true && d.running);
  const money = (amount: string) => formatMoney(amount, d.currency);
  const switchError = switchFetcher.data && !switchFetcher.data.ok ? switchFetcher.data.error : null;
  const rateError = rateFetcher.data && !rateFetcher.data.ok ? rateFetcher.data.error : null;
  const months = d.setup.importHorizonDays === 365 ? "12 months" : `${d.setup.importHorizonDays} days`;
  const outcomeFacts =
    d.setup.importState === "done" || d.setup.importState === "failed"
      ? {
          state: d.setup.importState,
          importedOrders: d.setup.importedOrders,
          importedBuyers: d.setup.importedBuyers,
          unreadable: d.setup.unreadable,
          hasTiers,
          placing: d.setup.placing,
        }
      : null;
  const outcome = outcomeFacts ? importOutcomeLines(outcomeFacts) : [];
  // The import for as long as it runs (Decision 13); the tier pass only
  // while the shown outcome says buyers are being placed, for two minutes
  // from the load, from when it began saying so, or from the import's end
  // (Ruling 76, Ruling 82)
  const importRunning = d.setup.importState === "running";
  const placingShown = showImportOutcome && outcomeFacts !== null && importPlacing(outcomeFacts);
  usePolling(importRunning || placingShown, FOLLOW_MS, { forMs: importRunning ? undefined : PASS_FOLLOW_MS, restartKey: d.setup.importState });

  // One change at a time, so the last one made is the one kept (CONCURRENCY-2)
  const switchBusy = switchFetcher.state !== "idle";
  const switchTo = (on: boolean) => {
    if (!switchBusy) switchFetcher.submit({ intent: "running", running: on ? "on" : "off" }, { method: "post" });
  };
  // The one switch, wherever the page puts it
  const cashbackSwitch = (o: { labelHidden: boolean }) => (
    <s-switch
      label="Cashback"
      labelAccessibilityVisibility={o.labelHidden ? "exclusive" : "visible"}
      checked={running}
      disabled={switchBusy || (!hasTiers && !running)}
      details={hasTiers || o.labelHidden ? undefined : "Set your base cashback rate first."}
      onChange={(event) => switchTo(event.currentTarget.checked)}
    />
  );

  return (
    <s-query-container containerName="home">
      <s-page heading="Home" inlineSize="base">
        {banners.length > 0 ? (
          <s-stack slot="supplemental-start" gap="base">
            {banners.map((banner) => (
              <s-banner key={banner.kind} tone={banner.tone}>
                {banner.text}{" "}
                {banner.link ? (
                  <s-link href={banner.link.href} target={/^(https|shopify):/.test(banner.link.href) ? "_top" : "auto"}>
                    {banner.link.label}
                  </s-link>
                ) : null}
              </s-banner>
            ))}
          </s-stack>
        ) : null}

        <s-query-container containerName="main">
          <s-stack gap="base">
            {showSetup ? (
              <s-section heading={d.setup.completed ? "Your past orders" : "Set up cashback"} data-setup-card="">
                <s-stack gap="base">
                  {d.setup.completed ? null : (
                    <>
                      <Step done={hasTiers}>
                        {hasTiers ? (
                          <s-text>Your base cashback rate: {d.stats.tiers[0].percent}%</s-text>
                        ) : (
                          <s-stack direction="inline" gap="small-200" alignItems="end">
                            <s-number-field
                              label="Your base cashback rate"
                              name="percent"
                              suffix="%"
                              min={0}
                              max={100}
                              step={1}
                              value={rate}
                              details={`Everyone starts at this rate. ${CASHBACK_BASE}`}
                              error={rateError ?? undefined}
                              onInput={(event) => setRate(event.currentTarget.value)}
                            />
                            <s-button
                              variant="primary"
                              loading={rateFetcher.state !== "idle"}
                              onClick={() => rateFetcher.submit({ intent: "base-rate", percent: rate }, { method: "post" })}
                            >
                              Save
                            </s-button>
                          </s-stack>
                        )}
                      </Step>
                      <Step done={d.running}>
                        {d.running ? (
                          <s-text>Cashback is on</s-text>
                        ) : (
                          <s-button disabled={!hasTiers || switchBusy} loading={switchBusy} onClick={() => switchTo(true)}>
                            Switch cashback on
                          </s-button>
                        )}
                      </Step>
                      <Step done={widgetOn === true}>
                        {widgetOn === true ? (
                          <s-text>The widget is on in your theme</s-text>
                        ) : (
                          <s-link href={d.themeEditorUrl} target="_top">
                            Turn on the widget in your theme
                          </s-link>
                        )}
                      </Step>
                    </>
                  )}
                  {d.setup.importState === "running" ? (
                    <s-text color="subdued">
                      Bringing in your last {months} of orders so buyers start in the right tier. These orders earn no cashback.
                    </s-text>
                  ) : null}
                  {showImportOutcome ? (
                    <s-stack direction="inline" justifyContent="space-between" alignItems="start" gap="small-200" data-import-outcome="">
                      <s-stack gap="small-200">
                        {outcome.map((line) => (
                          <s-text key={line} color="subdued">
                            {line}
                          </s-text>
                        ))}
                      </s-stack>
                      <s-button variant="tertiary" onClick={() => importFetcher.submit({ intent: "import-dismissed" }, { method: "post" })}>
                        Dismiss
                      </s-button>
                    </s-stack>
                  ) : null}
                </s-stack>
              </s-section>
            ) : null}

            {/* Running in one line, with the switch, while the side column is below (Ruling 70) */}
            <s-box display={`${BESIDE} none, auto`}>
              <s-section>
                <s-stack gap="small-200">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                    <s-text>{runningSummary(running, checks)}</s-text>
                    {cashbackSwitch({ labelHidden: true })}
                  </s-stack>
                  {switchError ? <s-text tone="critical">{switchError}</s-text> : null}
                </s-stack>
              </s-section>
            </s-box>

            <s-section heading="This month">
              <s-stack gap="base">
                <s-grid gridTemplateColumns={`${WIDE} 1fr 1fr 1fr, 1fr 1fr`} gap="base">
                  <Stat label="Cashback given" value={money(d.stats.cashbackGiven)} />
                  <Stat label="Store credit spent at checkout" value={money(d.stats.creditSpent)} note="Counts store credit from any source" />
                  <Stat label="Came back" value={String(d.stats.cameBack)} note="Bought again after earning cashback" />
                </s-grid>
                <s-box display={WIDE_ONLY}>
                  <Chart
                    label="Last 30 days"
                    empty={CHART_EMPTY}
                    series={[
                      { label: "Cashback given", points: d.stats.daily.map((day) => ({ date: day.date, value: day.given })) },
                      { label: "Store credit spent", points: d.stats.daily.map((day) => ({ date: day.date, value: day.spent })) },
                    ]}
                    formatValue={(value) => money(value.toFixed())}
                  />
                </s-box>
              </s-stack>
            </s-section>

            <s-section heading="Recent rewards">
              {/* The section header's own action: Polaris takes buttons there, not links */}
              <s-button slot="secondary-actions" href="/app/orders">
                All orders
              </s-button>
              <s-stack gap="base">
                {d.stats.recent.length === 0 ? (
                  <s-text color="subdued">No rewards yet. They appear here after a paid order earns cashback.</s-text>
                ) : (
                  d.stats.recent.map((reward, i) => (
                    // Phones show the newest two, amount only
                    <s-box key={i} data-reward="" display={i < PHONE_ROWS ? undefined : WIDE_ONLY}>
                      <s-stack gap="small-300">
                        {/* The amount in a column of its own, so the amounts line up (DESIGN-6) */}
                        <s-grid gridTemplateColumns={RECENT_COLUMNS} gap="small-200" alignItems="center">
                          <s-stack direction="inline" gap="small-300" alignItems="center">
                            <s-link href={`/app/orders/${reward.orderId}`}>{reward.orderName}</s-link>
                            <s-text>{reward.buyer}</s-text>
                            {reward.tierName && reward.ratePercent ? (
                              <s-box display={WIDE_ONLY}>
                                <TierChip name={reward.tierName} percent={reward.ratePercent} />
                              </s-box>
                            ) : null}
                          </s-stack>
                          <s-box display={WIDE_ONLY}>
                            <s-badge tone={reward.tone}>{reward.status}</s-badge>
                          </s-box>
                          <s-stack alignItems="end">
                            <s-number>{reward.amount}</s-number>
                          </s-stack>
                        </s-grid>
                        {reward.detail ? (
                          <s-box display={WIDE_ONLY}>
                            <s-text color="subdued">{reward.detail}</s-text>
                          </s-box>
                        ) : null}
                      </s-stack>
                    </s-box>
                  ))
                )}
              </s-stack>
            </s-section>

            {/* One neutral sentence for everyone; nothing offered or withheld (#173) */}
            {d.reviewDue && !reviewDismissed ? (
              <s-section data-review-card="">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-200">
                  <s-text>{REVIEW_ASK}</s-text>
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-link href={REVIEW_URL} target="_blank">
                      Leave a review
                    </s-link>
                    <s-button variant="tertiary" onClick={() => reviewDismissFetcher.submit({ intent: "review-dismissed" }, { method: "post" })}>
                      {"Don't ask again"}
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-section>
            ) : null}
          </s-stack>
        </s-query-container>

        {/* The Running card, while the side column is beside the main one (Ruling 70) */}
        <s-box slot="aside" display={`${BESIDE} auto, none`}>
          <s-section heading="Running">
            <s-stack gap="base">
              {cashbackSwitch({ labelHidden: false })}
              <s-paragraph>{runningSentence(running)}</s-paragraph>
              {switchError ? <s-text tone="critical">{switchError}</s-text> : null}
              <s-stack gap="small-200">
                <Check ok={checks.storeCredit} yes="Store credit can be spent" no="Store credit can't be spent yet" unknown="Store credit: Shopify didn't say" />
                <Check ok={checks.widget} yes="Widget is on" no="Widget is off" unknown="Widget: checking" />
                <Check ok={checks.tiers} yes="Tiers are set" no="No tiers yet" />
              </s-stack>
            </s-stack>
          </s-section>
        </s-box>

        <s-section slot="aside" heading="Tiers">
          <s-button slot="secondary-actions" href="/app/tiers">
            Edit
          </s-button>
          <s-stack gap="base">
            {d.stats.tiers.length === 0 ? (
              <s-text color="subdued">No tiers yet. Set your base cashback rate to add your first one; everyone starts there.</s-text>
            ) : (
              d.stats.tiers.map((tier) => (
                <s-stack key={tier.id} direction="inline" justifyContent="space-between" alignItems="center" gap="small-200">
                  <TierChip name={tier.name} percent={tier.percent} />
                  <s-text>{count(tier.members, "member", "members")}</s-text>
                </s-stack>
              ))
            )}
          </s-stack>
        </s-section>
      </s-page>
    </s-query-container>
  );
}

export const headers = privatePageHeaders;
