import { query, transaction } from "@/lib/db";
import type { PublicProfile, ShowcaseCard, WishlistItem, ActivityEvent, Achievement, TradeMatch } from "./types";
import {
  PERSON_PUBLICATION_NOTICE_VERSION,
  ACTIVITY_PUBLICATION_NOTICE_VERSION,
  PUBLISHABLE_EVENT_TYPES,
} from "./publication";

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════

export async function getPublicProfile(identifier: string): Promise<PublicProfile | null> {
  // Look up by username or user ID
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.bio, u.avatar_url, u.is_public,
       u.accepts_messages, u.profile_publication_notice_version,
       u.profile_published_at, u.messaging_notice_version,
       u.messaging_enabled_at,
       u.activity_publication_notice_version, u.activity_published_at,
       COALESCE(tp.is_suspended,FALSE) AS is_suspended,
       u.pronouns, u.preferred_address,
       t.name as tier_name, t.icon as tier_icon, t.color as tier_color,
       u.trust_score, u.trade_count, u.follower_count, u.following_count,
       u.created_at as member_since,
       (SELECT COUNT(*) FROM portfolio_cards WHERE user_id=u.id) as portfolio_count,
       (SELECT AVG(rating) FROM trade_reviews
         WHERE reviewee_id=u.id AND is_public=true AND admin_hidden=false
           AND publication_notice_version=$2 AND published_at IS NOT NULL) as avg_rating,
       (SELECT COUNT(*) FROM trade_reviews
         WHERE reviewee_id=u.id AND is_public=true AND admin_hidden=false
           AND publication_notice_version=$2 AND published_at IS NOT NULL) as total_reviews
     FROM users u
     LEFT JOIN tiers t ON u.tier_id=t.id
     LEFT JOIN trust_profiles tp ON tp.user_id=u.id
     WHERE u.username=$1 OR u.id::text=$1`,
    [identifier, PERSON_PUBLICATION_NOTICE_VERSION]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    ...r,
    portfolio_count: parseInt(r.portfolio_count, 10),
    avg_rating: r.avg_rating ? parseFloat(r.avg_rating) : null,
    total_reviews: parseInt(r.total_reviews, 10),
  } as PublicProfile;
}

export async function updateProfile(userId: string, data: {
  username?: string;
  bio?: string;
  avatarUrl?: string;
  isPublic?: boolean;
  acceptsMessages?: boolean;
  activityPublic?: boolean;
  profileNoticeVersion?: string;
  messagingNoticeVersion?: string;
  activityNoticeVersion?: string;
}): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.username !== undefined) { fields.push(`username=$${idx++}`); values.push(data.username?.toLowerCase().replace(/[^a-z0-9_]/g, "") || null); }
  if (data.bio !== undefined) { fields.push(`bio=$${idx++}`); values.push(data.bio || null); }
  if (data.avatarUrl !== undefined) { fields.push(`avatar_url=$${idx++}`); values.push(data.avatarUrl || null); }
  if (data.isPublic !== undefined) {
    if (data.isPublic && data.profileNoticeVersion !== PERSON_PUBLICATION_NOTICE_VERSION) {
      throw new Error("invalid_profile_publication_notice");
    }
    const enabledParam = `$${idx++}`;
    fields.push(`is_public=${enabledParam}`);
    values.push(data.isPublic);
    const noticeParam = `$${idx++}`;
    fields.push(`profile_publication_notice_version=${noticeParam}`);
    values.push(data.isPublic ? PERSON_PUBLICATION_NOTICE_VERSION : null);
    fields.push(`profile_published_at=CASE
      WHEN ${enabledParam}=FALSE THEN NULL
      WHEN is_public=TRUE
       AND profile_publication_notice_version=${noticeParam}
       AND profile_published_at IS NOT NULL
        THEN profile_published_at
      ELSE NOW()
    END`);
  }
  if (data.acceptsMessages !== undefined) {
    if (data.acceptsMessages && data.messagingNoticeVersion !== PERSON_PUBLICATION_NOTICE_VERSION) {
      throw new Error("invalid_messaging_publication_notice");
    }
    const enabledParam = `$${idx++}`;
    fields.push(`accepts_messages=${enabledParam}`);
    values.push(data.acceptsMessages);
    const noticeParam = `$${idx++}`;
    fields.push(`messaging_notice_version=${noticeParam}`);
    values.push(data.acceptsMessages ? PERSON_PUBLICATION_NOTICE_VERSION : null);
    fields.push(`messaging_enabled_at=CASE
      WHEN ${enabledParam}=FALSE THEN NULL
      WHEN accepts_messages=TRUE
       AND messaging_notice_version=${noticeParam}
       AND messaging_enabled_at IS NOT NULL
        THEN messaging_enabled_at
      ELSE NOW()
    END`);
  }

  if (data.activityPublic !== undefined) {
    if (data.activityPublic && data.activityNoticeVersion !== ACTIVITY_PUBLICATION_NOTICE_VERSION) {
      throw new Error("invalid_activity_publication_notice");
    }
    const enabledParam = `$${idx++}`;
    fields.push(`activity_published_at=CASE
      WHEN ${enabledParam}=FALSE THEN NULL
      ELSE COALESCE(activity_published_at, NOW())
    END`);
    values.push(data.activityPublic);
    const noticeParam = `$${idx++}`;
    fields.push(`activity_publication_notice_version=${noticeParam}`);
    values.push(data.activityPublic ? ACTIVITY_PUBLICATION_NOTICE_VERSION : null);
  }

  if (fields.length === 0) return;
  fields.push("updated_at=NOW()");
  values.push(userId);

  await query(`UPDATE users SET ${fields.join(", ")} WHERE id=$${idx}`, values);
}

// ══════════════════════════════════════════════════════════════
// SHOWCASE
// ══════════════════════════════════════════════════════════════

export async function getShowcase(userId: string): Promise<ShowcaseCard[]> {
  const result = await query(
    `SELECT s.*, p.sku, p.card_name, p.card_number, p.set_name, p.image_url, p.rarity
     FROM showcase_cards s JOIN portfolio_cards p ON s.portfolio_card_id=p.id
     WHERE s.user_id=$1 ORDER BY s.display_order ASC`,
    [userId]
  );
  return result.rows as ShowcaseCard[];
}

// Returns false when the portfolio card doesn't exist or isn't owned by the
// caller — the FK alone only proves existence, not ownership.
export async function addToShowcase(userId: string, portfolioCardId: string, caption?: string): Promise<boolean> {
  const count = await query(`SELECT COUNT(*) FROM showcase_cards WHERE user_id=$1`, [userId]);
  const order = parseInt(count.rows[0].count, 10);
  const result = await query(
    `INSERT INTO showcase_cards (user_id, portfolio_card_id, display_order, caption)
     SELECT $1, id, $3, $4 FROM portfolio_cards WHERE id=$2 AND user_id=$1
     ON CONFLICT (user_id, portfolio_card_id) DO UPDATE SET caption=$4`,
    [userId, portfolioCardId, order, caption || null]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function removeFromShowcase(userId: string, portfolioCardId: string): Promise<void> {
  await query(`DELETE FROM showcase_cards WHERE user_id=$1 AND portfolio_card_id=$2`, [userId, portfolioCardId]);
}

// ══════════════════════════════════════════════════════════════
// WISHLISTS
// ══════════════════════════════════════════════════════════════

export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  const result = await query(
    `SELECT * FROM wishlists WHERE user_id=$1 AND fulfilled=false ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows as WishlistItem[];
}

