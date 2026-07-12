import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("community privacy contract", () => {
  it("installs private defaults without rewriting existing person data", () => {
    const sql = source("drizzle/0117_privacy_defaults.sql");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS privacy_publication_reset_20260711");
    expect(sql).toContain("privacy_publication_reset_20260711_runs");
    expect(sql).toContain("previous_value TEXT NOT NULL");
    expect(sql).toContain("ALTER TABLE trade_reviews\n  ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN accepts_messages SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN visibility SET DEFAULT 'private'");
    expect(sql).toContain("ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("profile_publication_notice_version TEXT");
    expect(sql).toContain("messaging_notice_version TEXT");
    expect(sql).toContain("publication_notice_version TEXT");
    expect(sql).toContain("Legacy self-submission flag without verification evidence");
    expect(sql).toContain("Private audit ledger");
    expect(sql).toContain("ALTER COLUMN cutoff_at SET NOT NULL");
    expect(sql).not.toContain("rolled_back_at");
    expect(sql).not.toContain("rollback_counts");
    expect(sql).not.toMatch(/\bUPDATE\s+(users|activity_feed|collective_members|trade_reviews)\b/);
    expect(sql).not.toContain("BEGIN;");
    expect(sql).not.toContain("COMMIT;");
  });

  it("keeps the legacy reset separate, preview-first, gated, and auditable", () => {
    const reset = source("scripts/reset-person-publication.ts");
    expect(reset).toContain('return "preview"');
    expect(reset).toContain('writes: false');
    expect(reset).toContain("--legacy-before");
    expect(reset).toContain("--gated-app-live");
    expect(reset).toContain("APPLY-PERSON-PUBLICATION-RESET-20260711");
    expect(reset).toContain("pg_advisory_xact_lock");
    expect(reset).toContain("applyReset(transaction, cutoff)");
    expect(reset).toContain("reconciliation(query)");
    expect(reset).toContain("privacy_publication_reset_20260711_runs");
    expect(reset).toContain("private_defaults");
    expect(reset).toContain("ledger_required_columns");
    expect(reset).toContain("ledger_primary_keys");
    expect(reset).toContain("captured[key] !== updated[key]");
    expect(reset).toContain("bounty_phone_unverified");
    expect(reset).toContain("phone_verified=FALSE");
    expect(reset).toContain("phone_verified_at=NULL");
    expect(reset).not.toContain("updated_at < $1 AND phone_verified=TRUE");
    expect(reset).not.toContain('"--rollback"');
    expect(reset).not.toContain("rollbackReset");
    expect(reset).not.toMatch(/SET (is_public|accepts_messages)=TRUE/);
    expect(reset).not.toContain("SET visibility='public'");

    const runbook = source("../../docs/operations/person-publication-reset.md");
    expect(runbook).toContain("no automated logical rollback command");
    expect(runbook).toContain("leave the reset `false` and `private` values");
    expect(runbook).toContain("may overwrite every post-snapshot change");
    expect(runbook).toContain("--plan --expect-only 0117_privacy_defaults.sql");
    expect(runbook).not.toContain("--rollback");

    const migrate = source("scripts/migrate.mjs");
    expect(migrate).toContain('process.argv.includes("--plan")');
    expect(migrate).toContain('process.argv.indexOf("--expect-only")');
    expect(migrate).toContain("pending.length !== 1");
    expect(migrate).toContain("No migration was applied");
  });

  it("keeps every account message read private and non-cacheable", () => {
    for (const path of [
      "src/app/api/messages/conversations/route.ts",
      "src/app/api/messages/blocks/route.ts",
      "src/app/api/messages/conversations/[id]/route.ts",
      "src/app/api/messages/unread-count/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain('const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" }');
      expect(route).toContain("{ headers: PRIVATE_HEADERS }");
    }
  });

  it("requires publication and disables shared caching on public person routes", () => {
    for (const path of [
      "src/app/api/u/[username]/activity/route.ts",
      "src/app/api/u/[username]/commerce/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain("u.is_public = TRUE");
      expect(route).toContain("u.profile_publication_notice_version");
      expect(route).toContain("u.profile_published_at IS NOT NULL");
      expect(route).toContain("COALESCE(tp.is_suspended, FALSE) = FALSE");
      expect(route).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("ties each receipt version to immutable text and preserves its first timestamp", () => {
    const publication = source("src/lib/social/publication.ts");
    expect(publication).toContain('PERSON_PUBLICATION_NOTICE_VERSION = "person-publication-v1"');
    expect(publication).toContain("Object.freeze");
    expect(publication).toContain("Publishing your profile lets anyone view");
    expect(publication).toContain("validated listing or trade context");
    expect(publication).toContain("Publishing a review lets anyone view");
    expect(publication).toContain("cannot recall a copy");

    const db = source("src/lib/social/db.ts");
    expect(db).toContain("THEN profile_published_at");
    expect(db).toContain("THEN messaging_enabled_at");
    expect(db).toContain("profile_publication_notice_version=${noticeParam}");
    expect(db).toContain("messaging_notice_version=${noticeParam}");
  });

  it("does not confirm that a private profile exists", () => {
    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain('{ error: "User not found." }');
    expect(route).toContain('{ status: 404, headers: PERSON_HEADERS }');
    expect(route).toContain("!profile.is_suspended");
    expect(route).toContain("profile.profile_publication_notice_version");
    expect(route).not.toContain("profile: { user_id: profile.user_id");
  });

  it("pauses the public feed until activity has its own receipt", () => {
    const db = source("src/lib/social/db.ts");
    const publicFeed = db.slice(
      db.indexOf("export async function getCommunityFeed"),
      db.indexOf("export async function getUserActivity"),
    );
    expect(publicFeed).toContain("No per-event person receipt exists yet");
    expect(publicFeed).toContain("return []");
    expect(publicFeed).not.toContain("FROM activity_feed");

    const route = source("src/app/api/social/feed/route.ts");
    expect(route).toContain("Historical bulk activity paging is unavailable");
    expect(route).toContain('status: "paused"');
    expect(route).toContain('"Cache-Control": "private, no-store"');

    const page = source("src/app/community/page.tsx");
    expect(page).toContain("Public activity and portfolio/wishlist matching are paused");
    expect(page).toContain("setPublicationReason");
    expect(page).toContain("Public activity is paused until each event has its own publication choice.");
    expect(page).toContain("Trade matching is paused. Portfolios and wishlists remain private");
    expect(page).toContain('["Ranking policy", "/leaderboards"]');
    expect(page).not.toContain("Trades, wins, pulls, and milestones");
    expect(page).not.toContain("Add cards to your wishlist and portfolio to discover matches");
  });

  it("keeps generated activity private and owner-readable", () => {
    const db = source("src/lib/social/db.ts");
    const writer = db.slice(
      db.indexOf("export async function postActivity"),
      db.indexOf("export async function getCommunityFeed"),
    );
    expect(writer).toContain("false]");
    expect(writer).not.toContain("isPublic?: boolean");
    expect(writer).not.toContain("data?.isPublic === true");

    const publicActivityStart = db.indexOf("export async function getUserActivity");
    const publicActivity = db.slice(
      publicActivityStart,
      db.indexOf("// ══════════════════════════════════════════════════════════════\n// ACHIEVEMENTS"),
    );
    expect(publicActivity).toContain("if (!includePrivate)");
    expect(publicActivity).toContain("return []");
    expect(publicActivity).toContain("SELECT f.*");

    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain("getUserActivity(profile.user_id, 10, isOwn)");
  });

  it("keeps item-level intent and internal identifiers out of public profiles", () => {
    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain("const visibleWishlist = isOwn ? wishlist : []");
    expect(route).toContain("const visibleProfile = isOwn ? profile : {");
    expect(route).toContain("username: profile.username");
    expect(route).not.toContain("...rest");
    expect(route).toContain("rating: record.rating");
    expect(route).not.toContain("appeal_reason");
    expect(route).toContain("achievements: isOwn ? achievements : []");
  });

  it("keeps follower lists account-only", () => {
    const route = source("src/app/api/social/followers/route.ts");
    expect(route).toContain('if (!session?.user?.id)');
    expect(route).toContain("if (!isOwn)");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("does not infer offers from portfolios and wishlists", () => {
    const db = source("src/lib/social/db.ts");
    const matcher = db.slice(db.indexOf("export async function findTradeMatches"));
    expect(matcher).not.toContain("FROM portfolio_cards");
    expect(matcher).not.toContain("FROM wishlists");
    expect(matcher).toContain("return []");

    const route = source("src/app/api/social/matches/route.ts");
    expect(route).toContain("matching_available: false");
  });

  it("does not infer affinity through the historical bridge side door", () => {
    const route = source("src/app/api/v1/bridge/route.ts");
    expect(route).toContain('status: "paused"');
    expect(route).not.toContain("buildBridge");
    expect(route).not.toContain("query(");

    const compute = source("src/lib/bridge/compute.ts");
    expect(compute).toContain('"paused"');
    expect(compute).not.toContain('from "@/lib/db"');
    expect(compute).not.toContain("FROM portfolio_cards");
    expect(compute).not.toContain("FROM wishlist");
    expect(compute).not.toContain("FROM collective_members");
  });

  it("keeps exact money and raw adverse-event counts out of public commerce", () => {
    const route = source("src/app/api/u/[username]/commerce/route.ts");
    expect(route).not.toContain("totalVolumeGbp:");
    expect(route).not.toContain("disputes,");
    expect(route).not.toContain("disputes_against_seller");
    expect(route).not.toContain("disputeRate");
    expect(route).not.toContain("commissionRate:");
    expect(route).not.toContain("message: vacation.message");
    expect(route).not.toContain("trades_sold");
    expect(route).not.toContain("trades_bought");
    expect(route).not.toContain("auctions_sold");
    expect(route).not.toContain("TRUST_TIERS");

    const stats = source("src/lib/journey/public-stats.ts");
    expect(stats).not.toContain("reviewer_id");
  });

  it("publishes reviews only after an explicit reviewer choice", () => {
    const engine = source("src/lib/escrow/trust-engine.ts");
    expect(engine).toContain("data.isPublic === true");
    expect(engine).toContain("invalid_review_publication_notice");
    expect(engine).toContain("r.publication_notice_version=$3");
    expect(engine).toContain("r.published_at IS NOT NULL");

    const route = source("src/app/api/escrow/reviews/route.ts");
    expect(route).toContain("body.isPublic === true");

    const stats = source("src/lib/journey/public-stats.ts");
    expect(stats).toContain("is_public = true");
    expect(stats).not.toContain("external_reputation");

    expect(engine).toContain("includePrivate = false");

    const account = source("src/app/api/account/reviews/route.ts");
    expect(account).toContain("export async function PATCH");
    expect(account).toContain("r.publication_notice_version=$2");
    expect(account).toContain("reviewer_id=$2");
    expect(account).toContain("published_at=CASE");
    expect(account).toContain("THEN published_at");
  });

  it("uses a narrow query for every public trust mirror", () => {
    const publicTrust = source("src/lib/trust/public.ts");
    expect(publicTrust).toContain("u.is_public=TRUE");
    expect(publicTrust).toContain("u.profile_publication_notice_version=$2");
    expect(publicTrust).toContain("COALESCE(tp.is_suspended,FALSE)=FALSE");
    expect(publicTrust).toContain("published_at IS NOT NULL");
    expect(publicTrust).not.toContain("total_volume");
    expect(publicTrust).not.toContain("disputed_trades");
    expect(publicTrust).not.toContain("trade_limit");

    for (const path of [
      "src/app/api/v1/users/[username]/trust/route.ts",
      "src/app/api/v1/universal/users/[username]/trust/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain("loadPublishedTrustState");
      expect(route).toContain("no_cache: true");
      expect(route).toContain("LicenseRef-CambridgeTCG-Public-Display-Only");
      expect(route).not.toContain("loadUserTrustState");
      expect(route).not.toContain("total_volume_gbp");
      expect(route).not.toContain("largest_trade_gbp");
    }
  });

  it("derives new message recipients from public names or shared context", () => {
    const route = source("src/app/api/messages/conversations/route.ts");
    expect(route).toContain("resolveReferenceRecipient");
    expect(route).toContain("profile_publication_notice_version=$2");
    expect(route).toContain("A bare id can only reopen");

    const messages = source("src/lib/messages/db.ts");
    expect(messages).toContain("existing.rows.length > 0 || options.hasValidatedContext");
    expect(messages).toContain("recipient.messaging_notice_version");
    expect(messages).toContain("recipient.messaging_enabled_at");
    expect(messages).toContain("That reference belongs to a different counterparty");
  });

  it("pauses human rankings and card transaction aggregates", () => {
    const leaderboard = source("src/app/api/leaderboards/route.ts");
    expect(leaderboard).toContain('status: "paused"');
    expect(leaderboard).toContain("topSellers: []");
    expect(leaderboard).toContain("busiestSkus: []");
    expect(leaderboard).toContain("COMPLETED_TRADE_PUBLICATION");
    expect(leaderboard).not.toContain("market_trades");
    expect(leaderboard).not.toContain("JOIN users");
    expect(leaderboard).not.toContain("seller_id AS user_id");

    const leaderboardPage = source("src/app/leaderboards/page.tsx");
    expect(leaderboardPage).toContain("paused");
    expect(leaderboardPage).not.toContain("Top sellers");
    expect(leaderboardPage).not.toContain("Top buyers");

    const market = source("src/lib/market/db.ts");
    const book = market.slice(
      market.indexOf("export async function getCardOrderBook"),
      market.indexOf("export async function getMarketSummaries"),
    );
    expect(book).toContain("trade_aggregates: []");
    expect(book).toContain("COMPLETED_TRADE_PUBLICATION");
    expect(book).not.toContain("market_trades");
    expect(book).not.toContain("JOIN users");
    expect(book).not.toContain("seller_id");
  });

  it("pauses public collective counts and rosters without weakening steward access", () => {
    const collectives = source("src/lib/collectives/db.ts");
    const collectiveRead = collectives.slice(
      collectives.indexOf("export async function getCollectiveBySlug"),
      collectives.indexOf("export function getActiveMembers"),
    );
    expect(collectiveRead).toContain("CASE WHEN c.steward_user_id = $2 THEN");
    expect(collectiveRead).toContain("ELSE NULL");
    expect(collectiveRead).not.toContain("cm.visibility = 'public'");
    expect(collectiveRead).not.toContain("profile_publication_notice_version");
    expect(collectives).toContain("'steward', 'private'");
    expect(collectives).toContain("VALUES ($1, $2, $3, 'private'");
    expect(collectives).toContain("visibility = 'private'");

    const activeMembers = collectives.slice(
      collectives.indexOf("export function getActiveMembers"),
      collectives.indexOf("export async function getUserCollectives"),
    );
    expect(activeMembers).toContain("if (!viewerIsSteward) return []");
    expect(activeMembers).toContain("SELECT cm.collective_id, cm.user_id");
    expect(activeMembers).not.toContain("cm.visibility = 'public'");
    expect(activeMembers).not.toContain("profile_publication_notice_version");

    const publicPage = source("src/app/c/[slug]/page.tsx");
    expect(publicPage).not.toContain("getActiveMembers");
    expect(publicPage).not.toContain("collective.active_member_count");
    expect(publicPage).not.toContain("members.map");
    expect(publicPage).not.toContain("collective.steward_user_id");
    expect(publicPage).toContain("Member names and counts are not public");

    const managePage = source(
      "src/app/account/collectives/[slug]/manage/page.tsx",
    );
    expect(managePage).toContain("getActiveMembers(collective.id, true)");

    const methodology = source("src/app/methodology/collectives/page.tsx");
    expect(methodology).toContain("No public membership roster or count");
    expect(methodology).toContain("legacy setting, not a current publication receipt");
  });

  it("keeps the interactive auction page on the public projection", () => {
    const page = source("src/app/auctions/[id]/page.tsx");
    expect(page).toContain("projectAuctionForPublic");
    expect(page).toContain("auctionRecordIsPublic");
    expect(page).not.toContain("loadBidderTiers");

    const history = source("src/components/auction/BidHistory.tsx");
    expect(history).not.toContain("anonId");
    expect(history).not.toContain("user_id");
    expect(history).not.toContain("TrustTier");

    const manifest = source("src/lib/manifest.ts");
    const auctionClaim = manifest.slice(
      manifest.indexOf('{ id: "storefront.auction_mirror"'),
      manifest.indexOf('{ id: "storefront.trader_dashboard"'),
    );
    expect(auctionClaim).toContain("No bidder or winner identifier or trust field is published");
    expect(auctionClaim).not.toContain("anonymous bidder");
  });

  it("retires UUID-keyed counterparty dossiers", () => {
    const trust = source("src/app/api/escrow/trust/route.ts");
    expect(trust).toContain("UUID-keyed public trust lookup is unavailable");
    expect(trust).not.toContain("SELECT user_id, trust_score");

    const reviews = source("src/app/api/escrow/reviews/route.ts");
    expect(reviews).toContain("UUID-keyed review lookup is unavailable");
    expect(reviews).not.toContain("getUserReviews(userId)");

    const externalRep = source("src/app/api/escrow/external-rep/route.ts");
    expect(externalRep).toContain("if (userId !== session.user.id)");
    expect(externalRep).toContain("await requireAdmin()");
  });
});
