// Payout aggregation — unions the four sources (P2P trades, auctions,
// trade-in submissions, quote requests) into pending + history buckets
// for the seller-facing /account/payouts page.
//
// Exported as pure lib functions so the route handler (thin wrapper)
// and the E2E test can exercise identical query logic without mocking
// next-auth.

import { query } from "@/lib/db";
import { formatPrice } from "@/lib/format";

// Auctions don't carry a per-row hold; the sweep uses a platform default.
// Mirrored here so the UI can show the same "available on" date that the
// cron will use when it runs. Keep in sync with src/lib/payouts/sweep.ts.
const AUCTION_HOLD_DAYS = 3;

export interface PendingTradeOrAuctionRow {
  id: string;
  label: string;
  amount: string;
  amountFormatted: string;
  // `when` is the trigger event (trade completed_at or auction paid_at) —
  // the moment the hold timer started.
  when: string;
  // `availableAt` = when the hold elapses and the sweep can pay out.
  // null means we're still waiting for the trigger event (e.g., trade
  // not yet completed, auction not yet paid).
  availableAt: string | null;
  // `isReady` collapses the date math for the UI: true once availableAt
  // is in the past.
  isReady: boolean;
  // How many days the hold runs for. Per-trade on market_trades;
  // per-platform AUCTION_HOLD_DAYS on auctions.
  holdDays: number;
}

export interface PendingSubmissionRow {
  reference: string;
  status: string;
  cashOwed: number;
  creditOwed: number;
  amount: number;
  amountFormatted: string;
  when: string;
}

export interface PendingBundle {
  trades: PendingTradeOrAuctionRow[];
  auctions: PendingTradeOrAuctionRow[];
  tradeins: PendingSubmissionRow[];
  quotes: PendingSubmissionRow[];
  totalOwed: number;
  totalOwedFormatted: string;
  // Splits for the UI: amount the seller can collect right now vs.
  // amount still in the hold window. trade-ins and quotes don't have
  // hold periods (admin marks them paid manually), so they're treated
  // as ready when present.
  readyTotal: number;
  readyTotalFormatted: string;
  holdingTotal: number;
  holdingTotalFormatted: string;
  // Earliest availableAt across all currently-holding rows so the page
  // can render "Next payout: 2 days from now" without scanning rows.
  nextAvailableAt: string | null;
}

