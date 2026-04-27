import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  getDispute,
  resolveDispute,
  setDisputeStatus,
  getDisputeMessages,
  getDisputeEvidence,
  userCanAccessDispute,
  recordRefund,
} from "@/lib/trust/db";
import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";

// Helper — fire a notification at buyer + seller when a dispute
// transitions to a visible state (under_review, awaiting_evidence,
// resolved_*). De-dupes per (dispute, status) so a re-flip won't
// duplicate.
async function notifyDisputeParties(
  disputeId: string,
  title: string,
  body: string,
  kind: string,
  stamp: string,
) {
  const r = await query(
    `SELECT t.buyer_id, t.seller_id, d.trade_id
       FROM trade_disputes d JOIN market_trades t ON d.trade_id = t.id
      WHERE d.id = $1`,
    [disputeId],
  );
  if (r.rows.length === 0) return;
  const row = r.rows[0];
  for (const uid of new Set([row.buyer_id, row.seller_id].filter(Boolean))) {
    void notify({
      userId: uid as string,
      kind,
      title,
      body,
      linkUrl: `/account/trades/${row.trade_id}`,
      referenceType: "dispute",
      referenceId: `${disputeId}:${stamp}`,
    });
  }
}

// GET — dispute detail with messages + evidence. Admin can read any;
// a signed-in user can read disputes where they're a party to the trade.
// Previously only admin could hit this route so the raising user had
// no way to look at their own dispute.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!(await userCanAccessDispute(id, session.user.id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }

  const dispute = await getDispute(id);
  if (!dispute) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const [messages, evidence] = await Promise.all([
    getDisputeMessages(id),
    getDisputeEvidence(id),
  ]);

  return NextResponse.json({ dispute, messages, evidence });
}

// PATCH — admin: resolve OR transition status (under_review / awaiting_evidence).
//
//   { resolutionType, resolutionNotes, refundAmount? }
//     → terminal resolution (resolve + cascade trade status)
//
//   { status: 'under_review' | 'awaiting_evidence' }
//     → intermediate transition (just stamps + returns updated row)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();

  // Intermediate transition — under_review / awaiting_evidence
  if (body.status && !body.resolutionType) {
    if (!["under_review", "awaiting_evidence"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid intermediate status." }, { status: 400 });
    }
    const dispute = await setDisputeStatus(id, body.status);
    if (!dispute) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const title = body.status === "awaiting_evidence"
      ? "Dispute: evidence requested"
      : "Dispute moved to review";
    const bodyText = body.status === "awaiting_evidence"
      ? "Admin has requested additional evidence on your dispute."
      : "Your dispute is now under review by our team.";
    void notifyDisputeParties(id, title, bodyText, `dispute.${body.status}`, body.status);

    return NextResponse.json({ dispute });
  }

  // Terminal resolution
  if (!["refund_buyer", "release_seller", "split", "return_card"].includes(body.resolutionType)) {
    return NextResponse.json({ error: "Invalid resolution type." }, { status: 400 });
  }
  if (!body.resolutionNotes?.trim()) {
    return NextResponse.json({ error: "Resolution notes required." }, { status: 400 });
  }

  const dispute = await resolveDispute(id, {
    resolutionType: body.resolutionType,
    resolutionNotes: body.resolutionNotes.trim(),
    refundAmount: body.refundAmount,
  });

  if (body.resolutionType === "refund_buyer" && body.refundAmount) {
    await recordRefund(dispute.trade_id, body.refundAmount, body.resolutionNotes.trim());
  }

  void notifyDisputeParties(
    id,
    "Dispute resolved",
    body.resolutionNotes.trim().slice(0, 180),
    `dispute.resolved.${body.resolutionType}`,
    `resolved:${body.resolutionType}`,
  );

  return NextResponse.json({ dispute });
}