export async function addToWishlist(userId: string, data: {
  sku?: string;
  cardName: string;
  cardNumber?: string;
  setCode?: string;
  setName?: string;
  imageUrl?: string;
  maxPrice?: number;
  conditionMin?: string;
  notes?: string;
}): Promise<WishlistItem> {
  const result = await query(
    `INSERT INTO wishlists (user_id, sku, card_name, card_number, set_code, set_name, image_url, max_price, condition_min, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id, sku) DO UPDATE SET max_price=$8, notes=$10
     RETURNING *`,
    [userId, data.sku || null, data.cardName, data.cardNumber || null,
     data.setCode || null, data.setName || null, data.imageUrl || null,
     data.maxPrice?.toFixed(2) ?? null, data.conditionMin || "NM", data.notes || null]
  );
  return result.rows[0] as WishlistItem;
}

export async function removeFromWishlist(userId: string, itemId: string): Promise<void> {
  await query(`DELETE FROM wishlists WHERE id=$1 AND user_id=$2`, [itemId, userId]);
}

// ══════════════════════════════════════════════════════════════
// FOLLOWS
// ══════════════════════════════════════════════════════════════

// Atomic toggle — wraps the (delete/insert) + (counter ±1) pair in a
// single transaction so two concurrent clicks from the same client
// can't drift the counters. Previously three separate queries meant
// a follow+unfollow race could leave follower_count permanently
// ahead or behind the real row count.
//
// Returns true when the call CREATED the follow (caller uses this to
// fire a one-shot notification to the followed user).
export async function toggleFollow(followerId: string, followingId: string): Promise<boolean> {
  if (followerId === followingId) return false;

  return transaction(async (q) => {
    const existing = await q(
      `SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`,
      [followerId, followingId]
    );

    if (existing.rows.length > 0) {
      await q(`DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`, [followerId, followingId]);
      await q(`UPDATE users SET follower_count=GREATEST(0,follower_count-1) WHERE id=$1`, [followingId]);
      await q(`UPDATE users SET following_count=GREATEST(0,following_count-1) WHERE id=$1`, [followerId]);
      return false;
    }

    await q(`INSERT INTO follows (follower_id, following_id) VALUES ($1,$2)`, [followerId, followingId]);
    await q(`UPDATE users SET follower_count=follower_count+1 WHERE id=$1`, [followingId]);
    await q(`UPDATE users SET following_count=following_count+1 WHERE id=$1`, [followerId]);
    return true;
  });
}

