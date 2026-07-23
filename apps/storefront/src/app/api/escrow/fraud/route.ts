import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { listFraudSignals } from "@/lib/escrow/trust-engine";
import { query } from "@/lib/db";

// GET — admin: list fraud signals
export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const resolved = url.searchParams.get("resolved");
  const signals = await listFraudSignals(resolved === "true" ? true : resolved === "false" ? false : undefined);
  return NextResponse.json({ signals });
}

// PATCH — admin: resolve fraud signal
export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.signalId) return NextResponse.json({ error: "Signal ID required." }, { status: 400 });

  await query(
    `UPDATE fraud_signals SET resolved=true, resolved_notes=$2 WHERE id=$1`,
    [body.signalId, body.notes || null]
  );

  return NextResponse.json({ resolved: true });
}
