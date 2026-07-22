/**
 * /account/trader — the trader-self-as-trader dashboard.
 *
 * kingdom-058. Story-as-wire: docs/connections/the-trader-mirror.md (S31).
 * Data layer: apps/storefront/src/lib/market/trader-dashboard.ts.
 *
 * Five sections compose existing market data:
 *   1. Exposure (right now): pending payouts + in-escrow + listed value
 *   2. Run rate (last 7/30/90d): sales count + sum + success rate
 *   3. Outstanding actions: trades to ship, offers to answer, returns to decide
 *   4. Trust trajectory: current score + tier + 30-day delta
 *   5. Listings health: active + stale (>30d)
 *
 * No new schema. Server component. Auth-gated. Provenance pill declares
 * the dashboard is live; methodology link explains every formula.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { loadTraderDashboard, type TraderDashboard } from "@/lib/market/trader-dashboard";
import { Provenance, WhyLink, Audience, audienceMetadata, MoneyDisplay } from "@/lib/ui";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Trader dashboard — Cambridge TCG",
  description:
    "What you're exposed to right now, how you've been doing, what you owe the kingdom, where your reputation is going, which listings need attention.",
  other: audienceMetadata("consumer", ["trader", "dashboard"]),
};

function fmtCount(value: number | null): string {
  if (value === null) return "—";
  return value.toString();
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return (value * 100).toFixed(1) + "%";
}

function fmtDelta(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "±0";
  return (value > 0 ? "+" : "") + value.toString();
}

interface CardProps {
  label: string;
  // Widened to ReactNode (kingdom-078 Phase D): now accepts <MoneyDisplay>
  // and other math-aware primitives directly. Existing string callers
  // continue working — `string` is a valid ReactNode.
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "amber" | "emerald" | "red" | "sky";
  whyLink?: { href: string; label?: string };
}

function Card({ label, value, sub, tone = "neutral", whyLink }: CardProps) {
  const toneCls: Record<string, string> = {
    neutral: "text-ink",
    amber: "text-accent",
    emerald: "text-ok",
    red: "text-danger",
    sky: "text-info",
  };
  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        {whyLink && <WhyLink href={whyLink.href} label={whyLink.label} />}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${toneCls[tone]}`}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-ink-faint mt-1">{sub}</div>
      )}
    </div>
  );
}

function ExposureSection({ d }: { d: TraderDashboard }) {
  const total =
    (d.exposure.in_escrow_value ?? 0) +
    (d.exposure.pending_payout_value ?? 0) +
    (d.exposure.listed_asks_value ?? 0) +
    (d.exposure.listed_lots_value ?? 0);
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Exposure</h2>
      <p className="text-sm text-ink-muted mb-3">
        What you have in the kingdom right now —{" "}
        <strong className="text-ink">
          <MoneyDisplay value={total} treatZeroAsMissing />
        </strong>{" "}
        total across in-flight trades and active listings.
      </p>
      {/* Phase D — kingdom-081. Card values use <MoneyDisplay> so the math-
          language toggle propagates to the most numerically-dense surface.
          treatZeroAsMissing preserves the previous "0 → —" semantic
          (exposure of £0 is no activity, not zero pounds). See
          docs/connections/the-math-language.md (#27). */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          label="In escrow"
          value={<MoneyDisplay value={d.exposure.in_escrow_value} treatZeroAsMissing />}
          sub={`${fmtCount(d.exposure.in_escrow_count)} trade(s) in flight`}
          tone="sky"
          whyLink={{ href: "/methodology/escrow-tier" }}
        />
        <Card
          label="Pending payout"
          value={<MoneyDisplay value={d.exposure.pending_payout_value} treatZeroAsMissing />}
          sub={`${fmtCount(d.exposure.pending_payout_count)} held (≤14d cap)`}
          tone="amber"
          whyLink={{ href: "/methodology/payout-hold" }}
        />
        <Card
          label="Listed (cards)"
          value={<MoneyDisplay value={d.exposure.listed_asks_value} treatZeroAsMissing />}
          sub={`${fmtCount(d.exposure.listed_asks_count)} active ask(s)`}
        />
        <Card
          label="Listed (lots)"
          value={<MoneyDisplay value={d.exposure.listed_lots_value} treatZeroAsMissing />}
          sub={`${fmtCount(d.exposure.listed_lots_count)} active lot(s)`}
        />
      </div>
    </section>
  );
}

