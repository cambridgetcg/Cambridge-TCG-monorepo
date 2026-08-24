import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../drizzle/0131_collective_directory_publication.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("collective directory publication migration", () => {
  it("adds a separate nullable receipt without opting legacy profiles in", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS directory_publication_at TIMESTAMPTZ",
    );
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS directory_publication_version TEXT",
    );
    expect(migration).not.toMatch(/UPDATE\s+collectives/i);
    expect(migration).not.toMatch(/DEFAULT\s+['\"]?community-directory-v1/i);
  });

  it("requires a complete receipt and a public profile", () => {
    expect(migration).toContain("is_public = TRUE");
    expect(migration).toContain("directory_publication_at IS NOT NULL");
    expect(migration).toContain("directory_publication_version IS NOT NULL");
  });

  it("bounds every newly listed public response at the database boundary", () => {
    expect(migration).toContain(
      "collectives_directory_publication_field_bounds",
    );
    expect(migration).toContain(
      "ct_collective_directory_languages_bounded(languages)",
    );
    expect(migration).toContain("cardinality(values_to_check) <= 12");
    expect(migration).toContain("WHERE language IS NULL");
    expect(migration).toContain("octet_length(description)");
    expect(migration).toContain("octet_length(house_rules)");
    expect(migration).toContain("NOT VALID");
  });
});
