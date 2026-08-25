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
  deleteVerificationObject,
  getStoredVerificationObjectUrl,
  getVerificationReadUrl,
  inspectVerificationObject,
  isOwnedVerificationKey,
  isSupportedVerificationContentType,
  markVerificationObjectLinked,
  MAX_VERIFICATION_DOCUMENT_BYTES,
  prepareVerificationUpload,
} from "@/lib/trust/verification-storage";
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
    !isOwnedVerificationKey(document.s3_key, ownerUserId)
  ) {
    return {
      ...presentation,
      url: null,
      access_status: "support_required" as const,
    };
  }

  try {
    // Presigning alone does not prove that the object exists in the private
    // bucket. HEAD first so legacy rows from the former shared bucket do not
    // get presented as available private documents.
    await inspectVerificationObject(document.s3_key);
    return {
      ...presentation,
      url: await getVerificationReadUrl(document.s3_key),
      access_status: "available" as const,
    };
  } catch {
    return {
      ...presentation,
      url: null,
      access_status: "support_required" as const,
    };
  }
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
//     → { uploadUrl, s3Key, requiredHeaders } for direct private S3 PUT
//
//   { s3Key, docType }
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
    if (!isSupportedVerificationContentType(body.contentType)) {
      return privateJson({ error: "Only JPEG, PNG, WebP or PDF allowed." }, 400);
    }
    try {
      return privateJson(await prepareVerificationUpload(userId, body.contentType));
    } catch {
      return privateJson(
        { error: "Private document storage is temporarily unavailable." },
        503,
      );
    }
  }

  // Phase 2 — persist the row
  if (typeof body.s3Key === "string") {
    const docType = typeof body.docType === "string" ? body.docType : "other";
    const allowed = ["id_front", "id_back", "passport", "proof_of_address", "other"];
    if (!allowed.includes(docType)) {
      return privateJson({ error: "Invalid document type." }, 400);
    }
    if (!isOwnedVerificationKey(body.s3Key, userId)) {
      return privateJson({ error: "Invalid upload key." }, 400);
    }

    let storedObject: Awaited<ReturnType<typeof inspectVerificationObject>>;
    try {
      storedObject = await inspectVerificationObject(body.s3Key);
    } catch {
      return privateJson({ error: "Uploaded document is not available." }, 503);
    }
    if (
      storedObject.contentLength <= 0 ||
      storedObject.contentLength > MAX_VERIFICATION_DOCUMENT_BYTES
    ) {
      return privateJson({ error: "Document must be between 1 byte and 10 MB." }, 400);
    }
    if (
      !storedObject.contentType ||
      !isSupportedVerificationContentType(storedObject.contentType)
    ) {
      return privateJson({ error: "Stored document type is not allowed." }, 400);
    }

    let doc: Awaited<ReturnType<typeof addVerificationDocument>>;
    try {
      doc = await addVerificationDocument(userId, {
        docType,
        // Stable locator only. Every read still requires a fresh signed URL
        // after an owner/admin authorization check.
        url: getStoredVerificationObjectUrl(body.s3Key),
        s3Key: body.s3Key,
        mimeType: storedObject.contentType,
      });
    } catch {
      // The object stays pending and the bucket lifecycle removes it after
      // the abandoned-upload grace period.
      return privateJson({ error: "Document record could not be saved." }, 503);
    }

    try {
      await markVerificationObjectLinked(body.s3Key);
    } catch {
      // Keep the idempotent row so the same phase-2 request can safely retry.
      // A DB-driven repair sweep may also retag referenced pending rows; no
      // object enumeration or participant key logging is required.
      console.error("Verification document link tag update failed");
      return privateJson({ error: "Document finalization is temporarily unavailable." }, 503);
    }
    return privateJson({ document: await presentDocument(doc, userId) });
  }

  return privateJson({ error: "Missing contentType or s3Key." }, 400);
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
  if (!isOwnedVerificationKey(document.s3_key, session.user.id)) {
    return privateJson({ error: "This legacy document needs support-assisted removal." }, 409);
  }

  try {
    await deleteVerificationObject(document.s3_key);
  } catch (error) {
    console.error("Verification document object deletion failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
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
