import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("organisation directory publication contract", () => {
  it("has an atomic, versioned publication receipt with expiring actor identity", () => {
    const sql = source("drizzle/0118_collective_directory.sql");
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("directory_listed BOOLEAN NOT NULL DEFAULT FALSE");
    expect(sql).toContain("directory_notice_version TEXT");
    expect(sql).toContain("directory_authority_attested_at TIMESTAMPTZ");
    expect(sql).toContain("collective_directory_publication_log");
    expect(sql).toContain("action IN ('listed', 'unlisted')");
    expect(sql).toContain("collective_slug TEXT NOT NULL");
    expect(sql).not.toContain("ON DELETE CASCADE");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("collectives_steward_limit");
  });

  it("uses one dedicated transition instead of the generic profile editor", () => {
    const db = source("src/lib/collectives/db.ts");
    const generic = db.slice(
      db.indexOf("export async function updateCollective("),
      db.indexOf("export async function setDirectoryPublication("),
    );
    expect(generic).not.toContain("directory_listed");

    const transition = db.slice(db.indexOf("export async function setDirectoryPublication("));
    expect(transition).toContain("FOR UPDATE");
    expect(transition).toContain("directory_notice_version");
    expect(transition).toContain("collective_directory_publication_log");
    expect(transition).toContain("directory_requires_public_profile");
  });

  it("does not treat a pending invitation as private-profile access", () => {
    const db = source("src/lib/collectives/db.ts");
    const gate = db.slice(
      db.indexOf("if (!row.is_public)"),
      db.indexOf("return shape(row)"),
    );
    expect(gate).toContain("consent_at IS NOT NULL");
    expect(gate).toContain("left_at IS NULL");
  });

  it("bounds creation and listing while leaving withdrawal available", () => {
    const actions = source("src/app/account/collectives/_actions.ts");
    expect(actions).toContain('action: "collective-create"');
    expect(actions).toContain('action: "collective-directory-list"');
    expect(actions).toContain("MAX_STEWARDED_COLLECTIVES = 10");
    const publication = actions.slice(
      actions.indexOf("export async function setDirectoryPublicationAction("),
      actions.indexOf("// ── Members"),
    );
    expect(publication).toContain("if (listed)");
    expect(publication).not.toContain("if (!listed) {");
  });

  it("selects only current directory receipts and no roster keys", () => {
    const db = source("src/lib/collectives/db.ts");
    const listing = db.slice(
      db.indexOf("export async function listPublicCollectives("),
      db.indexOf("// ── Write"),
    );
    expect(listing).toContain("c.directory_listed = TRUE");
    expect(listing).toContain("c.directory_notice_version = $1");
    expect(listing).not.toContain("c.steward_user_id");
    expect(listing).not.toContain("c.house_rules");
    expect(listing).not.toContain("collective_members");
  });

  it("serves publication data without shared caching", () => {
    for (const path of [
      "src/app/api/v1/directory/organisations/route.ts",
      "src/app/api/v1/directory/organisations/[slug]/route.ts",
    ]) {
      expect(source(path)).toContain("no_cache: true");
    }
  });

  it("keeps listing records out of search and training discovery", () => {
    const page = source("src/app/community/directory/page.tsx");
    expect(page).toContain("index: false");
    expect(page).toContain("noarchive: true");

    const sitemap = source("src/app/sitemap.ts");
    expect(sitemap).not.toContain("`${baseUrl}/community/directory`");
    expect(sitemap).toContain("`${baseUrl}/methodology/community-directory`");
    expect(sitemap).toContain("`${baseUrl}/licenses/community-directory-public-display-v1`");

    const robots = source("src/app/robots.txt/route.ts");
    expect(robots.match(/Disallow: \/community\/directory/g)).toHaveLength(2);
    expect(robots.match(/Disallow: \/api\/v1\/directory\/organisations/g)).toHaveLength(2);
    expect(robots).not.toContain("Disallow: /methodology/community-directory");
    expect(robots).not.toContain("Disallow: /licenses/community-directory-public-display-v1");
  });

  it("marks submitted organisation links as untrusted user content", () => {
    const profile = source("src/app/c/[slug]/page.tsx");
    expect(profile.match(/rel="ugc nofollow noopener noreferrer"/g)).toHaveLength(2);
  });
});