export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const result = await query(`SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`, [followerId, followingId]);
  return result.rows.length > 0;
}

export async function getFollowers(userId: string): Promise<PublicProfile[]> {
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.avatar_url, u.trust_score, u.trade_count,
       t.icon as tier_icon FROM follows f
     JOIN users u ON f.follower_id=u.id LEFT JOIN tiers t ON u.tier_id=t.id
     WHERE f.following_id=$1 ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows as PublicProfile[];
}

export async function getFollowing(userId: string): Promise<PublicProfile[]> {
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.avatar_url, u.trust_score, u.trade_count,
       t.icon as tier_icon FROM follows f
     JOIN users u ON f.following_id=u.id LEFT JOIN tiers t ON u.tier_id=t.id
     WHERE f.follower_id=$1 ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows as PublicProfile[];
}

// ══════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════════════════════════════

export async function postActivity(userId: string, eventType: string, title: string, data?: {
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  referenceId?: string;
  referenceType?: string;
}): Promise<void> {
  // Forward-only publication, decided at insert: an event is public only if
  // it's a publishable milestone AND its author currently holds the activity
  // receipt. Non-milestones and non-consenting authors write is_public=false.
  // Computed in-SQL so there's no read-modify-write race with a consent toggle.
  await query(
    `INSERT INTO activity_feed (user_id, event_type, title, description, image_url, link_url, reference_id, reference_type, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
       ($2 = ANY($9::text[])) AND EXISTS (
         SELECT 1 FROM users u
          WHERE u.id = $1
            AND u.activity_publication_notice_version = $10
            AND u.activity_published_at IS NOT NULL))`,
    [userId, eventType, title, data?.description || null, data?.imageUrl || null,
     data?.linkUrl || null, data?.referenceId || null, data?.referenceType || null,
     PUBLISHABLE_EVENT_TYPES, ACTIVITY_PUBLICATION_NOTICE_VERSION]
  );
}

