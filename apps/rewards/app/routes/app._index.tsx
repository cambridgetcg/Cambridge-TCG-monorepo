import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { Chart } from "~/admin/Chart";
import { formatMoney } from "~/admin/format";
import { requireMerchant } from "~/admin/require-merchant.server";
import { TierChip } from "~/admin/TierChip";
import {
  homeBanners,
  parseBaseRate,
  reviewWasShown,
  runningSentence,
  runningSummary,
  setupDone,
  themeEditorUrl,
  widgetEmbedOn,
  type RunningChecks,
} from "~/lib/home-rules";
import { type ConnectionContext, recordReviewPrompt, setRunning } from "~/lib/merchant.server";
import { homeState, homeStats } from "~/lib/stats.server";
import { requestTierPass, setBaseRate } from "~/lib/tiers.server";
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
 * and the past-orders import is polled while it runs (plan Decision 13).
 */

/** The App Store listing, opened on its review form. */
const REVIEW_URL = "https://apps.shopify.com/rewards-pro#modal-show=ReviewListingModal";
/** How often the page reloads its data while the import runs. */
const IMPORT_POLL_MS = 15_000;
/** How long one Home load may spend moving the import on. */
const IMPORT_POLL_BUDGET_MS = 8_000;
/** Recent rewards a phone shows. */
const PHONE_ROWS = 2;
/** Shown only when the main column is wider than a phone, and only on a phone. */
const WIDE_ONLY = "@container main (inline-size > 600px) auto, none";
const NARROW_ONLY = "@container main (inline-size > 600px) none, auto";

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

  const [stats, spendProblems] = await Promise.all([homeStats(conn, now), storeCreditSpendProblems(admin, conn.shop)]);
  let state = await homeState(conn, now, stats.cashbackOrders);
  if (state.importState === "running") {
    await followImport(admin, conn);
    state = await homeState(conn, new Date(), stats.cashbackOrders);
  }
  const names = await customerNames(
    admin,
    stats.recent.map((r) => r.customerId).filter((id) => id !== ""),
  );
  const editorUrl = themeEditorUrl(conn.shop, process.env.SHOPIFY_API_KEY || "");

  return {
    shop: conn.shop,
    currency: conn.currency,
    running: conn.running,
    stats: {
      cashbackGiven: stats.cashbackGiven.toFixed(),
      creditSpent: stats.creditSpent.toFixed(),
      cameBack: stats.cameBack,
      daily: stats.daily.map((d) => ({ date: d.date, given: d.given.toFixed(), spent: d.spent.toFixed() })),
      recent: stats.recent.map((r) => ({
        orderId: r.orderId,
        orderName: r.orderName,
        buyer: r.customerId === "" ? "Customer" : (names.get(r.customerId) ?? "Customer"),
        tierName: r.tierName,
        amount: r.amount.toFixed(),
        currency: r.currency,
        status: r.status,
      })),
      tiers: stats.tiers.map((t) => ({ id: t.id, name: t.name, percent: t.percent.toFixed(), members: t.members })),
      needsLook: stats.needsLook,
      cashbackOrders: stats.cashbackOrders,
    },
    bannerFacts: {
      privacyDueAt: state.privacyDueAt,
      spendProblems,
      needsLook: stats.needsLook,
      timezone: conn.timezone,
      themeEditorUrl: editorUrl,
    },
    setup: {
      importState: state.importState,
      importError: state.importError,
      importHorizonDays: state.importHorizonDays,
      placedBuyers: state.placedBuyers,
    },
    reviewDue: state.reviewDue,
    storeCreditReady: spendProblems.length === 0,
    themeEditorUrl: editorUrl,
  };
};

type ActionResult = { ok: true } | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, conn } = await requireMerchant(request);
  const form = await request.formData();

  switch (form.get("intent")) {
    case "running": {
      const result = await setRunning(conn.merchantId, form.get("running") === "on");
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

/** Reload the page's data every IMPORT_POLL_MS while the import runs. */
function useImportPolling(running: boolean) {
  const revalidator = useRevalidator();
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void revalidate.current(), IMPORT_POLL_MS);
    return () => clearInterval(timer);
  }, [running]);
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <s-stack gap="small-300">
      <s-text color="subdued">{label}</s-text>
      <s-heading>{value}</s-heading>
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

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "info"> = {
  Issued: "success",
  Waiting: "info",
  "Needs a look": "warning",
  "Taken back": "neutral",
  "No cashback": "neutral",
};