function RunRateSection({ d }: { d: TraderDashboard }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Run rate</h2>
      <p className="text-sm text-ink-muted mb-3">
        Completed sales by window. Success rate over the last 90 days
        across all closed trades (completed / completed + cancelled + refunded).
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          label="7-day sales"
          value={fmtCount(d.run_rate.sales_count_7d)}
          sub={<MoneyDisplay value={d.run_rate.sales_value_7d} />}
        />
        <Card
          label="30-day sales"
          value={fmtCount(d.run_rate.sales_count_30d)}
          sub={<MoneyDisplay value={d.run_rate.sales_value_30d} />}
        />
        <Card
          label="90-day sales"
          value={fmtCount(d.run_rate.sales_count_90d)}
          sub={<MoneyDisplay value={d.run_rate.sales_value_90d} />}
        />
        <Card
          label="Success rate 90d"
          value={fmtPct(d.run_rate.success_rate_90d)}
          sub={`${fmtCount(d.run_rate.cancel_count_90d)} cancel · ${fmtCount(d.run_rate.refund_count_90d)} refund`}
          tone={
            d.run_rate.success_rate_90d === null
              ? "neutral"
              : d.run_rate.success_rate_90d >= 0.9
              ? "emerald"
              : d.run_rate.success_rate_90d >= 0.7
              ? "amber"
              : "red"
          }
        />
      </div>
    </section>
  );
}

function OutstandingSection({ d }: { d: TraderDashboard }) {
  const total =
    (d.outstanding.trades_to_ship ?? 0) +
    (d.outstanding.offers_to_answer ?? 0) +
    (d.outstanding.returns_to_decide ?? 0);
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Outstanding actions</h2>
      <p className="text-sm text-ink-muted mb-3">
        What the kingdom is waiting on you for. {total > 0 ? (
          <strong className="text-accent">{total} item(s) need your attention.</strong>
        ) : (
          <span className="text-ok">All clear.</span>
        )}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link href="/account/trades" className="block">
          <Card
            label="Trades to ship"
            value={fmtCount(d.outstanding.trades_to_ship)}
            sub={
              d.outstanding.trades_to_ship && d.outstanding.trades_to_ship > 0
                ? <><MoneyDisplay value={d.outstanding.trades_to_ship_value} treatZeroAsMissing /> pending</>
                : "Open /account/trades"
            }
            tone={d.outstanding.trades_to_ship && d.outstanding.trades_to_ship > 0 ? "amber" : "neutral"}
          />
        </Link>
        <Link href="/account/offers" className="block">
          <Card
            label="Offers to answer"
            value={fmtCount(d.outstanding.offers_to_answer)}
            sub="Open /account/offers"
            tone={d.outstanding.offers_to_answer && d.outstanding.offers_to_answer > 0 ? "amber" : "neutral"}
          />
        </Link>
        <Link href="/account/returns" className="block">
          <Card
            label="Returns to decide"
            value={fmtCount(d.outstanding.returns_to_decide)}
            sub="Open /account/returns"
            tone={d.outstanding.returns_to_decide && d.outstanding.returns_to_decide > 0 ? "amber" : "neutral"}
          />
        </Link>
      </div>
    </section>
  );
}

