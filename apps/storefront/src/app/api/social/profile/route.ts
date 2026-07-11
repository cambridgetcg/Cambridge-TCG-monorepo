import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublicProfile, updateProfile, getShowcase, getUserActivity } from "@/lib/social/db";
import { getWishlist } from "@/lib/social/db";
import { getUserAchievements } from "@/lib/social/db";
import { isFollowing } from "@/lib/social/db";
import { getUserReviews } from "@/lib/escrow/trust-engine";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";

const PERSON_HEADERS = { "Cache-Control": "private, no-store" };

// GET — public profile by username/id, or own profile
export async function GET(request: Request) {
  const url = new URL(request.url);
  const identifier = url.searchParams.get("user");
  const session = await auth();

  // `?user=me` (or no `user` param) means "my own profile". The profile
  // fields (username/bio/is_public/…) live on the users row, which is
  // created at magic-link signup — so resolving `me` to the session user
  // id CREATE-OR-RETURNS the caller's profile. The old code passed the
  // literal string "me" to the lookup, which matched no username/id and
  // 404'd, so every fresh account's /account/profile read as "signed out".
  const wantsSelf = !identifier || identifier === "me";
  if (wantsSelf && !session?.user?.id) {
    // Not a missing user — a missing session. 401 lets the page show
    // "sign in" instead of misreading a 404 as signed-out.
    return NextResponse.json(
      { error: "Sign in to view your profile.", code: "auth_required" },
      { status: 401, headers: PERSON_HEADERS },
    );
  }
  const targetId = wantsSelf ? session!.user!.id : identifier;

  const profile = await getPublicProfile(targetId);
  if (!profile) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404, headers: PERSON_HEADERS },
    );
  }

  const isOwn = session?.user?.id === profile.user_id;
  const hasCurrentPublication =
    profile.is_public &&
    profile.profile_publication_notice_version === PERSON_PUBLICATION_NOTICE_VERSION &&
    Boolean(profile.profile_published_at) &&
    !profile.is_suspended;

  if (!hasCurrentPublication && !isOwn) {
    // A private profile is indistinguishable from an unknown handle. Returning
    // even a UUID/name pair confirmed an account and linked its private identity.
    return NextResponse.json(
      { error: "User not found." },
      { status: 404, headers: PERSON_HEADERS },
    );
  }

  const [showcase, wishlist, activity, achievements, reviews] = await Promise.all([
    getShowcase(profile.user_id),
    isOwn ? getWishlist(profile.user_id) : Promise.resolve([]),
    getUserActivity(profile.user_id, 10, isOwn),
    isOwn ? getUserAchievements(profile.user_id) : Promise.resolve([]),
    getUserReviews(profile.user_id, isOwn),
  ]);

  let following = false;
  if (session?.user?.id && !isOwn) {
    following = await isFollowing(session.user.id, profile.user_id);
  }

  // A public profile is one publication choice, not blanket permission for
  // every attached table. Wishlist items have no per-item publication field,
  // so they remain owner-only until an explicit trade-intent model exists.
  const visibleWishlist = isOwn ? wishlist : [];

  // Public projections omit internal identifiers and exact transaction data.
  // Signed-in owners still receive the full records needed by account tools.
  const visibleProfile = isOwn ? profile : {
    username: profile.username,
    name: profile.name,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    is_public: true,
    pronouns: profile.pronouns,
    preferred_address: profile.preferred_address,
    tier_name: profile.tier_name,
    tier_icon: profile.tier_icon,
    tier_color: profile.tier_color,
    trust_score: profile.trust_score,
    trade_count: profile.trade_count,
    follower_count: profile.follower_count,
    following_count: profile.following_count,
    avg_rating: profile.avg_rating,
    total_reviews: profile.total_reviews,
    member_since: profile.member_since,
  };
  const visibleShowcase = isOwn
    ? showcase
    : showcase.map((card) => ({
        display_order: card.display_order,
        caption: card.caption,
        sku: card.sku,
        card_name: card.card_name,
        card_number: card.card_number,
        set_name: card.set_name,
        image_url: card.image_url,
        rarity: card.rarity,
      }));
  const visibleActivity = isOwn
    ? activity
    : activity.map((event) => ({
        event_type: event.event_type,
        title: event.title,
        description: event.description,
        image_url: event.image_url,
        created_at: event.created_at,
        user_name: event.user_name,
        user_username: event.user_username,
        user_avatar: event.user_avatar,
      }));
  const visibleReviews = isOwn
    ? reviews
    : reviews.map((review) => {
        const record = review as typeof review & {
          card_accuracy?: number | null;
          shipping_speed?: number | null;
          communication?: number | null;
          comment?: string | null;
          reviewer_name?: string | null;
          created_at?: string;
        };
        return {
          rating: record.rating,
          card_accuracy: record.card_accuracy ?? null,
          shipping_speed: record.shipping_speed ?? null,
          communication: record.communication ?? null,
          comment: record.comment ?? null,
          reviewer_name: record.reviewer_name ?? null,
          created_at: record.created_at ?? null,
        };
      });

  return NextResponse.json(
    {
      profile: visibleProfile,
      showcase: visibleShowcase,
      wishlist: visibleWishlist,
      activity: visibleActivity,
      achievements: isOwn ? achievements : [],
      reviews: visibleReviews,
      following,
      isOwn,
      private: false,
      publication: {
        wishlist: isOwn ? "owner" : "withheld_pending_item_level_consent",
        internal_ids: isOwn ? "owner" : "withheld",
      },
    },
    { headers: PERSON_HEADERS },
  );
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
  const profileNoticeVersion = typeof body.profile_publication_notice_version === "string"
    ? body.profile_publication_notice_version
    : undefined;
  const messagingNoticeVersion = typeof body.messaging_notice_version === "string"
    ? body.messaging_notice_version
    : undefined;

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
  if (isPublic === true && profileNoticeVersion !== PERSON_PUBLICATION_NOTICE_VERSION) {
    errors.is_public = "Read and accept the current public-profile notice.";
  }
  if (acceptsMessages === true && messagingNoticeVersion !== PERSON_PUBLICATION_NOTICE_VERSION) {
    errors.accepts_messages = "Read and accept the current direct-message notice.";
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
      profileNoticeVersion,
      messagingNoticeVersion,
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
