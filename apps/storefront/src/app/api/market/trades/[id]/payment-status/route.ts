import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Narrow participant projection used by the Checkout return surface. It does
 * not carry shipping, provider, payout, counterparty, or operator fields.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in required." },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "Trade not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const result = await query(
    `SELECT escrow_status::text AS escrow_status, payment_expires_at
       FROM market_trades
      WHERE id = $1
        AND (buyer_id = $2 OR seller_id = $2)`,
    [id, session.user.id],
  );
  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: "Trade not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const trade = result.rows[0];
  return NextResponse.json(
    {
      trade: {
        escrow_status: trade.escrow_status,
        payment_expires_at: trade.payment_expires_at ?? null,
      },
    },
    { headers: PRIVATE_NO_STORE },
  );
}