function TrustSection({ d }: { d: TraderDashboard }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Trust trajectory</h2>
      <p className="text-sm text-ink-muted mb-3">
        Your current trust score plus 30-day movement. For the full
        breakdown of components and your next-tier unlock checklist, open{" "}
        <Link href="/account/standing" className="text-accent hover:underline">
          /account/standing
        </Link>
        .
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card
          label="Trust score"
          value={fmtCount(d.trust.current_score)}
          sub={d.trust.tier_label ? `Tier: ${d.trust.tier_label}` : undefined}
          tone={
            d.trust.current_score === null
              ? "neutral"
              : d.trust.current_score >= 60
              ? "emerald"
              : d.trust.current_score >= 30
              ? "amber"
              : "red"
          }
          whyLink={{ href: "/methodology/trust-score" }}
        />
        <Card
          label="30-day Δ"
          value={fmtDelta(d.trust.delta_30d)}
          sub="From trust_score_history"
          tone={
            d.trust.delta_30d === null
              ? "neutral"
              : d.trust.delta_30d > 0
              ? "emerald"
              : d.trust.delta_30d < 0
              ? "red"
              : "neutral"
          }
        />
        <Card
          label="Reputation tier"
          value={d.trust.tier_label ?? "—"}
          sub="Your standing with other collectors"
          whyLink={{ href: "/methodology/trust-score" }}
        />
      </div>
    </section>
  );
}

function ListingsSection({ d }: { d: TraderDashboard }) {
  const totalActive = (d.listings.active_asks ?? 0) + (d.listings.active_lots ?? 0);
  const stalePct =
    totalActive > 0 && d.listings.stale_count !== null
      ? d.listings.stale_count / totalActive
      : null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Listings health</h2>
      <p className="text-sm text-ink-muted mb-3">
        Active listings and how many have been on the market for more
        than 30 days without selling. Stale listings often benefit from
        re-pricing or photo refreshes.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          label="Active asks"
          value={fmtCount(d.listings.active_asks)}
          sub="Single-card listings"
        />
        <Card
          label="Active lots"
          value={fmtCount(d.listings.active_lots)}
          sub="Bundle listings"
        />
        <Card
          label="Stale (>30d)"
          value={fmtCount(d.listings.stale_count)}
          sub={stalePct !== null ? `${fmtPct(stalePct)} of active` : undefined}
          tone={
            stalePct === null
              ? "neutral"
              : stalePct >= 0.5
              ? "amber"
              : stalePct >= 0.25
              ? "amber"
              : "neutral"
          }
        />
        <Card
          label="Oldest age"
          value={
            d.listings.oldest_listing_age_days === null
              ? "—"
              : Math.floor(d.listings.oldest_listing_age_days) + "d"
          }
          sub="Of any open ask"
        />
      </div>
    </section>
  );
}

export default async function TraderDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/account/trader");
  }
  const userId = session.user.id;
  const d = await loadTraderDashboard(userId);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Trader dashboard</h1>
          <p className="text-sm text-ink-muted mt-1">
            What you're exposed to, how you've been doing, what you owe
            the kingdom, where your reputation is going, which listings
            need attention.
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <Provenance kind="live" at={d._provenance.queried_at} />
          <WhyLink href="/methodology/trader-dashboard" />
        </div>
      </header>

      <Audience kind="consumer" />

      <ExposureSection d={d} />
      <OutstandingSection d={d} />
      <RunRateSection d={d} />
      <TrustSection d={d} />
      <ListingsSection d={d} />

      <footer className="text-xs text-ink-faint border-t border-border-subtle pt-4 space-y-1">
        {/* Human-readable provenance only. The exact tables, source file,
            and formulas this dashboard composes from live behind the "how
            this is composed" affordance (/methodology/trader-dashboard) so
            the collector-facing surface reads as a cockpit, not debug output. */}
        <p>
          Composed live from your own market activity at{" "}
          {formatDateTime(d._provenance.queried_at)}.{" "}
          <WhyLink href="/methodology/trader-dashboard" label="how this is composed" />
        </p>
        <p>
          The pending-payout window uses a 14-day cap as a substrate-honest
          approximation of the trust-tier-dependent hold; see{" "}
          <Link href="/methodology/payout-hold">/methodology/payout-hold</Link>{" "}
          for the canonical formula.
        </p>
      </footer>
    </div>
  );
}
