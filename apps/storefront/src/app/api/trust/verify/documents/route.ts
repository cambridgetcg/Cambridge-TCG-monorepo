import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  addVerificationDocument,
  listVerificationDocuments,
  getOwnedVerificationDocument,
  deleteVerificationDocument,
} from "@/lib/trust/db";
import {
  deleteS3Object,
  getPresignedReadUrl,
  getPresignedUploadUrl,
  getStoredObjectUrl,
  isOwnedUploadKey,
} from "@/lib/auction/s3";
import {
  IDENTITY_VERIFICATION_PAUSE_REASON,
  isIdentityVerificationCollectionAvailable,
} from "@/lib/trust/verification-config";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  Vary: "Cookie",
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

async function presentDocument(
  document: Awaited<ReturnType<typeof listVerificationDocuments>>[number],
  ownerUserId: string,
) {
  const presentation = {
    id: document.id,
    doc_type: document.doc_type,
    mime_type: document.mime_type,
    uploaded_at: document.uploaded_at,
  };

  // Historical rows predate the participant-scoped key check on POST. Never
  // turn an arbitrary legacy/corrupt key in the shared bucket into a fresh GET
  // capability. Keep the row visible so its owner/admin can identify it for a
  // support-assisted inventory and removal without exposing storage details.
  if (
    document.user_id !== ownerUserId ||
    !isOwnedUploadKey(document.s3_key, "verifications", ownerUserId)
  ) {
    return {
      ...presentation,
      url: null,
      access_status: "support_required" as const,
    };
  }

  return {
    ...presentation,
    url: await getPresignedReadUrl(document.s3_key),
    access_status: "available" as const,
  };
}

async function presentDocuments(userId: string) {
  const documents = await listVerificationDocuments(userId);
  return Promise.all(documents.map((document) => presentDocument(document, userId)));
}

// GET — list the current user's documents (or a specific user's docs
// when admin passes ?user_id=). Admins can view any user's docs to
// review an identity submission; regular users can only see their own.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("user_id");

  if (targetUserId) {
    if (!(await isAdmin())) {
      return privateJson({ error: "Unauthorized" }, 401);
    }
    const documents = await presentDocuments(targetUserId);
    return privateJson({ documents });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }
  const documents = await presentDocuments(session.user.id);
  return privateJson({ documents });
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
    return privateJson({ error: "Sign in required." }, 401);
  }
  const userId = session.user.id;
  if (!isIdentityVerificationCollectionAvailable()) {
    return privateJson({ error: IDENTITY_VERIFICATION_PAUSE_REASON }, 503);
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Phase 1 — presigned URL
  if (typeof body.contentType === "string") {
    if (!body.contentType.startsWith("image/") && body.contentType !== "application/pdf") {
      return privateJson({ error: "Only images or PDF allowed." }, 400);
    }
    // Scope by user id so the bucket stays naturally partitioned.
    const result = await getPresignedUploadUrl(`verifications/${userId}`, body.contentType);
    return privateJson(result);
  }

  // Phase 2 — persist the row
  if (typeof body.s3Key === "string" && typeof body.url === "string") {
    const docType = typeof body.docType === "string" ? body.docType : "other";
    const allowed = ["id_front", "id_back", "passport", "proof_of_address", "other"];
    if (!allowed.includes(docType)) {
      return privateJson({ error: "Invalid document type." }, 400);
    }
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : null;
    if (!isOwnedUploadKey(body.s3Key, "verifications", userId)) {
      return privateJson({ error: "Invalid upload key." }, 400);
    }

    const doc = await addVerificationDocument(userId, {
      docType,
      // Do not trust a participant-supplied permanent URL. The key was
      // generated in this participant's namespace; reads use a fresh signed
      // URL after authorization.
      url: getStoredObjectUrl(body.s3Key),
      s3Key: body.s3Key,
      mimeType,
    });
    return privateJson({ document: await presentDocument(doc, userId) });
  }

  return privateJson({ error: "Missing contentType or s3Key+url." }, 400);
}

// DELETE ?id=<documentId> — user removes their own document
// (mistaken upload, wrong document, etc).
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return privateJson({ error: "Document id required." }, 400);

  const document = await getOwnedVerificationDocument(id, session.user.id);
  if (!document) {
    return privateJson({ error: "Not found or not yours." }, 404);
  }
  if (!isOwnedUploadKey(document.s3_key, "verifications", session.user.id)) {
    return privateJson({ error: "This legacy document needs support-assisted removal." }, 409);
  }

  try {
    await deleteS3Object(document.s3_key);
  } catch (error) {
    console.error("Verification document object deletion failed", error);
    return privateJson(
      { error: "Document removal is temporarily unavailable. Nothing was removed." },
      503,
    );
  }

  const ok = await deleteVerificationDocument(id, session.user.id, document.s3_key);
  if (!ok) {
    // A concurrent request already removed the row. S3 DELETE is idempotent,
    // so the participant's requested outcome has still been achieved.
    return privateJson({ ok: true, alreadyRemoved: true });
  }
  return privateJson({ ok: true });
}
