import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublicProfile, updateProfile, getShowcase, getUserActivity } from "@/lib/social/db";
import { getWishlist } from "@/lib/social/db";
import { getUserAchievements } from "@/lib/social/db";
import { isFollowing } from "@/lib/social/db";
import { getUserReviews } from "@/lib/escrow/trust-engine";

// GET — public profile by username/id, or own profile
export async function GET(request: Request) {
  const url = new URL(request.url);
  const identifier = url.searchParams.get("user");
  const session = await auth();

  const targetId = identifier || session?.user?.id;
  if (!targetId) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const profile = await getPublicProfile(targetId);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const isOwn = session?.user?.id === profile.user_id;

  if (!profile.is_public && !isOwn) {
    return NextResponse.json({ private: true, isOwn: false, profile: { user_id: profile.user_id, username: profile.username, name: profile.name } });
  }

  const [showcase, wishlist, activity, achievements, reviews] = await Promise.all([
    getShowcase(profile.user_id),
    getWishlist(profile.user_id),
    getUserActivity(profile.user_id, 10),
    getUserAchievements(profile.user_id),
    getUserReviews(profile.user_id),
  ]);

  let following = false;
  if (session?.user?.id && !isOwn) {
    following = await isFollowing(session.user.id, profile.user_id);
  }

  return NextResponse.json({ profile, showcase, wishlist, activity, achievements, reviews, following, isOwn, private: false });
}

// Accept both snake_case and camelCase. The /account/profile page has
// always sent `is_public` (snake); this route previously only read
// `body.isPublic` (camel), so the privacy toggle silently failed to
// save — same class of bug as the verification submit contract drift.
function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  return body[camel] ?? body[snake];
}

// PATCH — update own profile. Returns per-field errors on validation
// failure + 409 with a helpful message when a chosen username is
// already taken.
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;

  const usernameRaw = pick(body, "username", "username");
  const username = typeof usernameRaw === "string"
    ? usernameRaw.trim().toLowerCase()
    : undefined;
  const bioRaw = pick(body, "bio", "bio");
  const bio = typeof bioRaw === "string" ? bioRaw.trim() : undefined;
  const avatarRaw = pick(body, "avatarUrl", "avatar_url");
  const avatarUrl = typeof avatarRaw === "string" ? avatarRaw.trim() : undefined;
  const isPublicRaw = pick(body, "isPublic", "is_public");
  const isPublic = typeof isPublicRaw === "boolean" ? isPublicRaw : undefined;
  const acceptsMessagesRaw = pick(body, "acceptsMessages", "accepts_messages");
  const acceptsMessages = typeof acceptsMessagesRaw === "boolean" ? acceptsMessagesRaw : undefined;

  // Per-field validation — client paints the error on the offending
  // input instead of showing a single generic toast.
  const errors: Record<string, string> = {};
  if (username !== undefined) {
    if (username.length < 3 || username.length > 30) {
      errors.username = "Username must be 3-30 characters.";
    } else if (!/^[a-z0-9_]+$/.test(username)) {
      errors.username = "Only lowercase letters, digits, and underscores.";
    }
  }
  if (bio !== undefined && bio.length > 500) {
    errors.bio = "Bio must be 500 characters or fewer.";
  }
  if (avatarUrl !== undefined && avatarUrl !== "") {
    try {
      const u = new URL(avatarUrl);
      if (u.protocol !== "https:") errors.avatarUrl = "Avatar must be an https URL.";
    } catch {
      errors.avatarUrl = "Invalid avatar URL.";
    }
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed.", fields: errors }, { status: 400 });
  }

  try {
    await updateProfile(session.user.id, {
      username,
      bio,
      avatarUrl: avatarUrl === "" ? undefined : avatarUrl,
      isPublic,
      acceptsMessages,
    });
  } catch (err) {
    // Postgres unique_violation (23505) → username clash. Surface as
    // 409 with a field-specific message instead of a generic 500 so
    // the UI can highlight the username input directly.
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken.", fields: { username: "Already taken." } },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ updated: true });
}
