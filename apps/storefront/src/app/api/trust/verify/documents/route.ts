import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  addVerificationDocument,
  listVerificationDocuments,
  deleteVerificationDocument,
} from "@/lib/trust/db";
import { getPresignedUploadUrl } from "@/lib/auction/s3";

// GET — list the current user's documents (or a specific user's docs
// when admin passes ?user_id=). Admins can view any user's docs to
// review an identity submission; regular users can only see their own.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("user_id");

  if (targetUserId) {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const documents = await listVerificationDocuments(targetUserId);
    return NextResponse.json({ documents });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const documents = await listVerificationDocuments(session.user.id);
  return NextResponse.json({ documents });
}

// POST — two-phase upload (same pattern as the dispute evidence route):
//
//   { contentType: "image/jpeg" }
//     → { uploadUrl, imageUrl, s3Key } for direct S3 PUT
//
//   { s3Key, url, docType, mimeType? }
//     → persists the verification_documents row once the client has
//       completed the S3 PUT
//
// Only the authenticated user may upload to their own case; admins
// don't upload documents on behalf of users (that would blur the audit
// trail — if admin needs to attach something, it goes on the
// dispute/evidence table for their specific case, not on the user's
// KYC record).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Phase 1 — presigned URL
  if (typeof body.contentType === "string") {
    if (!body.contentType.startsWith("image/") && body.contentType !== "application/pdf") {
      return NextResponse.json(
        { error: "Only images or PDF allowed." },
        { status: 400 },
      );
    }
    // Scope by user id so the bucket stays naturally partitioned.
    const result = await getPresignedUploadUrl(`verifications/${userId}`, body.contentType);
    return NextResponse.json(result);
  }

  // Phase 2 — persist the row
  if (typeof body.s3Key === "string" && typeof body.url === "string") {
    const docType = typeof body.docType === "string" ? body.docType : "other";
    const allowed = ["id_front", "id_back", "passport", "proof_of_address", "other"];
    if (!allowed.includes(docType)) {
      return NextResponse.json({ error: "Invalid document type." }, { status: 400 });
    }
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;

    const doc = await addVerificationDocument(userId, {
      docType,
      url: body.url,
      s3Key: body.s3Key,
      mimeType,
    });
    return NextResponse.json({ document: doc });
  }

  return NextResponse.json({ error: "Missing contentType or s3Key+url." }, { status: 400 });
}

// DELETE ?id=<documentId> — user removes their own document
// (mistaken upload, wrong document, etc).
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Document id required." }, { status: 400 });

  const ok = await deleteVerificationDocument(id, session.user.id);
  if (!ok) return NextResponse.json({ error: "Not found or not yours." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