export async function getCommunityFeed(options: {
  viewerUserId?: string;
  followingOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 30);
  const followingOnly = options.followingOnly === true;

  // A follow view without a viewer has no edges to read — return empty rather
  // than leak a global feed under a "following" label.
  if (followingOnly && !options.viewerUserId) return [];

  // Publication gate (all three, always): the event is a public milestone row
  // AND its author STILL holds the current activity receipt AND is not
  // suspended. Re-checking the receipt on read makes withdrawal instant.
  // Ranking = activity-rank-v1 (see @/lib/social/publication): at most 2 events
  // per member reach the feed (so a high-cadence member can't bury others),
  // then order by milestone significance, then recency.
  const params: unknown[] = [
    ACTIVITY_PUBLICATION_NOTICE_VERSION, // $1
    PUBLISHABLE_EVENT_TYPES,             // $2
    limit,                               // $3
  ];
  let followClause = "";
  if (followingOnly) {
    params.push(options.viewerUserId); // $4
    followClause = `AND f.user_id IN (SELECT following_id FROM follows WHERE follower_id = $4)`;
  }

  const result = await query(
    `WITH ranked AS (
       SELECT f.*,
              u.name AS user_name, u.username AS user_username, u.avatar_url AS user_avatar,
              CASE f.event_type
                WHEN 'set_completed' THEN 4 WHEN 'achievement_earned' THEN 3
                WHEN 'auction_won' THEN 2 WHEN 'trade_completed' THEN 1 ELSE 0
              END AS significance,
              ROW_NUMBER() OVER (
                PARTITION BY f.user_id
                ORDER BY CASE f.event_type
                  WHEN 'set_completed' THEN 4 WHEN 'achievement_earned' THEN 3
                  WHEN 'auction_won' THEN 2 WHEN 'trade_completed' THEN 1 ELSE 0
                END DESC, f.created_at DESC
              ) AS per_user_rank
         FROM activity_feed f
         JOIN users u ON u.id = f.user_id
         LEFT JOIN trust_profiles tp ON tp.user_id = u.id
        WHERE f.is_public = true
          AND f.event_type = ANY($2::text[])
          AND u.activity_publication_notice_version = $1
          AND u.activity_published_at IS NOT NULL
          AND COALESCE(tp.is_suspended, false) = false
          ${followClause}
     )
     SELECT * FROM ranked
      WHERE per_user_rank <= 2
      ORDER BY significance DESC, created_at DESC
      LIMIT $3`,
    params,
  );
  return result.rows as ActivityEvent[];
}

export async function getUserActivity(
  userId: string,
  limit: number = 20,
  includePrivate: boolean = false,
): Promise<ActivityEvent[]> {
  if (!includePrivate) {
    return [];
  }
  const result = await query(
    `SELECT f.*, u.name as user_name, u.username as user_username, u.avatar_url as user_avatar
     FROM activity_feed f JOIN users u ON f.user_id=u.id
     WHERE f.user_id=$1 ORDER BY f.created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows as ActivityEvent[];
}

// ══════════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ══════════════════════════════════════════════════════════════

export async function getUserAchievements(userId: string): Promise<Achievement[]> {
  const result = await query(
    `SELECT a.*, ua.earned_at FROM achievements a
     LEFT JOIN user_achievements ua ON a.id=ua.achievement_id AND ua.user_id=$1
     ORDER BY a.sort_order ASC`,
    [userId]
  );
  return result.rows as Achievement[];
}

export async function awardAchievement(userId: string, code: string): Promise<boolean> {
  const achievement = await query(`SELECT id FROM achievements WHERE code=$1`, [code]);
  if (achievement.rows.length === 0) return false;

  await query(
    `INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [userId, achievement.rows[0].id]
  );

  // Post activity
  const a = await query(`SELECT * FROM achievements WHERE code=$1`, [code]);
  if (a.rows[0]) {
    await postActivity(userId, "achievement_earned",
      `Earned: ${a.rows[0].icon} ${a.rows[0].name}`,
      { description: a.rows[0].description }
    );
  }

  return true;
}

// ══════════════════════════════════════════════════════════════
// TRADE MATCHING (find people who want what you have + vice versa)
// ══════════════════════════════════════════════════════════════

export async function findTradeMatches(userId: string): Promise<TradeMatch[]> {
  // Paused until an explicit trade_intents projection exists. A portfolio is
  // private inventory, not an offer; a wishlist is private planning, not
  // permission to scan it into a people graph. Keep the typed seam so the UI
  // can say why matching is unavailable without reviving the unsafe query.
  void userId;
  return [];
}
