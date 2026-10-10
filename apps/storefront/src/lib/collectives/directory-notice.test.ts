import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_PUBLICATION_NOTICE,
  DIRECTORY_PUBLICATION_VERSION,
} from "./directory-contract";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("organisation directory publication notice", () => {
  it("binds the material public-reach wording to a fresh receipt version", () => {
    expect(DIRECTORY_PUBLICATION_VERSION).toBe("community-directory-v2");
    expect(DIRECTORY_PUBLICATION_NOTICE.publication).toContain("public HTML");
    expect(DIRECTORY_PUBLICATION_NOTICE.publication).toContain(
      "public JSON API",
    );
    expect(DIRECTORY_PUBLICATION_NOTICE.publication).toContain("searchable");
    expect(DIRECTORY_PUBLICATION_NOTICE.exposure).toContain("Search engines");
    expect(DIRECTORY_PUBLICATION_NOTICE.exposure).toContain("AI crawlers");
    expect(DIRECTORY_PUBLICATION_NOTICE.exposure).toContain("redistribute");
    expect(DIRECTORY_PUBLICATION_NOTICE.withdrawal).toContain(
      "leaves the public profile visible",
    );
    expect(DIRECTORY_PUBLICATION_NOTICE.withdrawal).toContain(
      "cannot recall copies",
    );
    expect(DIRECTORY_PUBLICATION_NOTICE.data_discipline).toContain(
      "Do not include personal data about another person",
    );
    expect(DIRECTORY_PUBLICATION_NOTICE.correction).toContain(
      "support@cambridgetcg.com",
    );
  });

  it("renders every immutable notice part beside both directory checkboxes", () => {
    for (const path of [
      "src/app/account/collectives/new/page.tsx",
      "src/app/account/collectives/[slug]/manage/_client.tsx",
    ]) {
      const form = source(path);
      expect(form, path).toContain('name="directory_listed"');
      expect(form, path).toContain('name="directory_publication_version"');
      for (const key of [
        "publication",
        "exposure",
        "withdrawal",
        "data_discipline",
        "correction",
      ]) {
        expect(form, `${path}:${key}`).toContain(
          `DIRECTORY_PUBLICATION_NOTICE.${key}`,
        );
      }
    }
  });

  it("keeps Cambridge responsibility and correction routes on public surfaces", () => {
    const api = source("src/app/api/v1/directory/organisations/route.ts");
    const methodology = source(
      "src/app/methodology/community-directory/page.tsx",
    );
    const summary = source(
      "src/app/methodology/community-directory/summary.md",
    );

    expect(api).toContain("Cambridge TCG remains responsible");
    expect(api).toContain("Search engines, AI crawlers");
    expect(api).toContain("support@cambridgetcg.com");
    expect(api).not.toMatch(/steward['’]s publication responsibility/i);
    expect(api).not.toContain("without permission");
    expect(methodology).toContain("Public reach, indexing and copies");
    expect(methodology).toContain("Earlier v1 receipts are not current");
    expect(summary).toContain("indexed, copied or redistributed");
  });
});
