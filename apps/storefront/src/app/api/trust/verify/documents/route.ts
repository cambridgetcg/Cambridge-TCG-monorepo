import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  listVerificationDocuments,
  deleteVerificationDocument,
} from "@/lib/trust/db";
import { deleteS3Object } from "@/lib/auction/s3";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function safeDocumentProjection(document: Record<string, unknown>) {
  return {
    id: document.id,
    doc_type: document.doc_type,
    mime_type: document.mime_type,
    uploaded_at: document.uploaded_at,
    access: "withheld_pending_private_storage",
  };
}

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
    return NextResponse.json(
      { documents: documents.map((document) => safeDocumentProjection(document as unknown as Record<string, unknown>)) },
      { headers: PRIVATE_HEADERS },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const documents = await listVerificationDocuments(session.user.id);
  return NextResponse.json(
    { documents: documents.map((document) => safeDocumentProjection(document as unknown as Record<string, unknown>)) },
    { headers: PRIVATE_HEADERS },
  );
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
  void request;
  return NextResponse.json(
    {
      error:
        "Identity-document intake is paused until dedicated private storage and retention are verified.",
      code: "verification_document_intake_paused",
    },
    { status: 503, headers: PRIVATE_HEADERS },
  );
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

  const documents = await listVerificationDocuments(session.user.id);
  const document = documents.find((candidate) => candidate.id === id);
  if (!document) {
    return NextResponse.json({ error: "Not found or not yours." }, { status: 404 });
  }

  // Remove the object before its database pointer. If storage deletion fails,
  // the row remains so the owner can retry instead of creating an orphan.
  await deleteS3Object(document.s3_key);
  const ok = await deleteVerificationDocument(id, session.user.id);
  if (!ok) return NextResponse.json({ error: "Not found or not yours." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
