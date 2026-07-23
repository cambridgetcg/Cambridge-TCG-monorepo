/**
 * /account — the Overview landing page. The anchor of the account centre.
 *
 * Server component (Stage 1 of the account-centre simplification).
 * Previously a client component that re-fetched /api/auth/session (a
 * visible "Loading..." flash on every visit, re-confirming what the
 * layout's auth() gate already proved) and downloaded the FULL order +
 * trade-in lists just to show two counts. Now the page reads the same
 * underlying lib functions / SQL the per-domain pages use, directly,
 * in one server render — no HTTP round-trip through our own API routes.
 *
 * Layout, top to bottom: who you are → are you in good standing → what
 * needs you → what's moving (orders, trade-ins) → membership → sign out.
 * Calm and scannable; every deeper surface is one link away.
 *
 * Degradation contract (the safe() ethos from @/lib/admin/queries):
 * every read here is optional. A failed read renders nothing — an
 * attention row simply doesn't appear, the standing strip is omitted
 * rather than claiming "Good standing" it can't prove — and the page
 * never crashes because one of seven domains was unreachable.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth/realms";
import { query } from "@/lib/db";
import { unreadConversationCount } from "@/lib/messages/db";
import {
  Audience,
  Badge,
  Card,
  EmptyState,
  MoneyDisplay,
  PageHeader,
  Palettes,
  WhyLink,
  audienceMetadata,
} from "@/lib/ui";
import { formatDate, pluralize } from "@/lib/format";
import HandleWelcomeNote from "./_HandleWelcomeNote";

export const metadata: Metadata = {
  title: "My Account — Cambridge TCG",
  description:
    "Your account at a glance: standing, items that need you, recent orders, trade-ins, and membership.",
  other: audienceMetadata("consumer", ["account", "overview"]),
};

// This dashboard fans out ~14 reads (this page + the layout's gate). On a
// COLD serverless start — e.g. the very first load right after an OAuth
// callback — the pool pays a fresh TCP+TLS+auth to RDS before the first
// query, and the aggregate can brush the platform's default function
// timeout, which surfaces to the browser as an empty response ("cannot
// connect to server") even though sign-in already set the session cookie.
// Headroom turns that into a (slow) successful first load instead of an
// error; warm invocations are unaffected. (60 is already used by a cron
// route, so the plan allows it.)
export const maxDuration = 30;

// ── safe() — optional reads degrade, never crash ─────────────────────
//
// Same ethos as safe() in @/lib/admin/queries (and the local copies in
// lib/trust/state.ts, lib/auction/state.ts): the overview composes seven
// domains, and any one failing should cost that section, not the page.
// No logging — failures on optional reads are expected (schema drift,
// dev DB missing tables).
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** COUNT helper — `SELECT COUNT(*)::int AS n ...` → number, 0 on failure
 *  (a failed read hides the row; an absent count is never "urgent"). */
