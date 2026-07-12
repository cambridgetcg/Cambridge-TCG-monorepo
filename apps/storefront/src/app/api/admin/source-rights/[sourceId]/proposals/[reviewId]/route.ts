import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { deployedSourceMeta, readBoundedJson, SourceRightsInputError } from "@/lib/source-rights/workbench";
import { transitionSourceRightsReview } from "@/lib/source-rights/workbench-db";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const ACTIONS = ["submit", "reject", "mark-landed"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string; reviewId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: NO_STORE });
  }
  const { sourceId, reviewId } = await params;
  try {
    deployedSourceMeta(sourceId);
  } catch (error) {
    if (error instanceof SourceRightsInputError) {
      return NextResponse.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
    }
    throw error;
  }
  if (!UUID_RE.test(reviewId)) {
    return NextResponse.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
  }
  let body: { action?: string; landed_commit?: string; rejection_reason?: string };
  try {
    const parsed = await readBoundedJson(request, 2048);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Transition body must be an object." }, { status: 400, headers: NO_STORE });
    }
    body = parsed as { action?: string; landed_commit?: string; rejection_reason?: string };
  } catch (error) {
    const status = error instanceof SourceRightsInputError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Valid JSON required." }, { status, headers: NO_STORE });
  }
  if (!ACTIONS.includes(body.action as (typeof ACTIONS)[number])) {
    return NextResponse.json({ error: "Unknown transition action." }, { status: 400, headers: NO_STORE });
  }
  const action = body.action as (typeof ACTIONS)[number];
  const to = action === "submit" ? "proposed" : action === "reject" ? "rejected" : "landed";

  try {
    const review = await transitionSourceRightsReview({
      sourceId,
      reviewId,
      createdBy: admin.id,
      to,
      decisionNote: body.rejection_reason,
      landedCommit: body.landed_commit,
    });
    return NextResponse.json({ review }, { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review transition failed.";
    const status = /not found/i.test(message) ? 404 : /cannot move|commit SHA|successor revision|branching|expired|registry changed|rejected review/i.test(message) ? 409 : 503;
    return NextResponse.json(
      { error: status === 503 ? "The proposal ledger is unavailable. Nothing changed." : message },
      { status, headers: NO_STORE },
    );
  }
}
