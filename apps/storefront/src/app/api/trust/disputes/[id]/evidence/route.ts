import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  addDisputeEvidence,
  getDisputeEvidence,
  userCanAccessDispute,
} from "@/lib/trust/db";
import { getPresignedUploadUrl } from "@/lib/auction/s3";

// GET — list evidence attached to the dispute. Admin or party only.
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
  const evidence = await getDisputeEvidence(id);
  return NextResponse.json({ evidence });
}

// POST — two-step upload:
//
//   { contentType: "image/jpeg" }
//     → returns { uploadUrl, imageUrl, s3Key } for direct S3 PUT.
//
//   { s3Key, url, label? }
//     → after the client finishes the S3 PUT, call again to persist
//       the dispute_evidence row.
//
// Admin or party may upload. Counter-party evidence is useful too
// (seller uploading proof-of-shipment photos, etc.), so we don't
// restrict to just the raiser.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  const session = admin ? null : await auth();
  if (!admin) {
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!(await userCanAccessDispute(id, session.user.id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }

  const body = await request.json();

  // Phase 1: mint a presigned URL the client uploads directly to S3.
  if (body.contentType) {
    if (typeof body.contentType !== "string" || !body.contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Only images allowed." }, { status: 400 });
    }
    // Scope the S3 prefix by dispute id so evidence is naturally grouped.
    const result = await getPresignedUploadUrl(`disputes/${id}`, body.contentType);
    return NextResponse.json(result);
  }

  // Phase 2: persist the row now that the file has landed in S3.
  if (body.s3Key && body.url) {
    if (typeof body.s3Key !== "string" || typeof body.url !== "string") {
      return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
    }
    const label = typeof body.label === "string" ? body.label.slice(0, 100) : undefined;
    // Admin evidence uses the dispute_messages-style null sender? No —
    // dispute_evidence.uploaded_by is still NOT NULL (migration 0015)
    // and we haven't loosened it. If admin uploads, attribute to the
    // raiser's counterpart so there's a real user id. Realistically
    // admin uploads are rare; we can relax later if needed.
    const uploaderId = session?.user?.id ?? null;
    if (!uploaderId) {
      // Admin upload — pick the raiser so the FK is satisfied. The
      // dispute row's raised_by is always a real user. We annotate the
      // label so readers can tell it came from admin.
      const { query } = await import("@/lib/db");
      const r = await query(`SELECT raised_by FROM trade_disputes WHERE id=$1`, [id]);
      const fallback = r.rows[0]?.raised_by as string | undefined;
      if (!fallback) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });
      const adminLabel = label ? `[admin] ${label}` : "[admin] Evidence";
      const ev = await addDisputeEvidence(id, fallback, body.url, body.s3Key, adminLabel);
      return NextResponse.json({ evidence: ev });
    }

    const ev = await addDisputeEvidence(id, uploaderId, body.url, body.s3Key, label);
    return NextResponse.json({ evidence: ev });
  }

  return NextResponse.json({ error: "Missing contentType or s3Key+url." }, { status: 400 });
}