async function safeCount(sql: string, params: unknown[]): Promise<number> {
  return safe(async () => {
    const r = await query(sql, params);
    const n = Number((r.rows[0] as { n?: number | string } | undefined)?.n ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, 0);
}

// ── Standing ──────────────────────────────────────────────────────────
//
// Mirrors /api/account/standing's reads (trust_profiles + unresolved
// fraud_signals). Returns null when the read fails: we'd rather show no
// strip than claim "Good standing" on data we don't have — the strip
// itself is a substrate-honesty claim.

interface StandingSummary {
  isSuspended: boolean;
  flagCount: number;
}

async function loadStanding(userId: string): Promise<StandingSummary | null> {
  return safe(async () => {
    const [profile, flags] = await Promise.all([
      query(`SELECT is_suspended FROM trust_profiles WHERE user_id = $1`, [userId]),
      query(
        `SELECT COUNT(*)::int AS n FROM fraud_signals
          WHERE user_id = $1 AND resolved = false`,
        [userId],
      ),
    ]);
    return {
      isSuspended: (profile.rows[0] as { is_suspended?: boolean } | undefined)?.is_suspended === true,
      flagCount: Number((flags.rows[0] as { n?: number | string })?.n ?? 0),
    };
  }, null);
}

// ── Needs your attention ──────────────────────────────────────────────
//
// Each item is a count over the same table + status vocabulary its
// destination page reads. Only non-zero items render; a failed count
// falls back to 0 and the row quietly doesn't exist.

interface AttentionItem {
  key: string;
  label: string;
  href: string;
}

async function loadAttention(userId: string): Promise<AttentionItem[]> {
  const [awaitingPayment, openReturns, disputed, failedPayments, unreadMessages] =
    await Promise.all([
      // Escrow trades where this user is the buyer and the clock is
      // running on payment (EscrowStatus 'awaiting_payment').
      safeCount(
        `SELECT COUNT(*)::int AS n FROM market_trades
          WHERE buyer_id = $1 AND escrow_status = 'awaiting_payment'
            AND (payment_expires_at IS NULL OR payment_expires_at > NOW())`,
        [userId],
      ),
      // Open returns on either side — the active-statuses set matches
      // listReturnsFor{Buyer,Seller}(activeOnly) in lib/market/returns.ts.
      safeCount(
        `SELECT COUNT(*)::int AS n FROM market_returns
          WHERE (buyer_id = $1 OR seller_id = $1)
            AND status IN ('requested','accepted','shipping','received')`,
        [userId],
      ),
      // Disputed trades on either side.
      safeCount(
        `SELECT COUNT(*)::int AS n FROM market_trades
          WHERE (buyer_id = $1 OR seller_id = $1) AND escrow_status = 'disputed'`,
        [userId],
      ),
      // Failed payments — the table has no resolved flag (see migration
      // 0074), so "recent" stands in for "live": a 30-day window matching
      // the practical retry horizon, not all history.
      safeCount(
        `SELECT COUNT(*)::int AS n FROM failed_payments
          WHERE user_id = $1 AND last_attempt_at > NOW() - INTERVAL '30 days'`,
        [userId],
      ),
      // Unread DM conversations — same source as the bell badge.
      safe(() => unreadConversationCount(userId), 0),
    ]);

  const items: AttentionItem[] = [
    {
      key: "trades-awaiting-payment",
      label: `${awaitingPayment} ${pluralize(awaitingPayment, "trade")} awaiting your payment`,
      href: "/account/trades",
    },
    {
      key: "open-returns",
      label: `${openReturns} open ${pluralize(openReturns, "return")}`,
      href: "/account/returns",
    },
    {
      key: "disputed-trades",
      label: `${disputed} disputed ${pluralize(disputed, "trade")}`,
      href: "/account/trades",
    },
    {
      key: "failed-payments",
      label: `${failedPayments} failed ${pluralize(failedPayments, "payment")} in the last 30 days`,
      href: "/account/payment-issues",
    },
    {
      key: "unread-messages",
      label: `${unreadMessages} unread ${pluralize(unreadMessages, "message")}`,
      href: "/account/messages",
    },
  ];

  // Counts drive visibility: zero (including failed-read zero) = no row.
  const counts = [awaitingPayment, openReturns, disputed, failedPayments, unreadMessages];
  return items.filter((_, i) => counts[i] > 0);
}

// ── Recent orders ─────────────────────────────────────────────────────

interface RecentOrder {
  id: number;
  status: string;
  total_gbp: string;
  created_at: string;
  item_count: number;
}

async function loadRecentOrders(email: string): Promise<RecentOrder[]> {
  return safe(async () => {
    // Same source as /api/account/orders (customer_orders by email),
    // but only the three newest and only the columns this card shows.
    const r = await query(
      `SELECT id, status, total_gbp, created_at, items
         FROM customer_orders
        WHERE customer_email = $1
        ORDER BY created_at DESC
        LIMIT 3`,
      [email],
    );
    return (r.rows as Array<RecentOrder & { items: unknown }>).map((row) => ({
      id: row.id,
      status: row.status,
      total_gbp: row.total_gbp,
      created_at: row.created_at,
      // items is a JSON column; count defensively rather than in SQL so a
      // malformed row degrades to "0 items", not a failed whole-list read.
      item_count: Array.isArray(row.items) ? row.items.length : 0,
    }));
  }, []);
}

// ── Trade-ins in progress ─────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════

export default async function AccountOverviewPage() {
  // The layout's auth() gate already ran; cache() in getSessionUser
  // collapses this to the same underlying invocation — no extra roundtrip.
  const user = (await getSessionUser())!;

  const [standing, attention, recentOrders, handle] = await Promise.all([
    loadStanding(user.id),
    loadAttention(user.id),
    loadRecentOrders(user.email),
    // The public collector handle. A failed read hides the disclosure
    // line rather than claiming a name we couldn't fetch.
    safe<string | null>(async () => {
      const r = await query(`SELECT username FROM users WHERE id = $1`, [user.id]);
      return (r.rows[0] as { username?: string | null } | undefined)?.username ?? null;
    }, null),
  ]);

  const goodStanding = standing !== null && !standing.isSuspended && standing.flagCount === 0;

  return (
    <div className="space-y-8">
      <Audience kind="consumer" />

      {/* ── 0. First-run handle greeting (one-time, client-dismissed) ── */}
      {handle && <HandleWelcomeNote handle={handle} />}

      {/* ── 1. Who you are ──────────────────────────────────────────── */}
      <div>
        <PageHeader title="My Account" description={user.email} />

        {/* Handle disclosure — the public name every listing/offer/review
            is attributed to. Persistent (the welcome note above is one-time). */}
        {handle && (
          <p className="text-sm text-ink-muted -mt-2 mb-1">
            Trading as{" "}
            <span className="font-semibold text-ink">@{handle}</span> —{" "}
            <Link
              href="/account/profile"
              className="text-accent underline underline-offset-2 hover:text-accent-strong transition"
            >
              change it in Profile &amp; settings
            </Link>
          </p>
        )}

        {/* ── 2. Standing strip — one line, green or amber ──────────────
            Omitted entirely when the read failed: "Good standing" is a
            claim, and we don't make it on data we couldn't fetch. */}
        {standing !== null && (
          <div className="flex items-center gap-2 text-sm flex-wrap -mt-2">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                goodStanding ? "bg-ok" : "bg-warning"
              }`}
            />
            {goodStanding ? (
              <span className="text-ok">All clear — nothing needs your attention</span>
            ) : (
              <>
                <span className="text-warning">
                  {standing.isSuspended
                    ? `Account on hold${
                        standing.flagCount > 0
                          ? ` · ${standing.flagCount} ${pluralize(standing.flagCount, "note")} to review`
                          : ""
                      }`
                    : `${standing.flagCount} ${pluralize(standing.flagCount, "note")} we noticed`}
                </span>
                {/* Transparency Ring 2: a flag is a user-affecting decision —
                    the affected party gets the methodology, same link the
                    standing page carries. */}
                <WhyLink href="/methodology/fraud-flag" tooltip="How does the platform flag accounts?" />
                <Link
                  href="/account/standing"
                  className="text-warning underline underline-offset-2 hover:text-warning/80 transition"
                >
                  See details →
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 3. Needs your attention — only rendered when something does ─ */}
      {attention.length > 0 && (
        <Card variant="elevated" padding="none">
          <h2 className="text-sm font-bold text-accent px-4 py-3 border-b border-border-subtle">
            Needs your attention
          </h2>
          <ul className="divide-y divide-border-subtle">
            {attention.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-subtle transition group"
                >
                  <span className="text-sm text-ink group-hover:text-ink transition">
                    {item.label}
                  </span>
                  <span className="text-ink-faint group-hover:text-accent transition shrink-0">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── 4. Recent orders ────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold text-ink">Recent orders</h2>
          {recentOrders.length > 0 && (
            <Link href="/account/orders" className="text-sm text-accent hover:underline">
              View all →
            </Link>
          )}
        </div>
        {recentOrders.length === 0 ? (
          <EmptyState
            title="No orders yet."
            description="Your purchases will appear here."
            action={
              <Link
                href="/catalog"
                className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 transition inline-block"
              >
                Browse cards
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <Link key={order.id} href="/account/orders" className="block group">
                <Card className="group-hover:border-border-strong transition">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      <Badge
                        status={order.status}
                        palette={Palettes.OrderStatusPalette}
                        labels={Palettes.OrderStatusLabels}
                      />
                      <span className="text-xs text-ink-faint font-mono">#{order.id}</span>
                      <span className="text-xs text-ink-faint">
                        {formatDate(order.created_at)}
                      </span>
                      <span className="text-xs text-ink-faint">
                        {order.item_count} {pluralize(order.item_count, "item")}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-ink shrink-0">
                      <MoneyDisplay value={order.total_gbp} />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── 7. Sign out — the same next-auth signout the client version
             POSTed to, invoked as a server action so no client JS is
             needed. Lands on "/" like before. ─────────────────────── */}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="text-sm text-ink-faint hover:text-danger transition"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
