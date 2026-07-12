import { query, transaction } from "@/lib/db";
import type { PublicProfile, ShowcaseCard, WishlistItem, ActivityEvent, Achievement, TradeMatch } from "./types";
import { COLLECTOR_PASSPORT_NOTICE_VERSION } from "@/lib/collector-passport/types";

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════

export async function getPublicProfile(
  identifier: string,
  viewerUserId?: string,
): Promise<PublicProfile | null> {
  // Look up by username or user ID
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.bio, u.avatar_url, u.is_public,
       u.accepts_messages,
       u.pronouns, u.preferred_address,
       t.name as tier_name, t.icon as tier_icon, t.color as tier_color,
       u.trust_score, u.trade_count, u.follower_count, u.following_count,
       u.created_at as member_since,
       (SELECT COUNT(*) FROM portfolio_cards WHERE user_id=u.id) as portfolio_count,
       (SELECT AVG(rating) FROM trade_reviews
         WHERE reviewee_id=u.id AND is_public=true AND admin_hidden=false) as avg_rating,
       (SELECT COUNT(*) FROM trade_reviews
         WHERE reviewee_id=u.id AND is_public=true AND admin_hidden=false) as total_reviews
     FROM users u
     LEFT JOIN tiers t ON u.tier_id=t.id
     LEFT JOIN trust_profiles tp ON tp.user_id=u.id
     WHERE (u.username=$1 OR u.id::text=$1)
       AND (
         COALESCE(tp.is_suspended,FALSE)=FALSE
         OR u.id::text=$2
       )`,
    [identifier, viewerUserId ?? null]
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
}): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.username !== undefined) { fields.push(`username=$${idx++}`); values.push(data.username?.toLowerCase().replace(/[^a-z0-9_]/g, "") || null); }
  if (data.bio !== undefined) { fields.push(`bio=$${idx++}`); values.push(data.bio || null); }
  if (data.avatarUrl !== undefined) { fields.push(`avatar_url=$${idx++}`); values.push(data.avatarUrl || null); }
  if (data.isPublic !== undefined) { fields.push(`is_public=$${idx++}`); values.push(data.isPublic); }
  if (data.acceptsMessages !== undefined) { fields.push(`accepts_messages=$${idx++}`); values.push(data.acceptsMessages); }

  if (fields.length === 0) return;
  fields.push("updated_at=NOW()");
  values.push(userId);

  await transaction(async (tx) => {
    await tx(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    await tx(`UPDATE users SET ${fields.join(", ")} WHERE id=$${idx}`, values);

    // Making the profile private is a withdrawal, not a temporary read gate.
    // Clear every current Passport receipt in the same transaction so turning
    // the profile public again cannot silently resurrect old publication.
    if (data.isPublic === false) {
      await tx(
        `INSERT INTO collector_passport_publication_log
           (showcase_card_id, public_id, actor_user_id, action, notice_version)
         SELECT id, public_id, $1, 'withdrawn',
                COALESCE(passport_notice_version, $2)
           FROM showcase_cards
          WHERE user_id = $1 AND passport_public = TRUE`,
        [userId, COLLECTOR_PASSPORT_NOTICE_VERSION],
      );
      await tx(
        `UPDATE showcase_cards
            SET passport_public = FALSE,
                passport_published_at = NULL,
                passport_notice_version = NULL,
                updated_at = NOW()
          WHERE user_id = $1 AND passport_public = TRUE`,
        [userId],
      );
    }
  });
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
  return transaction(async (tx) => {
    await tx(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    const nextOrder = await tx(
      `SELECT COALESCE(MAX(display_order), -1)::int + 1 AS n
         FROM showcase_cards WHERE user_id=$1`,
      [userId],
    );
    const result = await tx(
      `INSERT INTO showcase_cards (user_id, portfolio_card_id, display_order, caption)
       SELECT $1, id, $3, $4 FROM portfolio_cards WHERE id=$2 AND user_id=$1
       ON CONFLICT (user_id, portfolio_card_id)
       DO UPDATE SET caption=$4, updated_at=NOW()
       RETURNING id`,
      [userId, portfolioCardId, Number(nextOrder.rows[0]?.n ?? 0), caption || null],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

export async function removeFromShowcase(userId: string, portfolioCardId: string): Promise<boolean> {
  return transaction(async (tx) => {
    await tx(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);
    const selected = await tx(
      `SELECT id, public_id, passport_public, passport_notice_version
         FROM showcase_cards
        WHERE user_id=$1 AND portfolio_card_id=$2
        FOR UPDATE`,
      [userId, portfolioCardId],
    );
    const item = selected.rows[0];
    if (!item) return false;
    if (item.passport_public) {
      await tx(
        `INSERT INTO collector_passport_publication_log
           (showcase_card_id, public_id, actor_user_id, action, notice_version)
         VALUES ($1, $2, $3, 'withdrawn', $4)`,
        [item.id, item.public_id, userId, item.passport_notice_version ?? COLLECTOR_PASSPORT_NOTICE_VERSION],
      );
      // Clear selection before DELETE so the fallback trigger cannot append a
      // second receipt. The authenticated application path owns this actor.
      await tx(
        `UPDATE showcase_cards
            SET passport_public=FALSE,
                passport_published_at=NULL,
                passport_notice_version=NULL,
                updated_at=NOW()
          WHERE id=$1`,
        [item.id],
      );
    }
    const removed = await tx(
      `DELETE FROM showcase_cards
        WHERE user_id=$1 AND portfolio_card_id=$2
        RETURNING id`,
      [userId, portfolioCardId],
    );
    return (removed.rowCount ?? 0) > 0;
  });
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
     LEFT JOIN trust_profiles tp ON tp.user_id=u.id
     WHERE f.following_id=$1
       AND u.is_public=TRUE
       AND COALESCE(tp.is_suspended,FALSE)=FALSE
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows as PublicProfile[];
}

export async function getFollowing(userId: string): Promise<PublicProfile[]> {
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.avatar_url, u.trust_score, u.trade_count,
       t.icon as tier_icon FROM follows f
     JOIN users u ON f.following_id=u.id LEFT JOIN tiers t ON u.tier_id=t.id
     LEFT JOIN trust_profiles tp ON tp.user_id=u.id
     WHERE f.follower_id=$1
       AND u.is_public=TRUE
       AND COALESCE(tp.is_suspended,FALSE)=FALSE
     ORDER BY f.created_at DESC`,
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
  isPublic?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO activity_feed (user_id, event_type, title, description, image_url, link_url, reference_id, reference_type, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [userId, eventType, title, data?.description || null, data?.imageUrl || null,
     data?.linkUrl || null, data?.referenceId || null, data?.referenceType || null,
     data?.isPublic === true]
  );
}

