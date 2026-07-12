import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("community privacy contract", () => {
  it("makes person-facing defaults private and resets unsupported old defaults", () => {
    const sql = source("drizzle/0117_privacy_defaults.sql");
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS privacy_publication_reset_20260711");
    expect(sql).toContain("previous_value TEXT NOT NULL");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("ALTER TABLE trade_reviews\n  ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN accepts_messages SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("ALTER COLUMN visibility SET DEFAULT 'private'");
    expect(sql).toContain("ALTER COLUMN is_public SET DEFAULT FALSE");
    expect(sql).toContain("trade_review_public");
    expect(sql).toContain("UPDATE trade_reviews SET is_public = FALSE");
    expect(sql).toContain("UPDATE users SET is_public = FALSE");
  });

  it("requires publication and disables shared caching on public person routes", () => {
    for (const path of [
      "src/app/api/u/[username]/activity/route.ts",
      "src/app/api/u/[username]/commerce/route.ts",
    ]) {
      const route = source(path);
      expect(route).toContain("u.is_public = TRUE");
      expect(route).toContain("COALESCE(tp.is_suspended, FALSE) = FALSE");
      expect(route).toContain('"Cache-Control": "private, no-store"');
    }
  });

  it("does not advertise person records to crawlers", () => {
    const robots = source("src/app/robots.txt/route.ts");
    for (const path of [
      "/u/",
      "/api/social/profile",
      "/api/v1/users/",
      "/api/v1/universal/users/",
    ]) {
      expect(robots.match(new RegExp(`Disallow: ${path.replaceAll("/", "\\/")}`, "g"))).toHaveLength(2);
    }
  });

  it("does not confirm that a private profile exists", () => {
    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain('{ error: "User not found." }');
    expect(route).toContain('{ status: 404, headers: PERSON_HEADERS }');
    expect(route).not.toContain("profile: { user_id: profile.user_id");
  });

  it("hides suspended profiles while preserving owner access", () => {
    const db = source("src/lib/social/db.ts");
    const profileLookup = db.slice(
      db.indexOf("export async function getPublicProfile"),
      db.indexOf("export async function updateProfile"),
    );
    expect(profileLookup).toContain("LEFT JOIN trust_profiles tp");
    expect(profileLookup).toContain("COALESCE(tp.is_suspended,FALSE)=FALSE");
    expect(profileLookup).toContain("OR u.id::text=$2");

    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain("getPublicProfile(targetId, session?.user?.id)");
  });

  it("removes private and suspended authors from the feed", () => {
    const db = source("src/lib/social/db.ts");
    expect(db).toContain("u.is_public=TRUE");
    expect(db).toContain("COALESCE(tp.is_suspended,FALSE)=FALSE");
    expect(db).toContain("FROM user_blocks b");
    const publicFeed = db.slice(
      db.indexOf("export async function getCommunityFeed"),
      db.indexOf("export async function getUserActivity"),
    );
    expect(publicFeed).toContain("SELECT f.event_type, f.title, f.description");
    expect(publicFeed).not.toContain("SELECT f.*");

    const route = source("src/app/api/social/feed/route.ts");
    expect(route).toContain("Historical bulk activity paging is unavailable");
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });

  it("requires an explicit act before publishing activity", () => {
    const db = source("src/lib/social/db.ts");
    expect(db).toContain("data?.isPublic === true");
    expect(db).toContain('includePrivate ? "" : "AND f.is_public=TRUE"');

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

  it("treats suspension as an account-wide messaging boundary", () => {
    const messages = source("src/lib/messages/db.ts");
    const guard = messages.slice(
      messages.indexOf("export async function assertCanMessage"),
      messages.indexOf("// ── Trade-context references"),
    );
    expect(guard).toContain("LEFT JOIN trust_profiles tp");
    expect(guard).toContain("sender.is_suspended");
    expect(guard).toContain("recipient.is_suspended");
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
  });

  it("publishes reviews only after an explicit reviewer choice", () => {
    const engine = source("src/lib/escrow/trust-engine.ts");
    expect(engine).toContain("data.isPublic === true");

    const route = source("src/app/api/escrow/reviews/route.ts");
    expect(route).toContain("body.isPublic === true");

    const stats = source("src/lib/journey/public-stats.ts");
    expect(stats).toContain("is_public = true");
    expect(stats).not.toContain("external_reputation");

    const reviews = source("src/lib/escrow/trust-engine.ts");
    expect(reviews).toContain("CASE WHEN $2::boolean OR (");
    expect(reviews).toContain("COALESCE(reviewer_tp.is_suspended, FALSE) = FALSE");
    expect(reviews).toContain("includePrivate = false");
  });

  it("uses a narrow query for every public trust mirror", () => {
    const publicTrust = source("src/lib/trust/public.ts");
    expect(publicTrust).toContain("u.is_public=TRUE");
    expect(publicTrust).toContain("COALESCE(tp.is_suspended,FALSE)=FALSE");
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
      expect(route).toContain('license: "NOASSERTION"');
      expect(route).not.toContain("LicenseRef-CambridgeTCG-Public-Display-Only");
      expect(route).not.toContain("loadUserTrustState");
      expect(route).not.toContain("total_volume_gbp");
      expect(route).not.toContain("largest_trade_gbp");
    }
    const structural = source("src/app/api/v1/universal/users/[username]/trust/route.ts");
    for (const field of [
      '"@encoding"',
      '"@kind"',
      '"@content_hash"',
      '"@self_hash"',
      '"@retrieved_at"',
      "_note_opaque",
      "_links",
    ]) {
      expect(structural).toContain(field);
    }
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
