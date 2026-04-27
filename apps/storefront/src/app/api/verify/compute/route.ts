import { NextResponse } from "next/server";
import { sha256, rollFloat, pickWeighted } from "@/lib/bounty/rng";

// Standalone verification endpoint. Accepts the raw commit-reveal
// inputs and returns whether they check out — NOT tied to any specific
// pull_id, so third-party tools can verify without our database.
//
// Use cases:
//   - third-party auditors running their own end-to-end checks
//   - curl / scripting ad-hoc verification outside the browser
//   - the "certificate of authenticity" flow (Phase E) calls this to
//     prove the embedded seed/hash/nonce reproduce the claimed rarity
//
// Pure compute — no DB reads, no auth, no state. CORS-friendly so a
// verifier can live on a different origin.

interface RequestBody {
  commitment?: unknown;
  server_seed?: unknown;
  client_seed?: unknown;
  nonce?: unknown;
  rarity_weights?: unknown;
  claimed_rarity?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v)) return Number(v);
  return null;
}
function asWeights(v: unknown): Record<string, number> | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) return null;
    out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const commitment = asString(body.commitment);
  const serverSeed = asString(body.server_seed);
  const clientSeed = asString(body.client_seed);
  const nonce = asNumber(body.nonce);
  const weights = asWeights(body.rarity_weights);
  const claimedRarity = asString(body.claimed_rarity);

  if (!commitment || !serverSeed || !clientSeed || nonce === null || !weights || !claimedRarity) {
    return NextResponse.json(
      {
        error: "Missing or invalid fields.",
        required: ["commitment", "server_seed", "client_seed", "nonce", "rarity_weights", "claimed_rarity"],
      },
      { status: 400 },
    );
  }

  const recomputedHash = sha256(serverSeed);
  const commitmentMatches = recomputedHash.toLowerCase() === commitment.toLowerCase();

  const recomputedRoll = rollFloat(serverSeed, clientSeed, nonce);
  const recomputedRarity = pickWeighted(weights, recomputedRoll);
  const rarityMatches = recomputedRarity.toLowerCase() === claimedRarity.toLowerCase();

  const ok = commitmentMatches && rarityMatches;

  return NextResponse.json(
    {
      ok,
      checks: {
        commitment_matches: commitmentMatches,
        rarity_matches: rarityMatches,
      },
      recomputed: {
        hash: recomputedHash,
        roll: recomputedRoll,
        rarity: recomputedRarity,
      },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}

// Preflight for browser-based cross-origin verifiers.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