export async function getPendingPayouts(userId: string): Promise<PendingBundle> {
  // `available_at = completed_at + payout_hold_days` is computed in SQL
  // so the cron and the UI use exactly the same date. Falls back to
  // created_at when completed_at is NULL (trade still in flight) which
  // produces a far-future availableAt and isReady=false.
  const trades = await query(
    `SELECT t.id, t.seller_payout, t.created_at, t.completed_at,
            t.payout_hold_days,
            t.completed_at + make_interval(days => COALESCE(t.payout_hold_days, 0)) AS available_at,
            COALESCE(o.card_name, t.sku) AS card_name
       FROM market_trades t
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.seller_id = $1
        AND t.escrow_status = 'completed'
        AND t.seller_paid_at IS NULL
      ORDER BY available_at ASC`,
    [userId],
  );

  const auctions = await query(
    `SELECT id, title, seller_payout, paid_at,
            paid_at + make_interval(days => $2) AS available_at
       FROM auctions
      WHERE seller_user_id = $1
        AND status = 'paid'
        AND seller_paid_at IS NULL
        AND seller_payout IS NOT NULL
      ORDER BY available_at ASC NULLS LAST`,
    [userId, AUCTION_HOLD_DAYS],
  );

  const tradeins = await query(
    `SELECT reference, status,
            COALESCE(cash_amount, quoted_cash_total)::numeric   AS cash_total,
            COALESCE(credit_amount, quoted_credit_total)::numeric AS credit_total,
            cash_paid_at, credit_issued_at, updated_at
       FROM tradein_submissions
      WHERE user_id = $1
        AND status IN ('approved', 'paid')
        AND (
          (status = 'approved')
          OR (COALESCE(cash_amount, quoted_cash_total, 0)::numeric > 0 AND cash_paid_at IS NULL)
          OR (COALESCE(credit_amount, quoted_credit_total, 0)::numeric > 0 AND credit_issued_at IS NULL)
        )
      ORDER BY updated_at ASC`,
    [userId],
  );

  const quotes = await query(
    `SELECT reference, status,
            COALESCE(cash_amount, 0)::numeric   AS cash_total,
            COALESCE(credit_amount, 0)::numeric AS credit_total,
            cash_paid_at, credit_issued_at, updated_at
       FROM quote_requests
      WHERE user_id = $1
        AND status IN ('accepted', 'received', 'paid')
        AND (
          (status IN ('accepted', 'received'))
          OR (COALESCE(cash_amount, 0)::numeric > 0 AND cash_paid_at IS NULL)
          OR (COALESCE(credit_amount, 0)::numeric > 0 AND credit_issued_at IS NULL)
        )
      ORDER BY updated_at ASC`,
    [userId],
  );

  const nowMs = Date.now();
  const isPast = (d: string | null): boolean =>
    !!d && new Date(d).getTime() <= nowMs;

  const tradeRows: PendingTradeOrAuctionRow[] = trades.rows.map((r) => {
    const availableAt: string | null = r.available_at
      ? new Date(r.available_at).toISOString() : null;
    return {
      id: r.id,
      label: r.card_name,
      amount: r.seller_payout,
      amountFormatted: formatPrice(parseFloat(r.seller_payout)),
      when: r.completed_at ?? r.created_at,
      availableAt,
      isReady: isPast(availableAt),
      holdDays: r.payout_hold_days ?? 0,
    };
  });
  const auctionRows: PendingTradeOrAuctionRow[] = auctions.rows.map((r) => {
    const availableAt: string | null = r.available_at
      ? new Date(r.available_at).toISOString() : null;
    return {
      id: r.id,
      label: r.title,
      amount: r.seller_payout,
      amountFormatted: formatPrice(parseFloat(r.seller_payout)),
      when: r.paid_at,
      availableAt,
      isReady: isPast(availableAt),
      holdDays: AUCTION_HOLD_DAYS,
    };
  });

  const mapSubmission = (r: {
    reference: string; status: string; cash_total: string | null; credit_total: string | null;
    cash_paid_at: string | null; credit_issued_at: string | null; updated_at: string;
  }): PendingSubmissionRow => {
    const cashOwed = r.cash_paid_at ? 0 : parseFloat(r.cash_total ?? "0");
    const creditOwed = r.credit_issued_at ? 0 : parseFloat(r.credit_total ?? "0");
    const amount = cashOwed + creditOwed;
    return {
      reference: r.reference, status: r.status,
      cashOwed, creditOwed, amount,
      amountFormatted: formatPrice(amount), when: r.updated_at,
    };
  };
  const tradeinRows = tradeins.rows.map(mapSubmission);
  const quoteRows = quotes.rows.map(mapSubmission);

  const totalOwed =
    tradeRows.reduce((s, r) => s + parseFloat(r.amount), 0) +
    auctionRows.reduce((s, r) => s + parseFloat(r.amount), 0) +
    tradeinRows.reduce((s, r) => s + r.amount, 0) +
    quoteRows.reduce((s, r) => s + r.amount, 0);

  // Ready vs holding split. Trade-ins/quotes don't have hold periods —
  // admin marks them paid when the cash actually goes out, so anything
  // pending in those buckets is effectively "ready" from the seller's
  // point of view (waiting on us, not on a timer).
  const readyTotal =
    tradeRows.filter((r) => r.isReady).reduce((s, r) => s + parseFloat(r.amount), 0) +
    auctionRows.filter((r) => r.isReady).reduce((s, r) => s + parseFloat(r.amount), 0) +
    tradeinRows.reduce((s, r) => s + r.amount, 0) +
    quoteRows.reduce((s, r) => s + r.amount, 0);
  const holdingTotal = totalOwed - readyTotal;

  // Earliest availableAt across rows still in their hold window.
  const holdingDates: number[] = [
    ...tradeRows, ...auctionRows,
  ]
    .filter((r) => !r.isReady && r.availableAt)
    .map((r) => new Date(r.availableAt!).getTime());
  const nextAvailableAt = holdingDates.length > 0
    ? new Date(Math.min(...holdingDates)).toISOString()
    : null;

  return {
    trades: tradeRows,
    auctions: auctionRows,
    tradeins: tradeinRows,
    quotes: quoteRows,
    totalOwed,
    totalOwedFormatted: formatPrice(totalOwed),
    readyTotal,
    readyTotalFormatted: formatPrice(readyTotal),
    holdingTotal,
    holdingTotalFormatted: formatPrice(holdingTotal),
    nextAvailableAt,
  };
}

export interface HistoryRow {
  source: "trade" | "auction" | "tradein_cash" | "tradein_credit" | "quote_cash" | "quote_credit";
  id: string;
  label: string;
  amount: number;
  amountFormatted: string;
  paidAt: string;
  method: "stripe" | "bank" | "store_credit" | "other";
  reference: string | null;
}

export interface HistoryBundle {
  rows: HistoryRow[];
  truncated: boolean;
  totalRows: number;
  totals: {
    ytd: number; ytdFormatted: string;
    allTime: number; allTimeFormatted: string;
  };
}

function pickMethod(r: { payout_method?: string | null; stripe_transfer_id?: string | null }): HistoryRow["method"] {
  if (r.stripe_transfer_id) return "stripe";
  if (!r.payout_method) return "other";
  if (r.payout_method === "stripe_connect") return "stripe";
  if (r.payout_method === "bank_transfer") return "bank";
  if (r.payout_method === "store_credit") return "store_credit";
  return "other";
}

