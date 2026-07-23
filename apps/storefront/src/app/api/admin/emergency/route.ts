// /api/admin/emergency — the break-glass endpoint.
//
// Admin-only. POST freezes or lifts an account in a platform-integrity
// emergency; GET returns the recent emergency actions so the console can
// show the (loud, honest) audit trail. See @/lib/admin/emergency-intervention
// for the (deliberately narrow) bar for using this at all.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getGovernanceLog } from "@/lib/admin/governance-log";
import {
  emergencyFreezeAccount,
  liftEmergencyFreeze,
} from "@/lib/admin/emergency-intervention";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await getGovernanceLog({ limit: 200 });
  const emergencies = entries.filter((e) => e.action.startsWith("emergency."));
  return NextResponse.json({ entries: emergencies });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    action?: string;
    userId?: string;
    reason?: string;
    acknowledge?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { action, userId, reason, acknowledge } = body;

  if (action !== "freeze" && action !== "lift") {
    return NextResponse.json(
      { error: "action must be 'freeze' or 'lift'." },
      { status: 400 },
    );
  }
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "A target account id is required." }, { status: 400 });
  }
  if (typeof reason !== "string") {
    return NextResponse.json({ error: "A written justification is required." }, { status: 400 });
  }
  // Explicit acknowledgement is required for a freeze — you cannot reach for
  // the break-glass without confirming this is a genuine emergency.
  if (action === "freeze" && acknowledge !== true) {
    return NextResponse.json(
      { error: "You must confirm this is a platform-integrity emergency, not routine moderation." },
      { status: 400 },
    );
  }

  const actor = { id: admin.id, email: admin.email };
  const result =
    action === "freeze"
      ? await emergencyFreezeAccount(actor, userId, reason)
      : await liftEmergencyFreeze(actor, userId, reason);

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
