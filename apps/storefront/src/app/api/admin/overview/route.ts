import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// One query per surfaceable queue. All COUNTs are cheap (indexed), but
// if any one errors we still return the rest — the admin hub should
// degrade gracefully rather than blank out on a schema drift.
async function safeCount(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const r = await query(sql, params);
    return parseInt(r.rows[0]?.n ?? "0", 10) || 0;
  } catch (err) {
    console.error("[admin/overview] count failed", err);
    return 0;
  }
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    tradeinsPending,
    tradeinsAwaitingPay,
    tradeinsInflight,
    quotesOpen,
    redemptionsPending,
    auctionsLive,
    verificationsPending,
    payoutsPending,
    disputesOpen,
    fraudOpen,
    emailsDead,
  ] = await Promise.all([
    // Trade-ins that need a quote composed
    safeCount(`SELECT count(*)::int AS n FROM tradein_submissions WHERE status='submitted'`),
    // Customer accepted, cards received+graded, just needs admin to flip to paid
    safeCount(`SELECT count(*)::int AS n FROM tradein_submissions WHERE status='approved'`),
    // Anything actively in the fulfilment pipe
    safeCount(`SELECT count(*)::int AS n FROM tradein_submissions WHERE status IN ('accepted','received','grading')`),
    // Quote requests still open. 'pending' = awaiting admin pricing,
    // 'accepted'/'received' = in the fulfilment chain, not yet paid.
    safeCount(`SELECT count(*)::int AS n FROM quote_requests WHERE status IN ('pending','accepted','received')`),
    // Vault-item redemptions waiting on pack+ship
    safeCount(`SELECT count(*)::int AS n FROM vault_items WHERE redemption_order_id IS NOT NULL AND status='reserved'`),
    // Live auctions (not yet settled)
    safeCount(`SELECT count(*)::int AS n FROM auctions WHERE ends_at > NOW()`),
    // ID/KYC verifications pending review
    safeCount(`SELECT count(*)::int AS n FROM user_verifications WHERE status='pending'`),
    // Payouts on hold (unreleased, uncancelled)
    safeCount(`SELECT count(*)::int AS n FROM payout_holds WHERE released = false AND cancelled = false`),
    // Open customer disputes
    safeCount(`SELECT count(*)::int AS n FROM trade_disputes WHERE status IN ('open','escalated')`),
    // Unresolved fraud signals
    safeCount(`SELECT count(*)::int AS n FROM fraud_signals WHERE resolved = false`),
    // Dead-letter email queue
    safeCount(`SELECT count(*)::int AS n FROM email_queue WHERE status='dead'`),
  ]);

  return NextResponse.json({
    queues: {
      tradeinsPending,
      tradeinsAwaitingPay,
      tradeinsInflight,
      quotesOpen,
      redemptionsPending,
      auctionsLive,
      verificationsPending,
      payoutsPending,
      disputesOpen,
      fraudOpen,
      emailsDead,
    },
  });
}