export async function getPayoutHistory(userId: string, limit = 100): Promise<HistoryBundle> {
  limit = Math.min(limit, 500);

  const trades = await query(
    `SELECT t.id::text AS id, t.seller_paid_at AS paid_at,
            t.seller_payout::numeric AS amount,
            t.payout_method, t.payout_reference, t.stripe_transfer_id,
            COALESCE(o.card_name, t.sku) AS label
       FROM market_trades t
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE t.seller_id = $1 AND t.seller_paid_at IS NOT NULL
      ORDER BY t.seller_paid_at DESC LIMIT $2`,
    [userId, limit],
  );

  const auctions = await query(
    `SELECT id::text AS id, seller_paid_at AS paid_at,
            seller_payout::numeric AS amount,
            payout_method, payout_reference, stripe_transfer_id,
            title AS label
       FROM auctions
      WHERE seller_user_id = $1 AND seller_paid_at IS NOT NULL
      ORDER BY seller_paid_at DESC LIMIT $2`,
    [userId, limit],
  );

  const tradeinCash = await query(
    `SELECT reference AS id, cash_paid_at AS paid_at,
            COALESCE(cash_amount, quoted_cash_total, 0)::numeric AS amount,
            stripe_transfer_id, reference AS label
       FROM tradein_submissions
      WHERE user_id = $1 AND cash_paid_at IS NOT NULL
        AND COALESCE(cash_amount, quoted_cash_total, 0)::numeric > 0
      ORDER BY cash_paid_at DESC LIMIT $2`,
    [userId, limit],
  );

  const tradeinCredit = await query(
    `SELECT reference AS id, credit_issued_at AS paid_at,
            COALESCE(credit_amount, quoted_credit_total, 0)::numeric AS amount,
            reference AS label
       FROM tradein_submissions
      WHERE user_id = $1 AND credit_issued_at IS NOT NULL
        AND COALESCE(credit_amount, quoted_credit_total, 0)::numeric > 0
      ORDER BY credit_issued_at DESC LIMIT $2`,
    [userId, limit],
  );

  const quoteCash = await query(
    `SELECT reference AS id, cash_paid_at AS paid_at,
            COALESCE(cash_amount, 0)::numeric AS amount,
            stripe_transfer_id, reference AS label
       FROM quote_requests
      WHERE user_id = $1 AND cash_paid_at IS NOT NULL
        AND COALESCE(cash_amount, 0)::numeric > 0
      ORDER BY cash_paid_at DESC LIMIT $2`,
    [userId, limit],
  );

  const quoteCredit = await query(
    `SELECT reference AS id, credit_issued_at AS paid_at,
            COALESCE(credit_amount, 0)::numeric AS amount,
            reference AS label
       FROM quote_requests
      WHERE user_id = $1 AND credit_issued_at IS NOT NULL
        AND COALESCE(credit_amount, 0)::numeric > 0
      ORDER BY credit_issued_at DESC LIMIT $2`,
    [userId, limit],
  );

  const rows: HistoryRow[] = [
    ...trades.rows.map((r): HistoryRow => ({
      source: "trade", id: r.id, label: r.label,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at, method: pickMethod(r),
      reference: r.stripe_transfer_id || r.payout_reference || null,
    })),
    ...auctions.rows.map((r): HistoryRow => ({
      source: "auction", id: r.id, label: r.label,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at, method: pickMethod(r),
      reference: r.stripe_transfer_id || r.payout_reference || null,
    })),
    ...tradeinCash.rows.map((r): HistoryRow => ({
      source: "tradein_cash", id: r.id, label: `Trade-in ${r.label}`,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at,
      method: r.stripe_transfer_id ? "stripe" : "bank",
      reference: r.stripe_transfer_id || null,
    })),
    ...tradeinCredit.rows.map((r): HistoryRow => ({
      source: "tradein_credit", id: r.id, label: `Trade-in ${r.label}`,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at, method: "store_credit", reference: null,
    })),
    ...quoteCash.rows.map((r): HistoryRow => ({
      source: "quote_cash", id: r.id, label: `Quote ${r.label}`,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at,
      method: r.stripe_transfer_id ? "stripe" : "bank",
      reference: r.stripe_transfer_id || null,
    })),
    ...quoteCredit.rows.map((r): HistoryRow => ({
      source: "quote_credit", id: r.id, label: `Quote ${r.label}`,
      amount: parseFloat(r.amount), amountFormatted: formatPrice(parseFloat(r.amount)),
      paidAt: r.paid_at, method: "store_credit", reference: null,
    })),
  ];

  rows.sort((a, b) => {
    const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
    const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
    return tb - ta;
  });

  const capped = rows.slice(0, limit);

  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)).getTime();
  const ytd = rows
    .filter((r) => r.paidAt && new Date(r.paidAt).getTime() >= yearStart)
    .reduce((s, r) => s + r.amount, 0);
  const allTime = rows.reduce((s, r) => s + r.amount, 0);

  return {
    rows: capped,
    truncated: rows.length > limit,
    totalRows: rows.length,
    totals: {
      ytd, ytdFormatted: formatPrice(ytd),
      allTime, allTimeFormatted: formatPrice(allTime),
    },
  };
}
