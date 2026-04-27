import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/account/portfolio/tax-export?year=2025-26&jurisdiction=uk
//
// CSV export of realized positions for capital gains reporting.
//
// jurisdiction=uk (default): tax year is 6 April YYYY → 5 April YYYY+1.
//   year param accepts "2024-25" or "2025-26" forms.
// jurisdiction=calendar: 1 Jan → 31 Dec. year param is "2025".
//
// Cost basis comes from the share-pooled portfolio_card row at the
// time of sale (HMRC s104 / weighted average), which closePosition
// captures into cost_basis_per_unit + cost_basis_total. No same-day
// or 30-day matching is applied — investors who need that should
// consult their accountant; this export is a starting point.
//
// The CSV is intentionally one row per realized event, not aggregated
// by SKU. HMRC SA108 wants per-disposal detail.

interface RealizedRow {
  sold_at: string;
  sku: string;
  card_name: string | null;
  set_code: string | null;
  condition: string;
  quantity: number;
  cost_basis_per_unit: string;
  cost_basis_total: string;
  proceeds_gbp: string;
  fees_gbp: string;
  gain_gbp: string;
  acquired_at: string | null;
  holding_days: number | null;
  exit_kind: string;
  exit_reference_id: string | null;
}

function escapeCsv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function ukTaxYearWindow(year: string): { start: string; end: string } | null {
  // "2024-25" → 2024-04-06 .. 2025-04-05
  const m = year.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  return {
    start: `${startYear}-04-06`,
    end: `${startYear + 1}-04-06`,
  };
}

function calendarYearWindow(year: string): { start: string; end: string } | null {
  const m = year.match(/^(\d{4})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return {
    start: `${y}-01-01`,
    end: `${y + 1}-01-01`,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const year = (url.searchParams.get("year") ?? "").trim();
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "uk").trim();

  if (!year) {
    return NextResponse.json(
      { error: "year required (e.g. '2024-25' for UK tax year, '2025' for calendar)." },
      { status: 400 },
    );
  }

  const window = jurisdiction === "calendar"
    ? calendarYearWindow(year)
    : ukTaxYearWindow(year);
  if (!window) {
    return NextResponse.json(
      { error: `year format invalid for jurisdiction=${jurisdiction}.` },
      { status: 400 },
    );
  }

  const r = await query(
    `SELECT sold_at, sku, card_name, set_code, condition, quantity,
            cost_basis_per_unit, cost_basis_total,
            proceeds_gbp, fees_gbp, gain_gbp,
            acquired_at, holding_days, exit_kind, exit_reference_id
       FROM realized_positions
      WHERE user_id = $1
        AND sold_at >= $2
        AND sold_at < $3
      ORDER BY sold_at ASC`,
    [session.user.id, window.start, window.end],
  );

  const header = [
    "Sold At", "SKU", "Card Name", "Set", "Condition",
    "Quantity", "Cost/Unit (GBP)", "Cost Basis Total (GBP)",
    "Proceeds (GBP)", "Fees (GBP)", "Gain/Loss (GBP)",
    "Acquired At", "Holding Days", "Exit Kind", "Exit Reference",
  ];

  const rows = (r.rows as RealizedRow[]).map((row) => [
    row.sold_at, row.sku, row.card_name ?? "", row.set_code ?? "", row.condition,
    row.quantity, row.cost_basis_per_unit, row.cost_basis_total,
    row.proceeds_gbp, row.fees_gbp, row.gain_gbp,
    row.acquired_at ?? "", row.holding_days ?? "", row.exit_kind, row.exit_reference_id ?? "",
  ]);

  // Append a totals row — handy for the user reviewing the file. Marked
  // with leading 'TOTAL' in the SKU column so accountants can spot it.
  const totalProceeds = rows.reduce((s, row) => s + parseFloat(String(row[8])), 0);
  const totalCost = rows.reduce((s, row) => s + parseFloat(String(row[7])), 0);
  const totalFees = rows.reduce((s, row) => s + parseFloat(String(row[9])), 0);
  const totalGain = rows.reduce((s, row) => s + parseFloat(String(row[10])), 0);
  rows.push([
    "", "TOTAL", `${rows.length} disposals`, "", "",
    "", "", totalCost.toFixed(2),
    totalProceeds.toFixed(2), totalFees.toFixed(2), totalGain.toFixed(2),
    "", "", "", "",
  ]);

  const csv = [
    header.map(escapeCsv).join(","),
    ...rows.map((cols) => cols.map(escapeCsv).join(",")),
  ].join("\n");

  const filename = `cambridge-tcg-realized-${jurisdiction}-${year}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