export async function getCommunityFeed(options: {
  followingUserId?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 30);
  const offset = 0;

  let where = `WHERE f.is_public=TRUE
    AND u.is_public=TRUE
    AND COALESCE(tp.is_suspended,FALSE)=FALSE`;
  const params: unknown[] = [];

  if (options.followingUserId) {
    params.push(options.followingUserId);
    where = `WHERE f.is_public=TRUE
      AND u.is_public=TRUE
      AND COALESCE(tp.is_suspended,FALSE)=FALSE
      AND (f.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1) OR f.user_id=$1)
      AND NOT EXISTS (
        SELECT 1 FROM user_blocks b
         WHERE (b.blocker_id=$1 AND b.blocked_id=f.user_id)
            OR (b.blocker_id=f.user_id AND b.blocked_id=$1)
      )`;
  }

  params.push(limit, offset);
  const result = await query(
    `SELECT f.event_type, f.title, f.description, f.image_url, f.created_at,
       u.name as user_name, u.username as user_username,
       u.avatar_url as user_avatar, t.icon as tier_icon
     FROM activity_feed f
     JOIN users u ON f.user_id=u.id
     LEFT JOIN tiers t ON u.tier_id=t.id
     LEFT JOIN trust_profiles tp ON tp.user_id=u.id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows as ActivityEvent[];
}

export async function getUserActivity(
  userId: string,
  limit: number = 20,
  includePrivate: boolean = false,
): Promise<ActivityEvent[]> {
  const visibility = includePrivate ? "" : "AND f.is_public=TRUE";
  const result = await query(
    `SELECT f.*, u.name as user_name, u.username as user_username, u.avatar_url as user_avatar
     FROM activity_feed f JOIN users u ON f.user_id=u.id
     WHERE f.user_id=$1 ${visibility} ORDER BY f.created_at DESC LIMIT $2`,
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
