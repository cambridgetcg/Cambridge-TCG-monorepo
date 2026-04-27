import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { getValuationCertificate } from "@/lib/portfolio/valuation";

// GET /api/account/portfolio/value/export
//
// Valuation certificate as JSON. Suitable for insurance claims, tax
// records, and personal estate planning. The canonical_hash field
// is a SHA-256 over the lines + totals so a saved certificate can
// be re-verified later (the user's saved file should hash to the
// same value the server returns at export-time, modulo the hash
// itself which is not part of the input).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const cert = await getValuationCertificate(session.user.id);

  // Canonical hash: stringified-deterministic of the (totals, lines)
  // tuple. Used as a tamper-evident signature for the export.
  const canonical = JSON.stringify({
    user_id: cert.user_id,
    evaluated_at: cert.evaluated_at,
    total_value: cert.total_value,
    total_cost: cert.total_cost,
    unrealized_gain: cert.unrealized_gain,
    card_count: cert.card_count,
    lines: cert.lines.map((l) => ({
      sku: l.sku,
      condition: l.condition,
      quantity: l.quantity,
      unit_price: l.unit_price,
      total_value: l.total_value,
      cost_basis: l.cost_basis,
    })),
  });
  const canonical_hash = crypto.createHash("sha256").update(canonical).digest("hex");

  // Content-disposition encourages the browser to save rather than
  // render — it's not strictly necessary but matches user expectation
  // for an "Export" button.
  const filename = `cambridge-tcg-valuation-${cert.evaluated_at.slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify({ ...cert, canonical_hash }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
