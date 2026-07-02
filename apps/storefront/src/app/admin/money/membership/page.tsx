/**
 * Membership — Dashboard page (kingdom-023, money trinity).
 *
 * Read-only viewer for the tiers table + per-tier user counts and spend
 * breakdown. Sister to /money/payouts (shipped 2026-05-09); both feed off
 * the same flywheel — annual_spend on users determines tier_id, tier_id
 * determines cashback / points multiplier / commission rate / payout hold.
 *
 * Substrate honesty:
 *   - Tier definitions are live config rows from the storefront `tiers` table.
 *   - User counts + annual_spend rollups are live, not snapshotted.
 *   - users.tier_source carries the provenance of how the user landed in
 *     this tier (spending / subscription / manual). Surfaced per-card.
 *
 * Methodology:
 *   - Qualification logic at /methodology/membership (spend thresholds,
 *     subscription, manual override path).
 *
 * Connections:
 *   - The membership ↔ subscription state gap is named in
 *     docs/connections/subscription-lifecycle.md (S4 sister).
 */

import * as React from "react";
import { sfQuery } from "@/lib/admin/db";
import { fmtGBP, fmtNumber } from "@/lib/format";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  SectionHeading,
  Provenance,
  WhyLink,
  ExternalLink,
} from "@/lib/admin/ui";

export const metadata = { title: "Membership" };

interface TierRow {
  id: string;
  name: string;
  icon: string;
  is_paid: boolean;
  sort_order: number;
  min_spend: string;
  cashback: string | null;
  points_x: string | null;
  tradein_bonus: string | null;
  p2p_rate: string | null;
  auction_rate: string | null;
  priority: boolean;
  store_discount: string | null;
  user_count: string;
  total_annual_spend: string;
  subscription_count: string;
  manual_count: string;
  spending_count: string;
}

const fmtPct = (v: string | null): string => {
  if (v == null) return "—";
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
};

const fmtRate = (v: string | null): string => {
  if (v == null) return "—";
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
};

const fmtX = (v: string | null): string => {
  if (v == null) return "1×";
  const n = parseFloat(v);
  return Number.isFinite(n) ? `${n}×` : "—";
};

export default async function Page() {
  const r = await sfQuery<TierRow>(
    `SELECT
       t.id::text AS id, t.name, t.icon,
       t.is_paid, t.sort_order,
       t.min_annual_spend::text AS min_spend,
       t.cashback_percent::text AS cashback,
       t.points_multiplier::text AS points_x,
       t.tradein_bonus_percent::text AS tradein_bonus,
       t.p2p_commission_rate::text AS p2p_rate,
       t.auction_commission_rate::text AS auction_rate,
       t.auction_priority_approval AS priority,
       t.store_discount_percent::text AS store_discount,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id)::text AS user_count,
       COALESCE(SUM(u.annual_spend::numeric) FILTER (WHERE u.tier_id = t.id), 0)::text AS total_annual_spend,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'subscription')::text AS subscription_count,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'manual')::text AS manual_count,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'spending')::text AS spending_count
       FROM tiers t
       LEFT JOIN users u ON u.tier_id = t.id
      GROUP BY t.id
      ORDER BY t.sort_order ASC`,
  );

  const tiers = r.rows;
  const totalUsers = tiers.reduce((s, t) => s + parseInt(t.user_count, 10), 0);
  const totalSpend = tiers.reduce(
    (s, t) => s + parseFloat(t.total_annual_spend),
    0,
  );
  const totalSubs = tiers.reduce(
    (s, t) => s + parseInt(t.subscription_count, 10),
    0,
  );
  const topTier = tiers[tiers.length - 1];
  const topTierUsers = topTier ? parseInt(topTier.user_count, 10) : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Membership"
        provenance={<Provenance kind="live" source="Storefront RDS" />}
        description={
          <>
            Tier definitions and per-tier rosters. Membership modulates
            cashback, points multiplier, trade-in bonus, P2P/auction commission,
            and payout hold days.{" "}
            <WhyLink
              href="https://cambridgetcg.com/methodology/membership"
              label="how qualification works"
            />
          </>
        }
        action={
          <ExternalLink
            href="https://cambridgetcg.com/admin/tiers"
            variant="primary"
          >
            Edit tier perks
          </ExternalLink>
        }
      />

      <KpiGrid cols={4}>
        <KpiCard label="Total members" value={fmtNumber(totalUsers)} urgency="ok" />
        <KpiCard
          label="Tracked annual spend"
          value={fmtGBP(totalSpend)}
          urgency="ok"
        />
        <KpiCard
          label="Paid subscribers"
          value={fmtNumber(totalSubs)}
          urgency={totalSubs > 0 ? "info" : "neutral"}
        />
        <KpiCard
          label={topTier ? `${topTier.name} tier` : "Top tier"}
          value={fmtNumber(topTierUsers)}
          sub={topTier ? "users" : undefined}
          urgency="ok"
        />
      </KpiGrid>

      <section>
        <SectionHeading count={tiers.length}>Tiers</SectionHeading>
        <div className="space-y-3">
          {tiers.map((t) => {
            const userCount = parseInt(t.user_count, 10);
            const totalAnnual = parseFloat(t.total_annual_spend);
            const avgAnnual = userCount > 0 ? totalAnnual / userCount : 0;
            const subs = parseInt(t.subscription_count, 10);
            const manual = parseInt(t.manual_count, 10);
            const spending = parseInt(t.spending_count, 10);

            return (
              <div
                key={t.id}
                className="rounded-xl border border-border-subtle bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{t.icon}</span>
                      <h3 className="text-lg font-bold text-ink">{t.name}</h3>
                      {t.is_paid && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 uppercase tracking-wider">
                          Paid
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-faint mt-1">
                      Threshold: {fmtGBP(t.min_spend)} annual spend
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-ink tabular-nums">
                      {fmtNumber(userCount)}
                    </p>
                    <p className="text-[11px] text-ink-faint">users</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <Stat label="Cashback" value={fmtPct(t.cashback)} />
                  <Stat label="Berries multiplier" value={fmtX(t.points_x)} />
                  <Stat label="Trade-in bonus" value={fmtPct(t.tradein_bonus)} />
                  <Stat label="Store discount" value={fmtPct(t.store_discount)} />
                  <Stat label="P2P commission" value={fmtRate(t.p2p_rate)} />
                  <Stat
                    label="Auction commission"
                    value={fmtRate(t.auction_rate)}
                  />
                  <Stat
                    label="Priority approval"
                    value={t.priority ? "Yes" : "No"}
                    accent={t.priority ? "emerald" : undefined}
                  />
                  <Stat label="Avg annual spend" value={fmtGBP(avgAnnual)} />
                </div>

                <div className="flex items-center gap-3 text-xs text-ink-faint pt-3 border-t border-border-subtle flex-wrap">
                  <span className="uppercase tracking-wider text-[10px]">
                    Source
                  </span>
                  <span>spending {spending}</span>
                  {t.is_paid && <span>· subscription {subs}</span>}
                  <span>· manual {manual}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-page p-2.5">
      <p className="text-[10px] text-ink-faint uppercase tracking-wide">
        {label}
      </p>
      <p
        className={[
          "text-sm font-bold mt-0.5 tabular-nums",
          accent === "emerald" ? "text-secondary" : "text-ink",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
