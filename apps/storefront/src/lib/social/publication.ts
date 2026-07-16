export const PERSON_PUBLICATION_NOTICE_VERSION = "person-publication-v1";

export const PERSON_PUBLICATION_NOTICE_PATH = "/privacy#person-publication";

/**
 * Immutable text for the receipt version above. Change the version whenever
 * any promise in this object changes; publication receipts point to this exact
 * wording, while the rest of /privacy may continue to evolve.
 */
export const PERSON_PUBLICATION_NOTICE = Object.freeze({
  version: PERSON_PUBLICATION_NOTICE_VERSION,
  effective_from: "2026-07-11",
  profile:
    "Publishing your profile lets anyone view your username, display name, bio, avatar, pronouns, preferred form of address, tier and trust score, account age, follower, following and completed-trade counts, current seller vacation status and end date, selected showcase cards, and reviews that their reviewers separately published. Your email, internal account ID, delivery address, collection, wishlist, private notes and messages are not published by this choice.",
  messaging:
    "Enabling direct messages lets a signed-in visitor to your published profile start a conversation. Existing conversations can continue, and a person with a validated listing or trade context can start a relevant conversation, even when this setting is off. Blocks, suspension checks and rate limits still apply.",
  review:
    "Publishing a review lets anyone view its rating, comment, sub-ratings and date on the reviewed trader's public profile. Your reviewer label appears only while your own profile has a current publication receipt. The trade ID and price stay private.",
  withdrawal:
    "Turning a publication choice off stops Cambridge TCG serving it publicly. It cannot recall a copy that someone already fetched while it was public.",
});

// ── Activity publication — the separate, per-purpose choice the community
//    feed was paused for (methodology/community → Conditions for resumption).
export const ACTIVITY_PUBLICATION_NOTICE_VERSION = "activity-publication-v1";
export const ACTIVITY_PUBLICATION_NOTICE_PATH = "/privacy#activity-publication";

/**
 * The milestone event types this choice publishes — and ONLY these. Portfolio
 * contents, wishlists, purchases, prices, messages, rewards and card-by-card
 * changes are never published by this choice. Forward-only: activity created
 * before the receipt is held stays private.
 */
export const PUBLISHABLE_EVENT_TYPES = Object.freeze([
  "trade_completed",
  "auction_won",
  "achievement_earned",
  "set_completed",
]);

/**
 * The community-feed ranking, versioned + documented (methodology requires
 * both, and that a slow-cadence member is not buried by a high-cadence one):
 * at most 2 events per member reach the feed (anti-flood), then events are
 * ordered by SIGNIFICANCE first (set completion > achievement > auction won >
 * completed trade), then recency — so a quiet member's one big milestone
 * outranks a busy member's stream of small ones.
 */
export const ACTIVITY_RANK_VERSION = "activity-rank-v1";
export const ACTIVITY_SIGNIFICANCE: Readonly<Record<string, number>> = Object.freeze({
  set_completed: 4,
  achievement_earned: 3,
  auction_won: 2,
  trade_completed: 1,
});

export const ACTIVITY_PUBLICATION_NOTICE = Object.freeze({
  version: ACTIVITY_PUBLICATION_NOTICE_VERSION,
  effective_from: "2026-07-16",
  activity:
    "Publishing your activity shows your milestones — completed trades, auctions you win, achievements you earn, and sets you complete — on the community feed, from the moment you turn this on. Your past activity is not published. Your collection, wishlist, purchases, prices paid, private notes and messages are never published by this choice.",
  ranking:
    "The feed shows at most two of your events at a time and ranks by the significance of the milestone, not by how often you post, so a member who trades once a season is not buried by one who trades daily.",
  withdrawal:
    "Turning this off stops Cambridge TCG serving your activity publicly straight away, including milestones already shown. It cannot recall a copy someone already saw while it was public.",
});
