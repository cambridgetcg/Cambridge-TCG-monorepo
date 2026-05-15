/**
 * User detail — Dashboard archetype (the admin hub view of one user).
 *
 * The keystone "wiring" page. Every Manager surface that mentions a user
 * (chargebacks, disputes, market trades, fraud signals, payouts, KYC)
 * deep-links here. From this page the operator can see who they are,
 * what's open against them, and jump to any of the per-domain Manager
 * pages or the storefront's full forensic timeline.
 *
 * Design rule: this page summarises and links — it does not own data
 * or expose mutations. Mutations stay in the Manager pages and storefront.
 *
 * Tables: users, trust_profiles, user_verifications (KYC), customer_orders,
 * chargebacks, market_trades, fraud_signals, admin_actions_log, payout_holds.
 * All via sfQuery + safe() so missing tables degrade to "—" rather than 500.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { sfQuery } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtGBP, fmtNumber, fmtRelative } from "@/lib/format";
import { safe, safeCount, isUnavailable } from "@/lib/queries";
import {
  PageHeader, KpiGrid, KpiCard, SectionHeading, StatusBadge, ExternalLink,
  EmptyState, Provenance, WhyLink, Verifiability, type Tone,
} from "@/lib/ui";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "User" };
  const r = await safe(
    () => sfQuery<{ name: string | null; username: string | null; email: string }>(
      `SELECT name, username, email FROM users WHERE id = $1::uuid`,
      [id],
    ),
    { rows: [] },
  );
  const u = r.rows[0];
  return { title: u ? (u.name ?? u.username ?? u.email) : "User" };
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  email_verified: string | null;
  role: string;
  membership_tier: string | null;
  store_credit_balance: string;
  points_balance: number;
  trust_score: number;
  trade_count: number;
  total_spend: string;
  country: string | null;
  is_verified: boolean;
  bank_verified: boolean;
  created_at: string;
}

interface TrustRow {
  trust_score: number;
  seller_score: number;
  buyer_score: number;
  total_trades: number;
  completed_trades: number;
  cancelled_trades: number;
  disputed_trades: number;
  disputes_won: number;
  disputes_lost: number;
  avg_rating: string;
  total_reviews: number;
  total_volume: string;
  largest_trade: string;
  trade_limit: string;
  daily_limit: string;
  is_flagged: boolean;
  flag_reason: string | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_until: string | null;
  updated_at: string | null;
}

interface KycRow {
  status: string;
  full_legal_name: string;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone_verified: boolean;
  verified_at: string | null;
  rejected_reason: string | null;
}

interface OrderRow {
  id: string;
  status: string;
  total_gbp: string;
  customer_email: string;
  created_at: string;
}

interface ChargebackRow {
  stripe_dispute_id: string;
  stripe_status: string;
  amount_gbp: string;
  stripe_reason: string | null;
  evidence_due_at: string | null;
  created_at: string;
}

interface TradeRow {
  id: string;
  sku: string;
  price: string;
  status: string;
  side: "buyer" | "seller";
  counterparty_email: string | null;
  created_at: string;
}

interface FraudRow {
  id: string;
  signal_type: string;
  severity: string;
  description: string;
  resolved: boolean;
  created_at: string;
}

interface AdminActionRow {
  id: string;
  actor_label: string | null;
  action: string;
  target_kind: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
}

const ROLE_TONE: Record<string, Tone> = {
  admin:    "purple",
  staff:    "blue",
  user:     "neutral",
};

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "red",
  high:     "red",
  medium:   "amber",
  low:      "neutral",
};

const ORDER_STATUS_TONE: Record<string, Tone> = {
  completed: "emerald",
  shipped:   "blue",
  delivered: "green",
  pending:   "amber",
  cancelled: "neutral",
  refunded:  "sky",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Guard the UUID cast — without this, a malformed slug throws a Postgres
  // "invalid input syntax for type uuid" 500 instead of a clean 404.
  if (!UUID_RE.test(id)) notFound();

  // Identity is required — if the user doesn't exist, 404.
  const userResult = await sfQuery<UserRow>(
    `SELECT id::text, email, name, username, email_verified::text, role,
            membership_tier, store_credit_balance::text, points_balance,
            trust_score, trade_count, total_spend::text, country,
            is_verified, bank_verified, created_at
       FROM users WHERE id = $1::uuid`,
    [id],
  );
  if (userResult.rows.length === 0) notFound();
  const user = userResult.rows[0]!;

  // Everything else is best-effort. Schema drift in dev (or missing
  // legacy tables in storefront fork) shouldn't take the page down.
  const [
    trustResult,
    kycResult,
    openIssues,
    recentOrders,
    recentChargebacks,
    recentTrades,
    recentFraud,
    recentAdminActions,
    payoutHoldCount,
  ] = await Promise.all([
    safe(
      () => sfQuery<TrustRow>(
        `SELECT trust_score, seller_score, buyer_score,
                total_trades, completed_trades, cancelled_trades,
                disputed_trades, disputes_won, disputes_lost,
                avg_rating::text, total_reviews,
                total_volume::text, largest_trade::text,
                trade_limit::text, daily_limit::text,
                is_flagged, flag_reason, is_suspended, suspended_reason, suspended_until,
                updated_at::text AS updated_at
           FROM trust_profiles WHERE user_id = $1::uuid`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<KycRow>(
        `SELECT status::text, full_legal_name, city, postcode, country,
                phone_verified, verified_at, rejected_reason
           FROM user_verifications WHERE user_id = $1::uuid`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<{
        chargebacks_open: string; disputes_open: string;
        fraud_unresolved: string; trades_disputed: string;
      }>(
        `SELECT
           (SELECT COUNT(*)::text FROM chargebacks
              WHERE user_id = $1::uuid
                AND stripe_status NOT IN
                  ('won','lost','warning_closed','charge_refunded','admin_resolved')
           ) AS chargebacks_open,
           (SELECT COUNT(*)::text FROM trade_disputes
              WHERE raised_by = $1::uuid AND status NOT IN
                ('resolved_buyer','resolved_seller','resolved_split','closed')
           ) AS disputes_open,
           (SELECT COUNT(*)::text FROM fraud_signals
              WHERE user_id = $1::uuid AND resolved = FALSE
           ) AS fraud_unresolved,
           (SELECT COUNT(*)::text FROM trade_disputes td
             JOIN market_trades mt ON mt.id = td.trade_id
              WHERE (mt.buyer_id = $1::uuid OR mt.seller_id = $1::uuid)
                AND td.status NOT IN
                  ('resolved_buyer','resolved_seller','resolved_split','closed')
           ) AS trades_disputed`,
        [id],
      ),
      { rows: [{ chargebacks_open: "—", disputes_open: "—", fraud_unresolved: "—", trades_disputed: "—" }] },
    ),
    safe(
      () => sfQuery<OrderRow>(
        `SELECT id::text, status, total_gbp::text, customer_email, created_at
           FROM customer_orders
          WHERE user_id = $1::uuid
          ORDER BY created_at DESC LIMIT 10`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<ChargebackRow>(
        `SELECT stripe_dispute_id, stripe_status, amount_gbp::text,
                stripe_reason, evidence_due_at, created_at
           FROM chargebacks
          WHERE user_id = $1::uuid
          ORDER BY created_at DESC LIMIT 5`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<TradeRow>(
        // market_trades has escrow_status (no plain `status` column); aliasing
        // it to keep the `TradeRow.status` interface stable.
        `SELECT t.id::text, t.sku, t.price::text, t.escrow_status::text AS status,
                CASE WHEN t.buyer_id = $1::uuid THEN 'buyer' ELSE 'seller' END AS side,
                CASE WHEN t.buyer_id = $1::uuid THEN sus.email ELSE bus.email END AS counterparty_email,
                t.created_at
           FROM market_trades t
           LEFT JOIN users bus ON bus.id = t.buyer_id
           LEFT JOIN users sus ON sus.id = t.seller_id
          WHERE t.buyer_id = $1::uuid OR t.seller_id = $1::uuid
          ORDER BY t.created_at DESC LIMIT 10`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<FraudRow>(
        `SELECT id::text, signal_type, severity, description, resolved, created_at
           FROM fraud_signals
          WHERE user_id = $1::uuid
          ORDER BY created_at DESC LIMIT 10`,
        [id],
      ),
      { rows: [] },
    ),
    safe(
      () => sfQuery<AdminActionRow>(
        `SELECT id::text, actor_label, action, target_kind, target_id, reason, created_at
           FROM admin_actions_log
          WHERE target_user_id = $1::uuid
          ORDER BY created_at DESC LIMIT 10`,
        [id],
      ),
      { rows: [] },
    ),
    safeCount(
      sfQuery,
      `SELECT COUNT(*)::int AS n FROM payout_holds
        WHERE seller_id = $1::uuid AND released = FALSE`,
      [id],
    ),
  ]);

  const trust = trustResult.rows[0] ?? null;
  const kyc = kycResult.rows[0] ?? null;
  const issues = openIssues.rows[0] ?? {
    chargebacks_open: "0", disputes_open: "0", fraud_unresolved: "0", trades_disputed: "0",
  };

  const displayName = user.name ?? user.username ?? user.email;

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title={displayName}
        provenance={<Provenance kind="live" />}
        description={
          <span className="space-x-3">
            <span>{user.email}</span>
            {user.username && <span className="text-neutral-500">@{user.username}</span>}
            <span className="text-neutral-600 font-mono text-[11px]">{user.id}</span>
          </span>
        }
        action={
          <ExternalLink
            href={`https://cambridgetcg.com/admin/users/${user.id}/journey`}
            variant="primary"
          >
            Forensic timeline →
          </ExternalLink>
        }
      />

      {/* Identity badges row */}
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          status={user.role}
          palette={ROLE_TONE}
          label={user.role}
          size="md"
        />
        {user.membership_tier && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
            {user.membership_tier}
          </span>
        )}
        {user.is_verified && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30">
            id verified
          </span>
        )}
        {user.bank_verified && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            bank verified
          </span>
        )}
        {trust?.is_suspended && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-red-500/15 text-red-400 border border-red-500/40">
            suspended
          </span>
        )}
        {trust?.is_flagged && !trust.is_suspended && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            flagged
          </span>
        )}
        {!isUnavailable(payoutHoldCount) && payoutHoldCount > 0 && (
          <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/40">
            {payoutHoldCount} payout {payoutHoldCount === 1 ? "hold" : "holds"}
          </span>
        )}
      </div>

      {/* Top KPIs */}
      <KpiGrid cols={5}>
        <KpiCard
          label="Trust score"
          value={user.trust_score}
          urgency={user.trust_score >= 70 ? "ok" : user.trust_score >= 40 ? "warning" : "critical"}
        />
        <KpiCard label="Trades" value={fmtNumber(user.trade_count)} urgency="neutral" />
        <KpiCard label="Total spend" value={fmtGBP(user.total_spend)} urgency="neutral" />
        <KpiCard label="Store credit" value={fmtGBP(user.store_credit_balance)} urgency="neutral" />
        <KpiCard label="Points" value={fmtNumber(user.points_balance)} urgency="neutral" />
      </KpiGrid>

      {/* Open issues — clickable cards into Manager queues */}
      <section>
        <SectionHeading>Open against this user</SectionHeading>
        <KpiGrid cols={4}>
          <KpiCard
            label="Open chargebacks"
            value={issues.chargebacks_open}
            urgency={parseInt(issues.chargebacks_open || "0", 10) > 0 ? "critical" : "neutral"}
            href={`/money/chargebacks?status=open&userId=${user.id}`}
          />
          <KpiCard
            label="Open disputes raised"
            value={issues.disputes_open}
            urgency={parseInt(issues.disputes_open || "0", 10) > 0 ? "warning" : "neutral"}
            href={`/trust/disputes?status=open&userId=${user.id}`}
          />
          <KpiCard
            label="Fraud signals (unresolved)"
            value={issues.fraud_unresolved}
            urgency={parseInt(issues.fraud_unresolved || "0", 10) > 0 ? "critical" : "neutral"}
            href={`/trust/fraud?userId=${user.id}`}
          />
          <KpiCard
            label="Disputed trades"
            value={issues.trades_disputed}
            urgency={parseInt(issues.trades_disputed || "0", 10) > 0 ? "warning" : "neutral"}
            href={`/commerce/market`}
          />
        </KpiGrid>
      </section>

      {/* Identity facts */}
      <section className="grid md:grid-cols-2 gap-4">
        <FactCard title="Identity">
          <Fact label="Email" value={
            <span className="flex items-center gap-2">
              <span>{user.email}</span>
              {user.email_verified && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-400">verified</span>
              )}
            </span>
          } />
          {user.country && <Fact label="Country" value={user.country} />}
          <Fact label="Joined" value={`${fmtDate(user.created_at)} (${fmtRelative(user.created_at)})`} />
        </FactCard>

        {trust && (
          <FactCard
            title="Trust profile"
            provenance={
              <>
                <Provenance
                  kind="computed"
                  at={trust.updated_at}
                  by="storefront /api/cron/maintenance"
                />
                <WhyLink
                  href="https://cambridgetcg.com/methodology/trust-score"
                  tooltip="How is the trust score computed?"
                />
              </>
            }
          >
            <Fact
              label="Score breakdown"
              value={`Buyer ${trust.buyer_score} · Seller ${trust.seller_score}`}
            />
            <Fact
              label="Trades"
              value={`${trust.completed_trades} completed · ${trust.cancelled_trades} cancelled · ${trust.disputed_trades} disputed`}
            />
            {trust.total_reviews > 0 && (
              <Fact
                label="Reviews"
                value={`${trust.avg_rating}★ over ${fmtNumber(trust.total_reviews)} reviews`}
              />
            )}
            <Fact
              label="Volume"
              value={`${fmtGBP(trust.total_volume)} total · ${fmtGBP(trust.largest_trade)} largest`}
            />
            <Fact
              label="Limits"
              value={`${fmtGBP(trust.trade_limit)} per trade · ${fmtGBP(trust.daily_limit)} daily`}
            />
            {trust.is_suspended && trust.suspended_reason && (
              <p className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                <span className="font-bold uppercase tracking-wider">Suspended:</span> {trust.suspended_reason}
                {trust.suspended_until && (
                  <span className="block mt-1">until {fmtDate(trust.suspended_until)}</span>
                )}
              </p>
            )}
            {trust.is_flagged && trust.flag_reason && !trust.is_suspended && (
              <p className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                <span className="font-bold uppercase tracking-wider">Flagged:</span> {trust.flag_reason}
              </p>
            )}
          </FactCard>
        )}

        {kyc && (
          <FactCard title="KYC verification">
            <Fact label="Status" value={
              <StatusBadge
                status={kyc.status}
                palette={{ approved: "emerald", pending: "amber", rejected: "red" }}
              />
            } />
            <Fact label="Legal name" value={kyc.full_legal_name} />
            {(kyc.city || kyc.postcode) && (
              <Fact label="Address" value={[kyc.city, kyc.postcode, kyc.country].filter(Boolean).join(", ")} />
            )}
            <Fact label="Phone" value={kyc.phone_verified ? "Verified" : "Not verified"} />
            {kyc.verified_at && <Fact label="Verified at" value={fmtDateTime(kyc.verified_at)} />}
            {kyc.rejected_reason && (
              <p className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                <span className="font-bold uppercase tracking-wider">Rejected:</span> {kyc.rejected_reason}
              </p>
            )}
          </FactCard>
        )}
      </section>

      {/* Recent admin actions — when the platform last acted on this user */}
      <section>
        <SectionHeading count={recentAdminActions.rows.length}>Recent admin actions</SectionHeading>
        {recentAdminActions.rows.length === 0 ? (
          <EmptyState title="No admin actions recorded against this user." />
        ) : (
          <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
            {recentAdminActions.rows.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-baseline justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-mono">{a.action}</p>
                  {a.reason && <p className="text-xs text-neutral-400 mt-0.5">{a.reason}</p>}
                  <p className="text-[11px] text-neutral-600 mt-0.5">
                    by {a.actor_label ?? "system"}
                    {a.target_kind !== "user" && ` · ${a.target_kind}${a.target_id ? `:${a.target_id.slice(0, 8)}` : ""}`}
                  </p>
                </div>
                <span className="text-xs text-neutral-500 whitespace-nowrap">
                  {fmtRelative(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 text-right">
          <Link
            href={`/system/audit?q=${encodeURIComponent(user.id)}`}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            All admin actions →
          </Link>
        </div>
      </section>

      {/* Recent customer orders */}
      <section>
        <SectionHeading count={recentOrders.rows.length}>Recent orders (B2C)</SectionHeading>
        {recentOrders.rows.length === 0 ? (
          <EmptyState title="No customer orders for this user." />
        ) : (
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Order</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-right px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {recentOrders.rows.map((o) => (
                  <tr key={o.id} className="hover:bg-neutral-900/50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/ops/orders?q=${o.id}`} className="text-amber-400 hover:text-amber-300">
                        #{o.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={o.status} palette={ORDER_STATUS_TONE} />
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtGBP(o.total_gbp)}</td>
                    <td className="px-3 py-2 text-right text-xs text-neutral-400 whitespace-nowrap">
                      {fmtDate(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 text-right">
          <Link
            href={`/ops/orders?userId=${user.id}`}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            All orders →
          </Link>
        </div>
      </section>

      {/* Recent chargebacks */}
      {recentChargebacks.rows.length > 0 && (
        <section>
          <SectionHeading count={recentChargebacks.rows.length}>Recent chargebacks</SectionHeading>
          <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
            {recentChargebacks.rows.map((c) => {
              const dueMs = c.evidence_due_at ? new Date(c.evidence_due_at).getTime() - Date.now() : null;
              const dueDays = dueMs != null ? Math.floor(dueMs / 86_400_000) : null;
              return (
                <div key={c.stripe_dispute_id} className="px-4 py-3 flex items-baseline justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-amber-400 font-mono">{fmtGBP(c.amount_gbp)}</span>
                      <StatusBadge status={c.stripe_status} />
                      {c.stripe_reason && (
                        <span className="text-xs text-neutral-500 italic">{c.stripe_reason}</span>
                      )}
                      <Verifiability
                        source="Stripe"
                        id={c.stripe_dispute_id}
                        href={`https://dashboard.stripe.com/disputes/${c.stripe_dispute_id}`}
                      />
                    </div>
                    {c.evidence_due_at && dueDays != null && (
                      <p className={`text-xs mt-1 ${dueDays <= 3 ? "text-red-400 font-bold" : "text-neutral-500"}`}>
                        Evidence due {fmtDate(c.evidence_due_at)}
                        {dueDays >= 0 ? ` (${dueDays}d)` : ` (overdue ${Math.abs(dueDays)}d)`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500 whitespace-nowrap">{fmtDate(c.created_at)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-right">
            <Link
              href={`/money/chargebacks?userId=${user.id}`}
              className="text-xs text-amber-400 hover:text-amber-300 underline"
            >
              All chargebacks →
            </Link>
          </div>
        </section>
      )}

      {/* Recent market trades */}
      {recentTrades.rows.length > 0 && (
        <section>
          <SectionHeading count={recentTrades.rows.length}>Recent P2P trades</SectionHeading>
          <div className="rounded-lg border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Side</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">Price</th>
                  <th className="text-left px-3 py-2">Counterparty</th>
                  <th className="text-right px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {recentTrades.rows.map((t) => (
                  <tr key={t.id} className="hover:bg-neutral-900/50">
                    <td className="px-3 py-2 font-mono text-xs">{t.sku}</td>
                    <td className="px-3 py-2 text-xs uppercase tracking-wider text-neutral-400">{t.side}</td>
                    <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-2 text-right font-mono">{fmtGBP(t.price)}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400 truncate max-w-[200px]">
                      {t.counterparty_email ?? <span className="text-neutral-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-neutral-400 whitespace-nowrap">
                      {fmtDate(t.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent fraud signals */}
      {recentFraud.rows.length > 0 && (
        <section>
          <SectionHeading count={recentFraud.rows.length}>Recent fraud signals</SectionHeading>
          <div className="rounded-lg border border-neutral-800 divide-y divide-neutral-800">
            {recentFraud.rows.map((f) => (
              <div key={f.id} className="px-4 py-3 flex items-baseline justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={f.severity} palette={SEVERITY_TONE} />
                    <span className="text-sm text-white font-mono">{f.signal_type}</span>
                    {f.resolved && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-400">resolved</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">{f.description}</p>
                </div>
                <span className="text-xs text-neutral-500 whitespace-nowrap">{fmtDate(f.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Local helpers (not promoted to @/lib/ui yet — re-evaluate after a
//    second user-detail-style page lands). ────────────────────────────

function FactCard({
  title,
  provenance,
  children,
}: {
  title: string;
  /** Optional provenance pill rendered next to the title — substrate-honesty rule. */
  provenance?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
        {provenance}
      </div>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-neutral-500 whitespace-nowrap">{label}</dt>
      <dd className="text-neutral-200 text-right">{value}</dd>
    </div>
  );
}