export default function Home() {
  const d = useLoaderData<typeof loader>();
  const switchFetcher = useFetcher<typeof action>();
  const rateFetcher = useFetcher<typeof action>();
  const reviewFetcher = useFetcher<typeof action>();
  const widgetOn = useWidgetEmbed();
  useImportPolling(d.setup.importState === "running");
  const [rate, setRate] = useState("");

  // The review request: asked once per visit by an effect, as Shopify advises (not from a click)
  const asked = useRef(false);
  const submitReview = reviewFetcher.submit;
  useEffect(() => {
    if (!d.reviewDue || asked.current || typeof shopify === "undefined" || typeof shopify.reviews?.request !== "function") return;
    asked.current = true;
    shopify.reviews.request().then(
      (result) => {
        if (reviewWasShown(result.code)) void submitReview({ intent: "review-shown", code: result.code }, { method: "post" });
      },
      () => {},
    );
  }, [d.reviewDue, submitReview]);

  const pending = switchFetcher.formData?.get("intent") === "running" ? switchFetcher.formData.get("running") === "on" : null;
  const running = pending ?? d.running;
  const hasTiers = d.stats.tiers.length > 0;
  const checks: RunningChecks = { storeCredit: d.storeCreditReady, widget: widgetOn, tiers: hasTiers };
  const banners = homeBanners(d.bannerFacts, widgetOn);
  const showSetup = !setupDone({ hasTiers, running: d.running, widgetOn, importState: d.setup.importState });
  const reviewDismissed = reviewFetcher.formData?.get("intent") === "review-dismissed";
  const money = (amount: string, currency = d.currency) => formatMoney(amount, currency);
  const switchError = switchFetcher.data && !switchFetcher.data.ok ? switchFetcher.data.error : null;
  const rateError = rateFetcher.data && !rateFetcher.data.ok ? rateFetcher.data.error : null;
  const months = d.setup.importHorizonDays === 365 ? "12 months" : `${d.setup.importHorizonDays} days`;

  const switchTo = (on: boolean) => switchFetcher.submit({ intent: "running", running: on ? "on" : "off" }, { method: "post" });

  return (
    <s-page heading="Home" inlineSize="base">
      {banners.length > 0 ? (
        <s-stack slot="supplemental-start" gap="base">
          {banners.map((banner) => (
            <s-banner key={banner.kind} tone={banner.tone}>
              {banner.text}{" "}
              {banner.link ? (
                <s-link href={banner.link.href} target={banner.link.href.startsWith("https://") ? "_top" : "auto"}>
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
            <s-section data-setup-card="">
              <s-stack gap="base">
                <s-heading>Set up cashback</s-heading>
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
                    <s-button disabled={!hasTiers} loading={switchFetcher.state !== "idle"} onClick={() => switchTo(true)}>
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
                {d.setup.importState === "running" ? (
                  <s-text color="subdued">Bringing in your last {months} of orders so buyers start in the right tier</s-text>
                ) : null}
                {d.setup.importState === "done" ? (
                  <s-text color="subdued">Done: {count(d.setup.placedBuyers, "buyer", "buyers")} placed in tiers</s-text>
                ) : null}
                {d.setup.importState === "failed" ? (
                  <s-text color="subdued">{"Your past orders couldn't be brought in, so buyers start in the lowest tier."}</s-text>
                ) : null}
                {(d.setup.importState === "done" || d.setup.importState === "failed") && d.setup.importError ? (
                  <s-text color="subdued">{d.setup.importError}</s-text>
                ) : null}
              </s-stack>
            </s-section>
          ) : null}

          <s-box display={NARROW_ONLY}>
            <s-text>{runningSummary(running, checks)}</s-text>
          </s-box>

          <s-section>
            <s-stack gap="base">
              <s-heading>This month</s-heading>
              <s-grid gridTemplateColumns="@container main (inline-size > 600px) 1fr 1fr 1fr, 1fr 1fr" gap="base">
                <Stat label="Cashback given" value={money(d.stats.cashbackGiven)} />
                <Stat label="Store credit spent at checkout" value={money(d.stats.creditSpent)} note="Counts store credit from any source" />
                <Stat label="Came back" value={String(d.stats.cameBack)} note="Bought again after earning cashback" />
              </s-grid>
              <s-box display={WIDE_ONLY}>
                <Chart
                  series={[
                    { label: "Cashback given", points: d.stats.daily.map((day) => ({ date: day.date, value: day.given })) },
                    { label: "Store credit spent", points: d.stats.daily.map((day) => ({ date: day.date, value: day.spent })) },
                  ]}
                  formatValue={(value) => money(value.toFixed())}
                />
              </s-box>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack gap="base">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-heading>Recent rewards</s-heading>
                <s-link href="/app/orders">All orders</s-link>
              </s-stack>
              {d.stats.recent.length === 0 ? (
                <s-text color="subdued">No rewards yet.</s-text>
              ) : (
                d.stats.recent.map((reward, i) => {
                  const row = (
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-200">
                      <s-stack direction="inline" gap="small-300" alignItems="center">
                        <s-link href={`/app/orders/${reward.orderId}`}>{reward.orderName}</s-link>
                        <s-text>{reward.buyer}</s-text>
                        <s-box display={WIDE_ONLY}>
                          <s-text color="subdued">{reward.tierName ?? ""}</s-text>
                        </s-box>
                      </s-stack>
                      <s-stack direction="inline" gap="small-300" alignItems="center">
                        <s-text>{money(reward.amount, reward.currency)}</s-text>
                        <s-box display={WIDE_ONLY}>
                          <s-badge tone={STATUS_TONE[reward.status] ?? "neutral"}>{reward.status}</s-badge>
                        </s-box>
                      </s-stack>
                    </s-stack>
                  );
                  // Phones show the newest two
                  return i < PHONE_ROWS ? (
                    <s-box key={i}>{row}</s-box>
                  ) : (
                    <s-box key={i} display={WIDE_ONLY}>
                      {row}
                    </s-box>
                  );
                })
              )}
            </s-stack>
          </s-section>

          {d.reviewDue && !reviewDismissed ? (
            <s-section>
              <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-200">
                <s-text>A review helps other merchants find RewardsPro.</s-text>
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-link href={REVIEW_URL} target="_blank">
                    Leave a review
                  </s-link>
                  <s-button variant="tertiary" onClick={() => reviewFetcher.submit({ intent: "review-dismissed" }, { method: "post" })}>
                    Dismiss
                  </s-button>
                </s-stack>
              </s-stack>
            </s-section>
          ) : null}
        </s-stack>
      </s-query-container>

      <s-section slot="aside">
        <s-stack gap="base">
          <s-heading>Running</s-heading>
          <s-switch
            label="Cashback"
            checked={running}
            disabled={!hasTiers && !running}
            details={hasTiers ? undefined : "Set your base cashback rate first."}
            onChange={(event) => switchTo(event.currentTarget.checked)}
          />
          <s-paragraph>{runningSentence(running)}</s-paragraph>
          {switchError ? <s-text tone="critical">{switchError}</s-text> : null}
          <s-stack gap="small-200">
            <Check ok={checks.storeCredit} yes="Store credit can be spent" no="Store credit can't be spent yet" />
            <Check ok={checks.widget} yes="Widget is on" no="Widget is off" unknown="Widget: checking" />
            <Check ok={checks.tiers} yes="Tiers are set" no="No tiers yet" />
          </s-stack>
        </s-stack>
      </s-section>

      <s-section slot="aside">
        <s-stack gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-heading>Tiers</s-heading>
            <s-link href="/app/tiers">Edit</s-link>
          </s-stack>
          {d.stats.tiers.length === 0 ? (
            <s-text color="subdued">No tiers yet.</s-text>
          ) : (
            d.stats.tiers.map((tier) => (
              <s-stack key={tier.id} direction="inline" justifyContent="space-between" alignItems="center">
                <TierChip name={tier.name} percent={tier.percent} />
                <s-text>{count(tier.members, "member", "members")}</s-text>
              </s-stack>
            ))
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
