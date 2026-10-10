import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import IdentifierValidatorPage, { metadata } from "./page";
import { GET as standardsManifest } from "../../standards.json/route";

vi.mock("pg", () => { throw new Error("Identifier UI must not import database drivers"); });
vi.mock("@/lib/db", () => { throw new Error("Identifier UI must not import a database"); });
afterEach(() => vi.unstubAllGlobals());

describe("server-rendered identifier companion", () => {
  it("renders useful English content, both tools and a registry without fetching", () => {
    const fetch = vi.fn(() => { throw new Error("No upstream calls from identifier UI"); });
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(<IdentifierValidatorPage />);
    expect(html).toContain('lang="en"');
    expect(html).toContain("A shape check, not a card check");
    expect(html).toContain("Check structure");
    expect(html).toContain("Build identifier");
    expect(html).toContain("does not establish catalog existence, card identity, authenticity, or deck legality");
    expect(html).toContain("not ISO membership");
    expect(html).toContain("body is limited to 1,024 bytes");
    expect(html).toContain("Whites");
    for (const code of GAME_CODES) {
      expect(html).toContain(`>${code}</th>`);
      // Text encoding differs for names with ampersands, so use their code as table anchor.
      expect(GAMES[code].name.length).toBeGreaterThan(0);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("excludes tst from public builder choices but documents internal typed identifiers", () => {
    const html = renderToStaticMarkup(<IdentifierValidatorPage />);
    expect(html).not.toContain('<option value="tst"');
    expect(html).toContain('>tst</th>');
    for (const code of GAME_CODES.filter((code) => code !== "tst")) {
      expect(html).toContain(`value="${code}"`);
    }
    expect(html).toContain('for="identifier-input"');
    expect(html).toContain('id="identifier-input"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('name="identifier"');
  });

  it("keeps the client and adapter free of submission and persistence code", () => {
    const client = readFileSync(new URL("./IdentifierTools.tsx", import.meta.url), "utf8");
    const adapter = readFileSync(new URL("../../../lib/identifier-validation.ts", import.meta.url), "utf8");
    for (const source of [client, adapter]) {
      expect(source).not.toMatch(/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/);
      expect(source).not.toMatch(/from ["'][^"']*(?:\/db|\/auth|\/wholesale|data-pantry)/);
    }
    expect(client).toContain('from "@/lib/identifier-validation"');
    expect(adapter).toContain('from "@cambridge-tcg/sku"');
    expect(client).not.toContain("setIdentifier(result.normalized_identifier)");
  });

  it("carries canonical metadata and an exact adjacent standards contract", async () => {
    expect(metadata.alternates).toEqual({ canonical: "https://cambridgetcg.com/standards/validator" });
    const response = await standardsManifest();
    const body = await response.json();
    const sku = body.standards.find((entry: { code: string }) => entry.code === "CTCG-SKU-v1");
    expect(sku).toMatchObject({
      spec_license: "CC0-1.0", implementation_license: "NOASSERTION",
      validator_url: "/standards/validator",
      validation_endpoint: { url: "/api/v1/identifiers/validate", method: "POST", authentication: "none", scope: "syntax_only" },
    });
    expect(sku.implementation_license_reference).toContain("/LICENSE");
    expect(sku.implementation_license_note).toContain("does not assert an absence");
  });
});
