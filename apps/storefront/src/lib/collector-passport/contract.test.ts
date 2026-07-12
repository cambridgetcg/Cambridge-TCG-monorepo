import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Collector Passport privacy contract", () => {
  it("keeps every legacy showcase row private and records bounded receipts", () => {
    const sql = source("drizzle/0120_collector_passport.sql");
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("passport_public BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("passport_published_at TIMESTAMPTZ");
    expect(sql).toContain("passport_notice_version TEXT");
    expect(sql).toContain("showcase_cards_passport_receipt");
    expect(sql).toContain("collector_passport_publication_log");
    expect(sql).toContain("action IN ('published', 'withdrawn')");
    expect(sql).toContain("ON DELETE SET NULL");
    expect(sql).toContain("INTERVAL '180 days'");
    expect(sql).toContain("INTERVAL '2 years'");
    expect(sql).toContain("log_collector_passport_delete_withdrawal");
    expect(sql).toContain("BEFORE DELETE ON showcase_cards");
    expect(sql).not.toMatch(/UPDATE showcase_cards\s+SET passport_public/);
    expect(sql).not.toMatch(/public_label\s*=\s*(card_name|sku|set_name|caption)/i);
  });

  it("uses a narrow public query with current consent and no catalog join", () => {
    const db = source("src/lib/collector-passport/db.ts");
    const publicRead = db.slice(db.indexOf("export async function getPublishedPassport"));
    expect(publicRead).toContain("u.is_public = TRUE");
    expect(publicRead).toContain("COALESCE(tp.is_suspended, FALSE) = FALSE");
    expect(publicRead).toContain("s.passport_public = TRUE");
    expect(publicRead).toContain("s.passport_notice_version = $2");
    expect(publicRead).not.toContain("portfolio_cards");
    expect(publicRead).not.toContain("card_name");
    expect(publicRead).not.toContain("image_url");
    expect(publicRead).not.toContain("sku");
    expect(publicRead).not.toContain("fetchCard");
    expect(publicRead).not.toContain("wholesale");
  });

  it("serializes publication, caps it, rotates ids, and persists exact order", () => {
    const db = source("src/lib/collector-passport/db.ts");
    const publish = db.slice(
      db.indexOf("export async function publishPassportItem"),
      db.indexOf("export async function withdrawPassportItem"),
    );
    expect(publish).toContain("WHERE u.id = $1");
    expect(publish).toContain("FOR UPDATE OF u");
    expect(publish).toContain("is_suspended");
    expect(publish).toContain("COLLECTOR_PASSPORT_MAX_PUBLISHED");
    expect(publish).toContain("ELSE gen_random_uuid()");
    expect(publish).toContain("collector_passport_publication_log");

    const reorder = db.slice(
      db.indexOf("export async function reorderPassportDrafts"),
      db.indexOf("export async function getPublishedPassport"),
    );
    expect(reorder).toContain("FOR UPDATE");
    expect(reorder).toContain("WITH ORDINALITY");
    expect(reorder).toContain("showcase.user_id = $1");
  });

  it("withdraws every item atomically when the profile becomes private", () => {
    const social = source("src/lib/social/db.ts");
    const update = social.slice(
      social.indexOf("export async function updateProfile"),
      social.indexOf("// ══════════════════════════════════════════════════════════════\n// SHOWCASE"),
    );
    expect(update).toContain("transaction(async (tx)");
    expect(update).toContain("data.isPublic === false");
    expect(update).toContain("'withdrawn'");
    expect(update).toContain("passport_public = FALSE");
    expect(update).toContain("passport_published_at = NULL");
    expect(update).toContain("passport_notice_version = NULL");
  });

  it("records one authenticated showcase-removal receipt before the fallback trigger", () => {
    const social = source("src/lib/social/db.ts");
    const remove = social.slice(
      social.indexOf("export async function removeFromShowcase"),
      social.indexOf("// ══════════════════════════════════════════════════════════════\n// WISHLISTS"),
    );
    expect(remove).toContain("INSERT INTO collector_passport_publication_log");
    expect(remove).toContain("SET passport_public=FALSE");
    expect(remove.indexOf("SET passport_public=FALSE")).toBeLessThan(remove.indexOf("DELETE FROM showcase_cards"));
    const sql = source("drizzle/0120_collector_passport.sql");
    const trigger = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION log_collector_passport_delete_withdrawal"));
    expect(trigger).toContain("NULL,");
  });

  it("records an actor-bearing withdrawal before portfolio cascade deletion", () => {
    const portfolio = source("src/lib/portfolio/db.ts");
    const remove = portfolio.slice(
      portfolio.indexOf("export async function removeCard"),
      portfolio.indexOf("export async function getUserCards"),
    );
    expect(remove).toContain("INSERT INTO collector_passport_publication_log");
    expect(remove).toContain("SET passport_public=FALSE");
    expect(remove.indexOf("SET passport_public=FALSE")).toBeLessThan(remove.indexOf("DELETE FROM portfolio_cards"));
  });

  it("keeps owner drafts out of the legacy public profile response", () => {
    const route = source("src/app/api/social/profile/route.ts");
    expect(route).toContain("isOwn ? getShowcase(profile.user_id) : Promise.resolve([])");
    expect(route).toContain("const visibleShowcase = isOwn ? showcase : []");
    expect(route).not.toContain("sku: card.sku");
    expect(route).not.toContain("image_url: card.image_url");
  });

  it("serves exact-handle Passports no-store and noindex", () => {
    const route = source("src/app/api/v1/collectors/[username]/passport/route.ts");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).toContain('"X-Robots-Tag": "noindex, nofollow, noarchive"');
    expect(route).toContain('"X-Content-License": "NOASSERTION"');
    expect(route).toContain("Collector Passport not found.");
  });

  it("renders only the safe Passport DTO on the public profile", () => {
    const page = source("src/app/u/[username]/page.tsx");
    const section = page.slice(
      page.indexOf("{/* Collector Passport:"),
      page.indexOf("{/* Want List */"),
    );
    expect(section).toContain("item.label");
    expect(section).toContain("item.story");
    expect(section).not.toContain("image_url");
    expect(section).not.toContain("card_name");
    expect(section).not.toContain("sku");
  });
});
