import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateProfile } from "@/lib/social/db";
import { getPresignedUploadUrl } from "@/lib/auction/s3";

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
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Phase 1 — presigned URL
  if (typeof body.contentType === "string") {
    if (!body.contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Only images allowed for avatar." }, { status: 400 });
    }
    const result = await getPresignedUploadUrl(`avatars/${userId}`, body.contentType);
    return NextResponse.json(result);
  }

  // Phase 2 — persist the URL onto the user row
  if (typeof body.s3Key === "string" && typeof body.url === "string") {
    // Same validation path as PATCH /api/social/profile for consistency:
    // must be https (no http, no data:/javascript: URIs).
    try {
      const u = new URL(body.url);
      if (u.protocol !== "https:") {
        return NextResponse.json({ error: "Avatar must be an https URL." }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }

    await updateProfile(userId, { avatarUrl: body.url });
    return NextResponse.json({ ok: true, avatarUrl: body.url });
  }

  return NextResponse.json({ error: "Missing contentType or s3Key+url." }, { status: 400 });
}

// DELETE — clear the avatar, reverting to the initial-letter fallback.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  // Explicit empty string → mapped to null by updateProfile's OR null.
  // We call it with avatarUrl === "" via a raw lib path; updateProfile
  // handles the null conversion internally.
  const { query } = await import("@/lib/db");
  await query(
    `UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = $1`,
    [session.user.id],
  );
  return NextResponse.json({ ok: true });
}
