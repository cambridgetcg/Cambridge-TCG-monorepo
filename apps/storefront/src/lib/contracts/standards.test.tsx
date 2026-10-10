import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CODES } from "@cambridge-tcg/sku";
import { GET } from "@/app/standards.json/route";
import StandardsPage from "@/app/standards/page";
import { PUBLIC_GAME_CODE_COUNT, STANDARDS, STANDARDS_LINKS, standardsManifest } from "./standards";

vi.mock("pg", () => { throw new Error("Standards must not import a database driver"); });
vi.mock("@/lib/db", () => { throw new Error("Standards must not read a database"); });
afterEach(() => vi.unstubAllGlobals());

describe("shared standards registry", () => {
  it("preserves the existing manifest keys, three IDs, versions and statuses", async () => {
    const response = GET();
    const body = await response.json();
    expect(body).toMatchObject({
      spec_version: "1",
      distributor: { name: "Cambridge TCG", license: "CC0-1.0", license_path: "docs/STANDARDS-LICENSE.md" },
      counts: { total: 3, frozen: 1, draft: 1, implemented: 1, planned: 0 },
      adoption: { requires_attribution: false, requires_license_acceptance: false, requires_account: false, registry_status: "empty" },
      self_reference: { this_endpoint: "/standards.json", human_readable_sibling: "/standards", contains_self: true },
      what_is_not_yet_shipped: expect.any(Array),
    });
    expect(body.standards.map(({ code, version, status }: { code: string; version: string; status: string }) => [code, version, status])).toEqual([
      ["CTCG-SKU-v1", "1.0", "frozen"],
      ["CTCG-PRICING-v1", "1.0", "draft"],
      ["CTCG-UNIVERSAL-v1", "1.0", "implemented"],
    ]);
    expect(body.standards).toEqual(STANDARDS);
    expect(Number.isFinite(Date.parse(body.generated_at))).toBe(true);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=900");
  });

  it("describes registry scope without probing runtime data or providers", () => {
    const fetch = vi.fn(() => { throw new Error("No provider calls from standards"); });
    vi.stubGlobal("fetch", fetch);
    const body = standardsManifest("2026-09-29T00:00:00.000Z");
    expect(body.generated_at).toBe("2026-09-29T00:00:00.000Z");
    expect(PUBLIC_GAME_CODE_COUNT).toBe(GAME_CODES.filter((code) => code !== "tst").length);
    expect(body.registry_summary).toEqual({ public_game_codes: PUBLIC_GAME_CODE_COUNT, scope: "registry_only", live_coverage_checked: false });
    expect(body.standards[0].validation_endpoint?.scope).toBe("syntax_only");
    expect(JSON.stringify(body)).not.toMatch(/currently have catalog rows|authoritative source|language-free card data/i);
    renderToStaticMarkup(<StandardsPage />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps specification, implementation and upstream-content rights distinct", () => {
    const body = standardsManifest();
    expect(body.distributor.license_scope).toContain("Specification text only");
    expect(body.adoption.scope).toContain("do not grant API access or data and image reuse rights");
    for (const standard of body.standards.filter((entry) => entry.impl_path_in_repo)) {
      expect(standard.spec_license).toBe("CC0-1.0");
      expect(standard.implementation_license).toBe("NOASSERTION");
      expect(standard.implementation_license_reference).toContain("/LICENSE");
      expect(standard.implementation_license_note).toContain("does not assert an absence");
      expect(standard.implementation_license_note).toContain("The repository is currently private and no packages are published");
    }
  });

  it("renders the same standards with a single main heading and useful discovery links", () => {
    const html = renderToStaticMarkup(<StandardsPage />);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('lang="en"');
    for (const standard of STANDARDS) {
      expect(html).toContain(`id="${standard.code}"`);
      expect(html).toContain(`href="${standard.spec_url}"`);
      expect(html).toContain(`v${standard.version} · ${standard.status}`);
      if (standard.impl_path_in_repo) expect(html).toContain(standard.impl_path_in_repo);
    }
    for (const href of Object.values(STANDARDS_LINKS)) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('href="/api/v1/universal/card/[sku]"');
    expect(html).not.toMatch(/publicly inspectable|currently have catalog rows|authoritative source|Sign up/i);
  });

  it("points specification and implementation references to existing repository paths", () => {
    const root = resolve(process.cwd(), "../..");
    for (const standard of STANDARDS) {
      expect(existsSync(resolve(root, standard.spec_path_in_repo))).toBe(true);
      if (standard.impl_path_in_repo) expect(existsSync(resolve(root, standard.impl_path_in_repo))).toBe(true);
      expect(existsSync(resolve(process.cwd(), "src/app", standard.spec_url.slice(1), "page.tsx"))).toBe(true);
    }
  });
});
