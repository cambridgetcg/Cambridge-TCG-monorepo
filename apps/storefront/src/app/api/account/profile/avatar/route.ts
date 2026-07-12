import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { publicUploadIntakePausedResponse } from "@/lib/uploads/public-intake";

// Both the presign and URL-registration phases are paused. This route does
// not parse the body, so a forged external URL cannot bypass the off-switch.
export async function POST() {
  return publicUploadIntakePausedResponse("avatar");
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
