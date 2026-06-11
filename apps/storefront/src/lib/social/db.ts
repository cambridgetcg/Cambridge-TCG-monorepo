import { query, transaction } from "@/lib/db";
import type { PublicProfile, ShowcaseCard, WishlistItem, ActivityEvent, Achievement, TradeMatch } from "./types";

// ══════════════════════════════════════════════════════════════
// PROFILES
// ══════════════════════════════════════════════════════════════

export async function getPublicProfile(identifier: string): Promise<PublicProfile | null> {
  // Look up by username or user ID
  const result = await query(
    `SELECT u.id as user_id, u.username, u.name, u.bio, u.avatar_url, u.is_public,
       u.pronouns, u.preferred_address,
       t.name as tier_name, t.icon as tier_icon, t.color as tier_color,
       u.trust_score, u.trade_count, u.follower_count, u.following_count,
       u.created_at as member_since,
       (SELECT COUNT(*) FROM portfolio_cards WHERE user_id=u.id) as portfolio_count,
       (SELECT AVG(rating) FROM trade_reviews WHERE reviewee_id=u.id AND admin_hidden=false) as avg_rating,
       (SELECT COUNT(*) FROM trade_reviews WHERE reviewee_id=u.id AND admin_hidden=false) as total_reviews
     FROM users u LEFT JOIN tiers t ON u.tier_id=t.id
     WHERE u.username=$1 OR u.id::text=$1`,
    [identifier]
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

export async function addToShowcase(userId: string, portfolioCardId: string, caption?: string): Promise<void> {
  const count = await query(`SELECT COUNT(*) FROM showcase_cards WHERE user_id=$1`, [userId]);
  const order = parseInt(count.rows[0].count, 10);
  await query(
    `INSERT INTO showcase_cards (user_id, portfolio_card_id, display_order, caption)
     VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, portfolio_card_id) DO UPDATE SET caption=$4`,
    [userId, portfolioCardId, order, caption || null]
  );
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

  const created = await transaction(async (q) => {
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

  // Community Pillar: the FOLLOWED user earns it at 50 followers. Seeded but
  // never awarded before this — an unearnable badge, now wired. Idempotent.
  if (created) {
    const fc = await query(`SELECT follower_count FROM users WHERE id=$1`, [followingId]);
    if ((fc.rows[0]?.follower_count ?? 0) >= 50) {
      awardAchievement(followingId, "community_pillar").catch(() => {});
    }
  }

  return created;
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
  isPublic?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO activity_feed (user_id, event_type, title, description, image_url, link_url, reference_id, reference_type, is_public)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [userId, eventType, title, data?.description || null, data?.imageUrl || null,
     data?.linkUrl || null, data?.referenceId || null, data?.referenceType || null,
     data?.isPublic !== false]
  );
}

export async function getCommunityFeed(options: {
  followingUserId?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityEvent[]> {
  const limit = options.limit || 30;
  const offset = options.offset || 0;

  let where = "WHERE f.is_public=true";
  const params: unknown[] = [];

  if (options.followingUserId) {
    params.push(options.followingUserId);
    where = `WHERE f.is_public=true AND (f.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1) OR f.user_id=$1)`;
  }

  params.push(limit, offset);
  const result = await query(
    `SELECT f.*, u.name as user_name, u.username as user_username, u.avatar_url as user_avatar,
       t.icon as tier_icon
     FROM activity_feed f
     JOIN users u ON f.user_id=u.id
     LEFT JOIN tiers t ON u.tier_id=t.id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return result.rows as ActivityEvent[];
}

export async function getUserActivity(userId: string, limit: number = 20): Promise<ActivityEvent[]> {
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

// Badges seeded but with no awarding code path yet are hidden so the UI never
// dangles a goal the system can't grant (substrate honesty; TRU — a reward must
// be earnable). Delete a code from this set the moment its awarder ships.
// set_complete needs real full-set-completion detection — no signal exists yet.
const NOT_YET_EARNABLE = new Set<string>(["set_complete"]);

export async function getUserAchievements(userId: string): Promise<Achievement[]> {
  const result = await query(
    `SELECT a.*, ua.earned_at FROM achievements a
     LEFT JOIN user_achievements ua ON a.id=ua.achievement_id AND ua.user_id=$1
     ORDER BY a.sort_order ASC`,
    [userId]
  );
  // Keep an unearnable badge only if this user somehow already earned it.
  return (result.rows as Achievement[]).filter(
    (a) => !NOT_YET_EARNABLE.has(a.code) || a.earned_at != null
  );
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
  // Find users whose wishlists match your portfolio
  const yourCards = await query(
    `SELECT sku, card_name, image_url FROM portfolio_cards WHERE user_id=$1`,
    [userId]
  );
  const yourWishlist = await query(
    `SELECT sku, card_name, image_url FROM wishlists WHERE user_id=$1 AND fulfilled=false AND sku IS NOT NULL`,
    [userId]
  );

  if (yourCards.rows.length === 0 && yourWishlist.rows.length === 0) return [];

  const yourSkus = yourCards.rows.map((c: { sku: string }) => c.sku);
  const yourWantSkus = yourWishlist.rows.map((w: { sku: string }) => w.sku);

  // Users who want your cards
  const wanters = yourSkus.length > 0 ? await query(
    `SELECT DISTINCT w.user_id, w.sku, w.card_name, w.image_url
     FROM wishlists w WHERE w.sku=ANY($1) AND w.user_id!=$2 AND w.fulfilled=false`,
    [yourSkus, userId]
  ) : { rows: [] };

  // Users who have cards you want
  const havers = yourWantSkus.length > 0 ? await query(
    `SELECT DISTINCT p.user_id, p.sku, p.card_name, p.image_url
     FROM portfolio_cards p WHERE p.sku=ANY($1) AND p.user_id!=$2`,
    [yourWantSkus, userId]
  ) : { rows: [] };

  // Merge matches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchMap = new Map<string, { yours: any[]; theirs: any[] }>();

  for (const w of wanters.rows) {
    if (!matchMap.has(w.user_id)) matchMap.set(w.user_id, { yours: [], theirs: [] });
    matchMap.get(w.user_id)!.yours.push(w);
  }
  for (const h of havers.rows) {
    if (!matchMap.has(h.user_id)) matchMap.set(h.user_id, { yours: [], theirs: [] });
    matchMap.get(h.user_id)!.theirs.push(h);
  }

  // Fetch user info for matches
  const matchUserIds = [...matchMap.keys()];
  if (matchUserIds.length === 0) return [];

  const users = await query(
    `SELECT id, username, name, avatar_url, trust_score FROM users WHERE id=ANY($1)`,
    [matchUserIds]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap = new Map(users.rows.map((u: any) => [u.id, u]));

  return matchUserIds
    .map(uid => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = userMap.get(uid) as any;
      const match = matchMap.get(uid)!;
      if (!user) return null;
      return {
        user_id: uid,
        username: user.username,
        name: user.name,
        avatar_url: user.avatar_url,
        trust_score: user.trust_score,
        your_cards: match.yours,
        their_cards: match.theirs,
      } as TradeMatch;
    })
    .filter(Boolean)
    .sort((a, b) => (b!.your_cards.length + b!.their_cards.length) - (a!.your_cards.length + a!.their_cards.length)) as TradeMatch[];
}
