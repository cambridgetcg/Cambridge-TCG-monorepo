import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — CSV export of payouts in a date window, for finance reconciliation.
// Defaults to the last 90 days if no range is supplied.
// Output columns are stable; new fields go at the end.
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date(Date.now() - 90 * 86400_000).toISOString();
  const to = url.searchParams.get("to") || new Date().toISOString();

  const r = await query(
    `SELECT * FROM (
       SELECT 'trade' AS kind, t.id::text, t.seller_paid_at,
              t.payout_method, t.payout_reference, t.stripe_transfer_id,
              t.seller_payout::numeric AS amount,
              t.commission_amount::numeric AS commission,
              COALESCE(o.card_name, t.sku) AS label,
              su.email AS seller_email,
              t.sku
         FROM market_trades t
         JOIN users su ON su.id = t.seller_id
         LEFT JOIN market_orders o ON o.id = t.bid_order_id
        WHERE t.seller_paid_at IS NOT NULL
          AND t.seller_paid_at >= $1 AND t.seller_paid_at <= $2
       UNION ALL
       SELECT 'auction' AS kind, a.id::text, a.seller_paid_at,
              a.payout_method, a.payout_reference, a.stripe_transfer_id,
              a.seller_payout::numeric,
              (a.current_price::numeric - a.seller_payout::numeric) AS commission,
              a.title AS label,
              su.email AS seller_email,
              NULL AS sku
         FROM auctions a
         JOIN users su ON su.id = a.seller_user_id
        WHERE a.seller_paid_at IS NOT NULL
          AND a.seller_paid_at >= $1 AND a.seller_paid_at <= $2
          AND a.seller_user_id IS NOT NULL
     ) x
     ORDER BY seller_paid_at DESC`,
    [from, to]
  );

  const header = [
    "kind", "id", "paid_at", "seller_email", "label", "sku",
    "amount_gbp", "commission_gbp", "payout_method",
    "payout_reference", "stripe_transfer_id",
  ];
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes("\"") || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines = [
    header.join(","),
    ...r.rows.map((row) => [
      row.kind,
      row.id,
      row.seller_paid_at,
      row.seller_email,
      row.label,
      row.sku ?? "",
      Number(row.amount).toFixed(2),
      row.commission ? Number(row.commission).toFixed(2) : "",
      row.payout_method ?? "",
      row.payout_reference ?? "",
      row.stripe_transfer_id ?? "",
    ].map(escape).join(",")),
  ];
  const csv = lines.join("\n") + "\n";

  const filename = `payouts-${from.slice(0, 10)}_to_${to.slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
