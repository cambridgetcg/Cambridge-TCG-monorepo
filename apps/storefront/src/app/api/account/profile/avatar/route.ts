import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateProfile } from "@/lib/social/db";
import {
  deleteS3Object,
  getOwnedUploadKeyFromUrl,
  getPresignedUploadUrl,
  getStoredObjectUrl,
  isOwnedUploadKey,
} from "@/lib/auction/s3";
import { query } from "@/lib/db";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  Vary: "Cookie",
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

// Two-phase avatar upload, matching the dispute-evidence and
// verification-document pattern elsewhere in the codebase:
//
//   POST { contentType: "image/jpeg" }
//     → { uploadUrl, imageUrl, s3Key } — client PUTs the file directly
//       to S3 without streaming through our Lambda
//
//   POST { s3Key, url }
//     → persists users.avatar_url to the final imageUrl. No separate
//       table; the avatar is a single URL stored on the user row.
//
// Only the authenticated user can change their own avatar; there is
// deliberately no admin override here (an admin editing another user's
// avatar would be a trust-ladder violation).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Phase 1 — presigned URL
  if (typeof body.contentType === "string") {
    if (!body.contentType.startsWith("image/")) {
      return privateJson({ error: "Only images allowed for avatar." }, 400);
    }
    const result = await getPresignedUploadUrl(`avatars/${userId}`, body.contentType);
    return privateJson(result);
  }

  // Phase 2 — persist the URL onto the user row
  if (typeof body.s3Key === "string" && typeof body.url === "string") {
    if (!isOwnedUploadKey(body.s3Key, "avatars", userId)) {
      return privateJson({ error: "Invalid upload key." }, 400);
    }

    // The client cannot substitute a tracking or third-party URL after the
    // server issued an S3 key in this participant's namespace.
    const avatarUrl = getStoredObjectUrl(body.s3Key);
    await updateProfile(userId, { avatarUrl });
    return privateJson({ ok: true, avatarUrl });
  }

  return privateJson({ error: "Missing contentType or s3Key+url." }, 400);
}

// DELETE — clear the avatar, reverting to the initial-letter fallback.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return privateJson({ error: "Sign in required." }, 401);
  }
  const current = await query(
    `SELECT avatar_url FROM users WHERE id = $1`,
    [session.user.id],
  );
  const oldUrl = typeof current.rows[0]?.avatar_url === "string"
    ? current.rows[0].avatar_url
    : null;
  const ownedKey = oldUrl
    ? getOwnedUploadKeyFromUrl(oldUrl, "avatars", session.user.id)
    : null;

  if (ownedKey) {
    try {
      await deleteS3Object(ownedKey);
    } catch (error) {
      console.error("Avatar object deletion failed", error);
      return privateJson(
        { error: "Avatar removal is temporarily unavailable. Nothing was removed." },
        503,
      );
    }
  }

  const result = await query(
    `UPDATE users
        SET avatar_url = NULL, updated_at = NOW()
      WHERE id = $1 AND avatar_url IS NOT DISTINCT FROM $2
      RETURNING id`,
    [session.user.id, oldUrl],
  );
  if (result.rows.length === 0) {
    return privateJson(
      { error: "The avatar changed while removal was in progress. Try again." },
      409,
    );
  }
  return privateJson({ ok: true });
}
