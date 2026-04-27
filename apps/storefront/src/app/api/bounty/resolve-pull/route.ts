import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolvePull } from "@/lib/bounty/resolver";
import type { PullTier } from "@/lib/bounty/db";
import { sendPullResolvedEmail } from "@/lib/email/bounty";

const VALID_TIERS: PullTier[] = ["common", "uncommon", "rare", "super_rare", "legendary"];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { tier?: string };
  const tier = body.tier as PullTier | undefined;
  if (!tier || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: "Invalid tier." }, { status: 400 });
  }

  const result = await resolvePull(session.user.id, tier, "user_resolve");

  if ("error" in result) {
    const status =
      result.error === "not_eligible" ? 403
      : result.error === "no_token" ? 409
      : result.error === "tier_disabled" || result.error === "tier_capped" ? 423
      : result.error === "no_stock" ? 503
      : 500;
    return NextResponse.json(result, { status });
  }

  // Fire the pull-resolved email asynchronously — the user's HTTP response
  // doesn't wait on SES, and an email failure must not fail the draw.
  void sendPullResolvedEmail({
    userId: session.user.id,
    tier,
    rolledRarity: result.rolled_rarity,
    cardName: result.vault_item.card_name,
    cardNumber: result.vault_item.card_number,
    rarity: result.vault_item.rarity,
    spotPriceGbp: parseFloat(result.vault_item.spot_price_gbp),
    imageUrl: result.vault_item.image_url,
    pullId: result.pull_id,
    vaultItemId: result.vault_item.id,
    expiresAt: new Date(result.vault_item.expires_at),
    rngCommitment: result.rng_commitment,
    rngServerSeed: result.rng_server_seed,
    rngClientSeed: result.rng_client_seed,
    rngNonce: result.rng_nonce,
  }).catch((err) => console.error("[bounty] pull-resolved email failed:", err));

  return NextResponse.json(result);
}
