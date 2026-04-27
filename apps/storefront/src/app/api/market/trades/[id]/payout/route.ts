import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { recordTradePayout } from "@/lib/market/db";

const VALID_METHODS = new Set([
  "bank_transfer", "paypal", "crypto", "stripe_connect", "store_credit", "other",
]);

// POST — admin records that a payout was sent off-platform.
// Does not move money; it only stamps seller_paid_at + payout method/reference.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const method = body.method as string | undefined;
  const reference = (body.reference as string | undefined)?.trim() || undefined;

  if (!method || !VALID_METHODS.has(method)) {
    return NextResponse.json(
      { error: `method must be one of: ${[...VALID_METHODS].join(", ")}` },
      { status: 400 }
    );
  }

  const result = await recordTradePayout({ tradeId: id, method, reference });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
