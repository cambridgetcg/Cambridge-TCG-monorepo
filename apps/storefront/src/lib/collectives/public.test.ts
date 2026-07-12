import { describe, expect, it } from "vitest";
import { COMMUNITY_ORGANISATION_SCHEMA } from "@cambridge-tcg/data-spec";
import { toPublicCollective } from "./public";
import { DIRECTORY_NOTICE_VERSION, type Collective } from "./types";

describe("public collective projection", () => {
  it("keeps organisation facts and drops internal people/roster keys", () => {
    const row: Collective = {
      id: "internal-uuid",
      slug: "cambridge-card-club",
      display_name: "Cambridge Card Club",
      kind: "club",
      region: "Cambridge, UK",
      languages: ["en"],
      games: ["pkm", "op"],
      description: "Weekly play.",
      house_rules: "Private working notes.",
      website_url: "https://example.org/",
      public_contact_url: "https://example.org/contact",
      accessibility_notes: "Step-free.",
      directory_listed: true,
      directory_listed_at: "2026-07-11T01:00:00.000Z",
      directory_notice_version: DIRECTORY_NOTICE_VERSION,
      directory_authority_attested_at: "2026-07-11T01:00:00.000Z",
      steward_user_id: "private-user-uuid",
      is_public: true,
      created_at: "2026-07-11T00:00:00.000Z",
      updated_at: "2026-07-11T00:00:00.000Z",
      active_member_count: 3,
    };

    const result = toPublicCollective(row);
    expect(result.profile_url).toBe("/c/cambridge-card-club");
    expect(result.games).toEqual(["pkm", "op"]);
    expect(result.verification_status).toBe("self_attested_unverified");
    expect(Object.keys(result).sort()).toEqual([
      "accessibility_notes",
      "correction_url",
      "created_at",
      "description",
      "display_name",
      "games",
      "is_public",
      "kind",
      "languages",
      "listed_at",
      "profile_url",
      "public_contact_url",
      "region",
      "rights",
      "slug",
      "updated_at",
      "verification_status",
      "website_url",
    ]);
    expect(() => toPublicCollective({
      ...row,
      directory_notice_version: "community-directory-v0-stale",
    })).toThrow("publication receipt");
    expect(() => toPublicCollective({
      ...row,
      website_url: "http://legacy-insecure.example.org",
    })).toThrow("website is invalid");
    expect(() => toPublicCollective({
      ...row,
      games: ["pkm", "PKM"],
    })).toThrow("contains duplicates");
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("steward_user_id");
    expect(result).not.toHaveProperty("house_rules");
    expect(result).not.toHaveProperty("active_member_count");
  });

  it("fails closed if a private row reaches the open projection", () => {
    const privateRow = {
      id: "internal-uuid",
      slug: "private-card-club",
      display_name: "Private Card Club",
      kind: "club" as const,
      region: null,
      languages: [],
      games: [],
      description: null,
      house_rules: null,
      website_url: null,
      public_contact_url: null,
      accessibility_notes: null,
      directory_listed: false,
      directory_listed_at: null,
      directory_notice_version: null,
      directory_authority_attested_at: null,
      steward_user_id: "private-user-uuid",
      is_public: false,
      created_at: "2026-07-11T00:00:00.000Z",
      updated_at: "2026-07-11T00:00:00.000Z",
      active_member_count: 1,
    };

    expect(() => toPublicCollective(privateRow)).toThrow("publication receipt");
  });

  it("publishes a schema with no internal people or working-note fields", () => {
    const properties = COMMUNITY_ORGANISATION_SCHEMA.properties;
    expect(properties).not.toHaveProperty("id");
    expect(properties).not.toHaveProperty("steward_user_id");
    expect(properties).not.toHaveProperty("house_rules");
    expect(properties).not.toHaveProperty("active_member_count");
    expect(properties).not.toHaveProperty("member_count_band");
    expect(properties.is_public).toEqual({ const: true });
  });
});
