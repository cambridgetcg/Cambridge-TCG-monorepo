import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { swapGuidance } from "@/lib/swaps/guidance";

// POST — indicative price guidance for a two-sided item set.
// Body: { proposer: [{sku, quantity}], recipient: [{sku, quantity}] }
//
// Every figure in the response is guidance, never enforcement: per-sku
// values name their source (recent_trades | ctcg_spot_snapshot) and
// as-of timestamp so the composer UI can label provenance honestly.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    proposer?: Array<{ sku?: string; quantity?: number }>;
    recipient?: Array<{ sku?: string; quantity?: number }>;
  };
  const clean = (side: typeof body.proposer) =>
    (Array.isArray(side) ? side : [])
      .filter((i) => typeof i.sku === "string" && i.sku)
      .slice(0, 80)
      .map((i) => ({
        sku: i.sku as string,
        quantity: Number.isInteger(i.quantity) && (i.quantity as number) > 0 ? (i.quantity as number) : 1,
      }));

  const guidance = await swapGuidance(clean(body.proposer), clean(body.recipient));
  return NextResponse.json({ guidance });
}
