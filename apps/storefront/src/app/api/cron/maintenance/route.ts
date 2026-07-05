import { NextResponse } from "next/server";
import { runMarketMaintenance } from "@/lib/market/db";
import { runAuctionMaintenance } from "@/lib/auction/db";
import { runBountyExpiry } from "@/lib/bounty/db";
import { runPayoutSweep } from "@/lib/payouts/sweep";
import { runAlertSweep } from "@/lib/market/watches";
import { drainEmailQueue } from "@/lib/email/queue";
import { runStreakAtRiskSweep } from "@/lib/email/streak-sweep";
import { sendAdminWeeklyDigest } from "@/lib/email/admin-digest";
import { runSellerRestockDigest, runBuyerWatchlistDigest } from "@/lib/market/digests";
import { runLiquidityMining } from "@/lib/market/liquidity";
import { runTradeinSweep } from "@/lib/tradein/sweep";
import { runQuoteSweep } from "@/lib/quote/sweep";
import { runRetailObservationTick } from "@/lib/portfolio/price-history";
import { runPriceAlertSweep } from "@/lib/portfolio/alerts";
import { runWishlistMatchSweep } from "@/lib/wishlist/matching";
import { runAnnualSpendRecompute } from "@/lib/membership/spend-sweep";
import { runSubscriptionExpirySweep } from "@/lib/membership/subscription-sweep";
import { runPointsExpirySweep } from "@/lib/membership/points-expiry";
import { runRaffleAutoDraw, retryWinnerNotifications } from "@/lib/rewards/raffle-sweep";
import { runPveReconciliationSweep } from "@/lib/game/pve-sweep";
import { runFairnessDigest } from "@/lib/provable-draw/digest";
import { runFairnessSelfAudit } from "@/lib/provable-draw/self-audit";
import { runFairnessDriftCheck } from "@/lib/provable-draw/drift";
import { runTrustScoreRecompute } from "@/lib/escrow/trust-recompute";
import { runDisputeSlaSweep } from "@/lib/trust/dispute-sla-sweep";
import { runTradeCompletionSweep } from "@/lib/market/completion";
import { runSwapExpirySweep } from "@/lib/swaps/db";
import { runFraudSweep } from "@/lib/fraud/sweep";
import { runReviewPatternSweep } from "@/lib/reviews/sweep";
import { runExternalRepDecaySweep } from "@/lib/external-rep/sweep";
import { runChargebackReconciler } from "@/lib/payments/chargeback-reconciler";
import { runSavedSearchSweep } from "@/lib/market/saved-searches";
import { expireOffers } from "@/lib/market/offers";
import { expireReturnRequests } from "@/lib/market/returns";
import { expireCancelRequests } from "@/lib/market/trade-cancels";
import { runVacationSweep } from "@/lib/market/vacation";
import { runValuationSnapshotSweep } from "@/lib/portfolio/valuation";
import { releaseExpiredReservations } from "@/lib/stock/reservations";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const start = Date.now();
  // Run pipelines independently — a failure in one shouldn't block the
  // others. Per-pipeline status is returned so the cron log is debuggable.
  // Streak sweep runs once per UTC day (20:00) — cheap guard so every
  // minute doesn't re-run it. scheduleEmail() is idempotent by key, so
  // even a double-trigger would be harmless, but we skip the SELECT.
  const now = new Date();
  const runStreakSweep =
    now.getUTCHours() === 20 && now.getUTCMinutes() < 2;
  // Admin digest — Monday 09:00 UTC, one 2-minute window. Doesn't use the
  // email_queue; sends synchronously via SES.
  const runDigest =
    now.getUTCDay() === 1 && now.getUTCHours() === 9 && now.getUTCMinutes() < 2;
  // Price history tick — once per UTC day (03:00), avoids hitting the
  // wholesale API more than needed. runRetailObservationTick is internally
  // idempotent-per-day so over-triggering is harmless.
  const runPriceTick =
    now.getUTCHours() === 3 && now.getUTCMinutes() < 2;

  const results = await Promise.allSettled([
    runMarketMaintenance(),
    runAuctionMaintenance(),
    runBountyExpiry(),
    runPayoutSweep(),
    runAlertSweep(),
    drainEmailQueue({ limit: 100 }),
    runStreakSweep ? runStreakAtRiskSweep() : Promise.resolve(null),
    // Weekly digests — self-gate to Monday 09:00 UTC + atomic digest_runs claim.
    runSellerRestockDigest(),
    runBuyerWatchlistDigest(),
    runDigest ? sendAdminWeeklyDigest() : Promise.resolve(null),
    // Liquidity mining — idempotent per (order, UTC day), safe every minute
    runLiquidityMining(),
    // Trade-in: expire quotes past their 24h response window + email
    runTradeinSweep(),
    // Quote: expire 'quoted' offers past offer_expires_at + email
    runQuoteSweep(),
    // Portfolio price-history sampler
    runPriceTick ? runRetailObservationTick() : Promise.resolve(null),
    // Portfolio price-alert evaluator — runs right after the price tick so
    // we evaluate against the freshest sample. Idempotent per alert+day
    // via the queue's idempotency_key, so minute cadence is fine.
    runPriceAlertSweep(),
    // Wishlist matching — same shape, different direction: finds wanted
    // cards now available at ≤ max_price. Per-wishlist-item idempotency
    // key + 7-day cooldown like price alerts.
    runWishlistMatchSweep(),
    // Annual spend recompute — self-gates to 02:00 UTC daily
    runAnnualSpendRecompute(),
    // Subscription expiry catch-up sweep
    runSubscriptionExpirySweep(),
    // Points expiry — self-gates to 02:30 UTC daily
    runPointsExpirySweep(),
    // Raffle auto-draw + winner email
    runRaffleAutoDraw(),
    // Catch-up: notify winners whose first email failed
    retryWinnerNotifications(),
    // PVE win reconciliation — recover unawarded wins after victory-handler crashes
    runPveReconciliationSweep(),
    // Fairness digest — hashes revealed draws into a Merkle root so
    // inclusion proofs become tamper-evident against our own DB.
    runFairnessDigest(),
    // Fairness self-audit — samples random revealed draws and re-runs
    // the proof math server-side to detect corruption / tampering.
    runFairnessSelfAudit(),
    // Fairness drift — daily χ² check per tier/kind; alerts admins when
    // a group diverges beyond threshold.
    runFairnessDriftCheck(),
    // Trust score daily recompute + history snapshot. Self-gates to
    // 05:00 UTC; covers users active in the last 90 days.
    runTrustScoreRecompute(),
    // Fraud detection sweep — daily at 04:30 UTC, runs all per-user
    // passes for users active in the last 24h, evaluates auto-suspend.
    runFraudSweep(),
    // Review pattern detection — daily at 04:45 UTC, runs after fraud
    // so reviewer flags get priority over reviewer-pattern flags.
    runReviewPatternSweep(),
    // Saved searches — scan new asks against active saved searches.
    // Idempotent via UNIQUE(search_id, order_id); MAX_PER_RUN=200
    // per tick caps Stripe-API-equivalent fan-out.
    runSavedSearchSweep(),
    // Offers TTL — 48h response window. Idempotent via partial idx
    // on (status IN pending|countered).
    expireOffers(),
    // Returns request TTL — 7d seller response window. Idempotent
    // via partial idx on status='requested'.
    expireReturnRequests(),
    // Trade-cancellation TTL — 12h other-party response window.
    // Notifies the requester on expiry; trade continues to its
    // own 24h payment window. Idempotent via partial idx.
    expireCancelRequests(),
    // Seller vacation: scheduled→active on starts_at (pause asks +
    // extend offer/return/cancel response windows by duration);
    // active→ended on ends_at (restore asks). Idempotent via the
    // applied_at / unapplied_at markers on each row.
    runVacationSweep(),
    // Portfolio valuation snapshot — daily total-value row in
    // portfolio_snapshots per active user. Idempotent on
    // UNIQUE(user_id, snapshot_date) — re-runs update today's row.
    runValuationSnapshotSweep(),
    // External-rep decay — daily at 05:15 UTC, re-verifies entries
    // past their 90-day decay clock; downgrades after 3 consecutive
    // failed re-checks.
    runExternalRepDecaySweep(),
    // Chargeback reconciler — daily at 06:00 UTC, polls Stripe for
    // disputes the webhook may have missed. Idempotent via the
    // chargebacks PK so re-discovery is a no-op.
    runChargebackReconciler(),
    // Stock reservations: release any whose 30-min TTL has expired.
    // See docs/architecture/storefront-checkout-flow.md. Appended at the
    // end so the existing positional destructuring below stays aligned.
    releaseExpiredReservations(),
    // Dispute SLA: auto-escalate 'open' disputes past their response window
    // (trade dispute_window_hours, default 72h) to the admin priority queue.
    // Pure status move — never touches escrow or money. Appended at the end to
    // keep the positional destructuring below aligned.
    runDisputeSlaSweep(),
    // Trade completion: auto-complete shipped trades whose dispute window
    // (the trade's own dispute_window_hours) elapsed with no open dispute/
    // return/cancel, so the payout sweep above can finally fire for them.
    // Appended at the end to keep the positional destructuring aligned.
    runTradeCompletionSweep(),
    // Swap proposals past their own expires_at flip to 'expired'.
    // Appended at the end to keep the positional destructuring aligned.
    runSwapExpirySweep(),
  ]);

  const [market, auctions, bounty, payouts, alerts, emails, streakSweep, restockDigest, watchlistDigest, adminDigest, liquidity, tradeinSweep, quoteSweep, priceTick, priceAlertSweep, wishlistMatchSweep, spendRecompute, subSweep, pointsExpiry, raffleSweep, raffleRetry, pveSweep, fairnessDigest, fairnessAudit, fairnessDrift, trustRecompute, fraudSweep, reviewSweep, savedSearchSweep, offersExpiry, returnsExpiry, cancelExpiry, vacationSweep, valuationSnapshot, externalRepSweep, chargebackReconciler, stockReservationSweep, disputeSlaSweep, tradeCompletionSweep, swapExpirySweep] = results;
  if (stockReservationSweep.status === "fulfilled") {
    const r = stockReservationSweep.value;
    if (r.ok && r.released > 0) {
      console.log(`[cron] stock: released ${r.released} expired reservation(s)`);
    } else if (!r.ok) {
      console.error(`[cron] stock: reservation sweep failed: ${r.message}`);
    }
  } else {
    console.error(`[cron] stock: reservation sweep rejected:`, stockReservationSweep.reason);
  }

  const status = {
    market: market.status,
    auctions: auctions.status,
    bounty:
      bounty.status === "fulfilled"
        ? { status: "fulfilled", ...bounty.value }
        : { status: "rejected" },
    payouts:
      payouts.status === "fulfilled"
        ? { status: "fulfilled", ...payouts.value }
        : { status: "rejected" },
    alerts:
      alerts.status === "fulfilled"
        ? { status: "fulfilled", ...alerts.value }
        : { status: "rejected" },
    emails:
      emails.status === "fulfilled"
        ? { status: "fulfilled", ...emails.value }
        : { status: "rejected" },
    streakSweep:
      streakSweep.status === "fulfilled" && streakSweep.value != null
        ? { status: "fulfilled", ...streakSweep.value }
        : streakSweep.status === "rejected"
          ? { status: "rejected" }
          : { status: "skipped" },
    restockDigest:
      restockDigest.status === "fulfilled"
        ? (restockDigest.value.skipped ? { status: "skipped" } : { status: "fulfilled", sent: restockDigest.value.sent })
        : { status: "rejected" },
    watchlistDigest:
      watchlistDigest.status === "fulfilled"
        ? (watchlistDigest.value.skipped ? { status: "skipped" } : { status: "fulfilled", sent: watchlistDigest.value.sent })
        : { status: "rejected" },
    adminDigest:
      adminDigest.status === "fulfilled" && adminDigest.value != null
        ? { status: "fulfilled", sent: adminDigest.value.ok, error: adminDigest.value.ok ? null : adminDigest.value.error }
        : adminDigest.status === "rejected"
          ? { status: "rejected" }
          : { status: "skipped" },
    liquidity:
      liquidity.status === "fulfilled"
        ? { status: "fulfilled", ...liquidity.value }
        : { status: "rejected" },
    tradeinSweep:
      tradeinSweep.status === "fulfilled"
        ? { status: "fulfilled", ...tradeinSweep.value }
        : { status: "rejected" },
    quoteSweep:
      quoteSweep.status === "fulfilled"
        ? { status: "fulfilled", ...quoteSweep.value }
        : { status: "rejected" },
    priceTick:
      priceTick.status === "fulfilled" && priceTick.value != null
        ? { status: "fulfilled", ...priceTick.value }
        : priceTick.status === "rejected"
          ? { status: "rejected" }
          : { status: "skipped" },
    wishlistMatchSweep:
      wishlistMatchSweep.status === "fulfilled"
        ? { status: "fulfilled", ...wishlistMatchSweep.value }
        : { status: "rejected" },
    priceAlertSweep:
      priceAlertSweep.status === "fulfilled"
        ? { status: "fulfilled", ...priceAlertSweep.value }
        : { status: "rejected" },
    spendRecompute:
      spendRecompute.status === "fulfilled"
        ? (spendRecompute.value.ranInWindow
            ? { status: "fulfilled", ...spendRecompute.value }
            : { status: "skipped" })
        : { status: "rejected" },
    subSweep:
      subSweep.status === "fulfilled"
        ? { status: "fulfilled", ...subSweep.value }
        : { status: "rejected" },
    pointsExpiry:
      pointsExpiry.status === "fulfilled"
        ? (pointsExpiry.value.ranInWindow
            ? { status: "fulfilled", ...pointsExpiry.value }
            : { status: "skipped" })
        : { status: "rejected" },
    raffleSweep:
      raffleSweep.status === "fulfilled"
        ? { status: "fulfilled", ...raffleSweep.value }
        : { status: "rejected" },
    raffleRetry:
      raffleRetry.status === "fulfilled"
        ? { status: "fulfilled", ...raffleRetry.value }
        : { status: "rejected" },
    pveSweep:
      pveSweep.status === "fulfilled"
        ? { status: "fulfilled", ...pveSweep.value }
        : { status: "rejected" },
    fairnessDigest:
      fairnessDigest.status === "fulfilled"
        ? (fairnessDigest.value.skipped
            ? { status: "skipped" }
            : { status: "fulfilled", digested: fairnessDigest.value.digested, root: fairnessDigest.value.root })
        : { status: "rejected" },
    fairnessAudit:
      fairnessAudit.status === "fulfilled"
        ? { status: "fulfilled", ...fairnessAudit.value }
        : { status: "rejected" },
    fairnessDrift:
      fairnessDrift.status === "fulfilled"
        ? (fairnessDrift.value.ranInWindow
            ? { status: "fulfilled", ...fairnessDrift.value }
            : { status: "skipped" })
        : { status: "rejected" },
    trustRecompute:
      trustRecompute.status === "fulfilled"
        ? (trustRecompute.value.ranInWindow
            ? { status: "fulfilled", ...trustRecompute.value }
            : { status: "skipped" })
        : { status: "rejected" },
    fraudSweep:
      fraudSweep.status === "fulfilled"
        ? (fraudSweep.value.ranInWindow
            ? { status: "fulfilled", ...fraudSweep.value }
            : { status: "skipped" })
        : { status: "rejected" },
    reviewSweep:
      reviewSweep.status === "fulfilled"
        ? (reviewSweep.value.ranInWindow
            ? { status: "fulfilled", ...reviewSweep.value }
            : { status: "skipped" })
        : { status: "rejected" },
    externalRepSweep:
      externalRepSweep.status === "fulfilled"
        ? (externalRepSweep.value.ranInWindow
            ? { status: "fulfilled", ...externalRepSweep.value }
            : { status: "skipped" })
        : { status: "rejected" },
    chargebackReconciler:
      chargebackReconciler.status === "fulfilled"
        ? (chargebackReconciler.value.ranInWindow
            ? { status: "fulfilled", ...chargebackReconciler.value }
            : { status: "skipped" })
        : { status: "rejected" },
    savedSearchSweep:
      savedSearchSweep.status === "fulfilled"
        ? { status: "fulfilled", ...savedSearchSweep.value }
        : { status: "rejected" },
    offersExpiry:
      offersExpiry.status === "fulfilled"
        ? { status: "fulfilled", ...offersExpiry.value }
        : { status: "rejected" },
    returnsExpiry:
      returnsExpiry.status === "fulfilled"
        ? { status: "fulfilled", ...returnsExpiry.value }
        : { status: "rejected" },
    cancelExpiry:
      cancelExpiry.status === "fulfilled"
        ? { status: "fulfilled", ...cancelExpiry.value }
        : { status: "rejected" },
    valuationSnapshot:
      valuationSnapshot.status === "fulfilled"
        ? { status: "fulfilled", ...valuationSnapshot.value }
        : { status: "rejected" },
    vacationSweep:
      vacationSweep.status === "fulfilled"
        ? { status: "fulfilled", ...vacationSweep.value }
        : { status: "rejected" },
    disputeSlaSweep:
      disputeSlaSweep.status === "fulfilled"
        ? { status: "fulfilled", ...disputeSlaSweep.value }
        : { status: "rejected" },
    tradeCompletionSweep:
      tradeCompletionSweep.status === "fulfilled"
        ? { status: "fulfilled", ...tradeCompletionSweep.value }
        : { status: "rejected" },
    durationMs: Date.now() - start,
  };

  if (market.status === "rejected") console.error("[cron] market maintenance failed:", market.reason);
  if (auctions.status === "rejected") console.error("[cron] auction maintenance failed:", auctions.reason);
  if (bounty.status === "rejected") console.error("[cron] bounty expiry failed:", bounty.reason);
  else if (bounty.value.expiredCount > 0 || bounty.value.reverted > 0) {
    console.log(
      `[cron] bounty: expired ${bounty.value.expiredCount} items, awarded £${bounty.value.creditTotalGbp.toFixed(2)}` +
      (bounty.value.reverted > 0 ? ` (${bounty.value.reverted} reverted for retry)` : "")
    );
  }
  if (payouts.status === "rejected") console.error("[cron] payout sweep failed:", payouts.reason);
  else if (payouts.value.tradesPaid + payouts.value.auctionsPaid > 0 ||
           payouts.value.tradeFailures.length + payouts.value.auctionFailures.length > 0) {
    console.log(
      `[cron] payouts: ${payouts.value.tradesPaid} trades + ${payouts.value.auctionsPaid} auctions paid; ` +
      `${payouts.value.tradeFailures.length + payouts.value.auctionFailures.length} failed` +
      (payouts.value.throttled ? " (throttled)" : "")
    );
    for (const f of [...payouts.value.tradeFailures, ...payouts.value.auctionFailures]) {
      console.error(`[cron] payout failure ${f.id}: ${f.error}`);
    }
  }
  if (alerts.status === "rejected") console.error("[cron] alert sweep failed:", alerts.reason);
  else if (alerts.value.fired > 0 || alerts.value.failures > 0) {
    console.log(
      `[cron] alerts: ${alerts.value.fired} fired, ${alerts.value.failures} failed` +
      (alerts.value.throttled ? " (throttled)" : "")
    );
  }
  if (restockDigest.status === "rejected") console.error("[cron] restock digest failed:", restockDigest.reason);
  else if (!restockDigest.value.skipped) {
    console.log(`[cron] restock digest: sent ${restockDigest.value.sent}`);
  }
  if (watchlistDigest.status === "rejected") console.error("[cron] watchlist digest failed:", watchlistDigest.reason);
  else if (!watchlistDigest.value.skipped) {
    console.log(`[cron] watchlist digest: sent ${watchlistDigest.value.sent}`);
  }
  if (emails.status === "rejected") console.error("[cron] email drain failed:", emails.reason);
  else if (emails.value.picked > 0) {
    console.log(
      `[cron] emails: picked ${emails.value.picked}, ` +
      `sent ${emails.value.sent}, cancelled ${emails.value.cancelled}, ` +
      `failed ${emails.value.failed}, dead ${emails.value.dead}`,
    );
    for (const e of emails.value.errors) {
      console.error(`[cron] email queue error ${e.id} (${e.event}): ${e.error}`);
    }
  }
  if (streakSweep.status === "rejected") console.error("[cron] streak sweep failed:", streakSweep.reason);
  else if (streakSweep.value != null && streakSweep.value.atRiskCount > 0) {
    console.log(
      `[cron] streak sweep: ${streakSweep.value.atRiskCount} at-risk, ` +
      `${streakSweep.value.queuedCount} queued, ${streakSweep.value.errors} errors`,
    );
  }
  if (liquidity.status === "rejected") console.error("[cron] liquidity mining failed:", liquidity.reason);
  else if (liquidity.value.awards > 0) {
    console.log(
      `[cron] liquidity: ${liquidity.value.awards} awards, £${liquidity.value.amountGbp.toFixed(2)} credit` +
      (liquidity.value.throttled ? " (throttled)" : "")
    );
  }
  if (tradeinSweep.status === "rejected") console.error("[cron] tradein sweep failed:", tradeinSweep.reason);
  else if (tradeinSweep.value.expired > 0) {
    console.log(
      `[cron] tradein: expired ${tradeinSweep.value.expired} quote(s), ` +
      `${tradeinSweep.value.emailsSent} emails sent, ${tradeinSweep.value.emailsFailed} failed`
    );
  }
  if (quoteSweep.status === "rejected") console.error("[cron] quote sweep failed:", quoteSweep.reason);
  else if (quoteSweep.value.expired > 0) {
    console.log(
      `[cron] quote: expired ${quoteSweep.value.expired} offer(s), ` +
      `${quoteSweep.value.emailsSent} emails sent, ${quoteSweep.value.emailsFailed} failed`
    );
  }
  if (spendRecompute.status === "rejected") console.error("[cron] spend recompute failed:", spendRecompute.reason);
  else if (spendRecompute.value.ranInWindow) {
    console.log(
      `[cron] spend recompute: ${spendRecompute.value.recomputed} users, ` +
      `${spendRecompute.value.tierChanges} tier changes, ${spendRecompute.value.failures} failures`
    );
  }
  if (pointsExpiry.status === "rejected") console.error("[cron] points expiry failed:", pointsExpiry.reason);
  else if (pointsExpiry.value.ranInWindow && pointsExpiry.value.expired > 0) {
    console.log(
      `[cron] points expiry: ${pointsExpiry.value.expired} users, ` +
      `${pointsExpiry.value.totalPointsExpired} berries expired, ${pointsExpiry.value.failures} failures`
    );
  }
  if (raffleSweep.status === "rejected") console.error("[cron] raffle sweep failed:", raffleSweep.reason);
  else if (raffleSweep.value.drawn > 0) {
    console.log(
      `[cron] raffles: ${raffleSweep.value.drawn} drawn, ${raffleSweep.value.notified} notified, ` +
      `${raffleSweep.value.failures} failures`
    );
  }
  if (raffleRetry.status === "fulfilled" && raffleRetry.value.retried > 0) {
    console.log(`[cron] raffle retry: ${raffleRetry.value.retried} winners notified`);
  }
  if (subSweep.status === "rejected") console.error("[cron] subscription sweep failed:", subSweep.reason);
  else if (subSweep.value.expired > 0) {
    console.log(
      `[cron] subscriptions: ${subSweep.value.expired} expired, ` +
      `${subSweep.value.recalculated} tiers recalculated, ${subSweep.value.failures} failures`
    );
  }
  if (pveSweep.status === "rejected") console.error("[cron] pve sweep failed:", pveSweep.reason);
  else if (pveSweep.value.reconciled > 0 || pveSweep.value.failures > 0) {
    console.log(
      `[cron] pve reconcile: ${pveSweep.value.reconciled} recovered, ${pveSweep.value.failures} failed`
    );
  }
  if (fairnessDigest.status === "rejected") console.error("[cron] fairness digest failed:", fairnessDigest.reason);
  else if (!fairnessDigest.value.skipped) {
    console.log(
      `[cron] fairness digest: ${fairnessDigest.value.digested} leaves → root ${fairnessDigest.value.root?.slice(0, 12)}…`
    );
  }
  if (fairnessAudit.status === "rejected") console.error("[cron] fairness self-audit failed:", fairnessAudit.reason);
  else if (fairnessAudit.value.sampled > 0) {
    console.log(
      `[cron] fairness self-audit: ${fairnessAudit.value.passed}/${fairnessAudit.value.sampled} passed` +
      (fairnessAudit.value.failed > 0 ? ` — ${fairnessAudit.value.failed} FAILED` : "")
    );
    for (const f of fairnessAudit.value.failures) {
      console.error(`[cron] fairness-audit FAIL ${f.source}:${f.id} — ${f.reason}`);
    }
  }
  if (fairnessDrift.status === "rejected") console.error("[cron] fairness drift failed:", fairnessDrift.reason);
  else if (fairnessDrift.value.ranInWindow && fairnessDrift.value.alertsRaised > 0) {
    console.log(
      `[cron] fairness drift: ${fairnessDrift.value.alertsRaised} alert${fairnessDrift.value.alertsRaised === 1 ? "" : "s"} raised ` +
      `across ${fairnessDrift.value.checked} groups checked`
    );
  }
  if (trustRecompute.status === "rejected") console.error("[cron] trust recompute failed:", trustRecompute.reason);
  else if (trustRecompute.value.ranInWindow) {
    console.log(
      `[cron] trust recompute: ${trustRecompute.value.recomputed} recomputed, ` +
      `${trustRecompute.value.snapshots} snapshots, ${trustRecompute.value.failures} failures`
    );
  }
  if (fraudSweep.status === "rejected") console.error("[cron] fraud sweep failed:", fraudSweep.reason);
  else if (fraudSweep.value.ranInWindow) {
    console.log(
      `[cron] fraud sweep: scanned ${fraudSweep.value.scanned}, ` +
      `emitted ${fraudSweep.value.signalsEmitted} signals, ` +
      `auto-suspended ${fraudSweep.value.autoSuspends}, ` +
      `${fraudSweep.value.failures} failures`
    );
  }
  if (reviewSweep.status === "rejected") console.error("[cron] review sweep failed:", reviewSweep.reason);
  else if (reviewSweep.value.ranInWindow) {
    console.log(
      `[cron] review pattern sweep: scanned ${reviewSweep.value.scanned}, ` +
      `flags ${reviewSweep.value.flagsRaised}, auto-hidden ${reviewSweep.value.autoHidden}, ` +
      `${reviewSweep.value.failures} failures`
    );
  }
  if (externalRepSweep.status === "rejected") console.error("[cron] external-rep sweep failed:", externalRepSweep.reason);
  else if (externalRepSweep.value.ranInWindow) {
    console.log(
      `[cron] external-rep decay: checked ${externalRepSweep.value.checked}, ` +
      `succeeded ${externalRepSweep.value.succeeded}, failed ${externalRepSweep.value.failed}, ` +
      `downgraded ${externalRepSweep.value.downgraded}`
    );
  }
  if (chargebackReconciler.status === "rejected") console.error("[cron] chargeback reconciler failed:", chargebackReconciler.reason);
  else if (chargebackReconciler.value.ranInWindow) {
    console.log(
      `[cron] chargeback reconciler: fetched ${chargebackReconciler.value.fetched}, ` +
      `new ${chargebackReconciler.value.newlyIngested}, status-changed ${chargebackReconciler.value.statusChanged}, ` +
      `${chargebackReconciler.value.failures} failures`
    );
  }
  if (disputeSlaSweep.status === "rejected") console.error("[cron] dispute-sla sweep failed:", disputeSlaSweep.reason);
  else if (disputeSlaSweep.value.escalated > 0) {
    console.log(
      `[cron] dispute-sla: escalated ${disputeSlaSweep.value.escalated} stale dispute(s), ` +
      `oldest ${disputeSlaSweep.value.oldestHoursOpen}h open`
    );
  }
  if (tradeCompletionSweep.status === "rejected") console.error("[cron] trade completion sweep failed:", tradeCompletionSweep.reason);
  else if (tradeCompletionSweep.value.completed > 0 || tradeCompletionSweep.value.failures.length > 0) {
    console.log(
      `[cron] trade completion: ${tradeCompletionSweep.value.completed} auto-completed, ` +
      `${tradeCompletionSweep.value.failures.length} failed`
    );
    for (const f of tradeCompletionSweep.value.failures) {
      console.error(`[cron] trade completion failure ${f.id}: ${f.error}`);
    }
  }
  if (swapExpirySweep.status === "rejected") console.error("[cron] swap expiry sweep failed:", swapExpirySweep.reason);
  else if (swapExpirySweep.value.expired > 0) {
    console.log(`[cron] swap expiry: ${swapExpirySweep.value.expired} proposals expired`);
  }
  // Touch unused destructure to satisfy noUnusedLocals if enabled.

  return NextResponse.json(status);
}
