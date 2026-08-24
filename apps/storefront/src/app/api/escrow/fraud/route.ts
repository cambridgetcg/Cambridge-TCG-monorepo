import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  MIN_FRAUD_REVIEW_REASON_LENGTH,
  reviewFraudSignal,
  type FraudReviewAction,
} from "@/lib/admin/fraud-review";
import { listFraudSignals } from "@/lib/escrow/trust-engine";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// GET — admin: list fraud signals
export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const url = new URL(request.url);
  const resolved = url.searchParams.get("resolved");
  const signals = await listFraudSignals(
    resolved === "true" ? true : resolved === "false" ? false : undefined,
  );
  return NextResponse.json({ signals }, { headers: PRIVATE_NO_STORE });
}

// PATCH — authenticated human review: resolve or dismiss one signal.
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    signalId?: string;
    action?: FraudReviewAction;
    notes?: string;
    reason?: string;
  };
  if (!body.signalId) {
    return NextResponse.json(
      { error: "Signal ID required." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  const action = body.action ?? "resolve";
  if (action !== "resolve" && action !== "dismiss") {
    return NextResponse.json(
      { error: "action must be 'resolve' or 'dismiss'." },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }
  const reason = (body.reason ?? body.notes ?? "").trim();
  if (reason.length < MIN_FRAUD_REVIEW_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `Human review notes of at least ${MIN_FRAUD_REVIEW_REASON_LENGTH} characters are required.`,
      },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const result = await reviewFraudSignal({
    admin,
    signalId: body.signalId,
    action,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        committed: result.committed,
        audited: result.audited,
        signal: result.signal,
        failed_user_ids: result.failedUserIds,
      },
      { status: result.status, headers: PRIVATE_NO_STORE },
    );
  }

  return NextResponse.json(
    {
      resolved: result.signal.resolved,
      signal: result.signal,
      audited: true,
      trust_recomputed: true,
    },
    { headers: PRIVATE_NO_STORE },
  );
}
