import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  getVerification,
  listPendingVerifications,
  listAllVerifications,
  approveVerification,
  rejectVerification,
} from "@/lib/trust/db";
import { notify } from "@/lib/notifications/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// GET — user's verification status, or admin list
export async function GET(request: Request) {
  const url = new URL(request.url);
  const admin = url.searchParams.get("admin") === "true";

  if (admin) {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pending = url.searchParams.get("pending") === "true";
    const verifications = pending ? await listPendingVerifications() : await listAllVerifications();
    return NextResponse.json({ verifications }, { headers: PRIVATE_HEADERS });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const verification = await getVerification(session.user.id);
  return NextResponse.json({ verification }, { headers: PRIVATE_HEADERS });
}

// POST — submit verification (customer) or approve/reject (admin)
export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  // ── Admin actions ──
  if (body.action === "approve" || body.action === "reject") {
    if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const targetUserId = body.userId as string;

    if (body.action === "approve") {
      const notes = typeof body.notes === "string" ? body.notes : undefined;
      await approveVerification(targetUserId, notes);
      void notify({
        userId: targetUserId,
        kind: "verification.approved",
        title: "Verification approved",
        body: "You're verified.",
        linkUrl: "/account/verify",
        referenceType: "verification",
        referenceId: `${targetUserId}:approved`,
      });
      return NextResponse.json({ status: "verified" });
    }

    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return NextResponse.json({ error: "Rejection reason required." }, { status: 400 });
    }
    const reason = body.reason.trim();
    await rejectVerification(targetUserId, reason);
    void notify({
      userId: targetUserId,
      kind: "verification.rejected",
      title: "Verification not accepted",
      body: `${reason} Go to your verification page to resubmit.`,
      linkUrl: "/account/verify",
      // Per-rejection reference so a second rejection after resubmit
      // creates a distinct notification.
      referenceType: "verification",
      referenceId: `${targetUserId}:rejected:${Date.now()}`,
    });
    return NextResponse.json({ status: "rejected" });
  }

  // ── Customer submission ──
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  // Fail closed until identity evidence has a dedicated private bucket,
  // signed owner/admin reads, a tested deletion path and an explicit
  // retention schedule. The historical flow reused public auction-image
  // storage, so accepting more high-risk identity data would be unsafe.
  return NextResponse.json(
    {
      error:
        "Identity-verification intake is paused while private document storage and retention are completed.",
      code: "verification_intake_paused",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
