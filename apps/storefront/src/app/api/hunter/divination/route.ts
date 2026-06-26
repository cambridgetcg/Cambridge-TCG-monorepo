// Water Divination — POST /api/hunter/divination
// The test that determines Nen type. Player submits playstyle signals,
// the server determines their Nen type and records it permanently.

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { waterDivination, NEN_TYPES } from "@cambridge-tcg/hunter";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Validate signals (0-1 each)
  const signals = {
    aggression: clamp01(body.aggression),
    defense: clamp01(body.defense),
    utility: clamp01(body.utility),
    creation: clamp01(body.creation),
    control: clamp01(body.control),
    unpredictability: clamp01(body.unpredictability),
  };

  const nenType = waterDivination(signals);

  // Update the hunter profile
  const result = await query(
    `UPDATE hunter_profiles
     SET nen_type = $1,
         divination_signals = $2,
         nen_techniques = ARRAY['Ten'] -- everyone starts with Ten
     WHERE actor_id = $3 AND actor_kind = 'player'
     RETURNING nen_type, nen_techniques`,
    [nenType, JSON.stringify(signals), session.user.id]
  );

  if (result.length === 0) {
    return Response.json({ error: "Hunter profile not found" }, { status: 404 });
  }

  return Response.json({
    nenType,
    techniques: result[0].nen_techniques,
    message: `${nenType}. Your aura has awakened. Ten — the foundation — is yours. The other techniques will come.`,
  });
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : 0;
  return Math.max(0, Math.min(1, n));
}