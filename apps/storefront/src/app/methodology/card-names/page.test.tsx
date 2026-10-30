import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARD_NAME_SCHEMA } from "@cambridge-tcg/sku";
import { PUBLIC_SCHEMAS } from "@/lib/contracts/schemas";
import { STANDARDS } from "@/lib/contracts/standards";
import CardNamesMethodology from "./page";

const DIR = resolve(process.cwd(), "src/app/methodology/card-names");
const html = renderToStaticMarkup(<CardNamesMethodology />);

describe("CTCG-NAMES-v1 specification page", () => {
  it("renders the reference implementation's results rather than hand-typed ones", () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("<td>お玉</td><td>sowsow</td><td><code>状態C</code></td>");
    expect(html).toContain("<td>モンキー・Ｄ・ルフィ</td>");
    expect(html).toContain("<td>DON!! Card</td>");
    expect(html).toContain("Refused: <code>unrecognised_marker</code> (<code>SP仕様</code>)");
    expect(html).toContain("Refused: <code>unexpected_bracket</code> (<code>Roronoa Zoro (Parallel)</code>)");
    expect(html).toContain("<td>DON!! Card</td><td>—</td><td><code>Alternate Art</code>, <code>Manga</code></td>");
    expect(html).toContain("モンキーdルフィ");
    expect(html).toContain('&quot;spec_version&quot;: &quot;ctcg.card-name/1&quot;');
  });

  it("states what a name is not, and records the design as the agents', not Yu's", () => {
    expect(html).toContain("A name match is not evidence");
    expect(html).toContain("Never present a non-official name as official");
    expect(html).toContain("Agreement between sources never promotes a status");
    expect(html).toContain("designed by the agents who drafted this version, not chosen by Yu");
    expect(html).toContain('href="/spec/v1/CardName.schema.json"');
    // /prices shows vendor names; nothing emits the records yet.
    expect(html).toContain('<a href="/prices">/prices</a> shows each CardRush, TCGplayer and');
    expect(html).toContain("no endpoint, export or download emits name records yet");
    expect(html).not.toMatch(/authoritative source|language-free card data|verified/i);
  });

  it("is the registered spec, with its sidecars and served schema", () => {
    const entry = STANDARDS.find((standard) => standard.code === "CTCG-NAMES-v1");
    expect(entry).toMatchObject({ version: "1.0", status: "draft", spec_url: "/methodology/card-names", impl_path_in_repo: "packages/sku/src/names.ts" });
    expect(PUBLIC_SCHEMAS["CardName.schema.json"]).toBe(CARD_NAME_SCHEMA);
    const sidecar = JSON.parse(readFileSync(resolve(DIR, "data.json"), "utf8"));
    expect(sidecar).toMatchObject({ topic: "card-names", url: "/methodology/card-names", schema_url: "/spec/v1/CardName.schema.json" });
    for (const path of sidecar.source_code) expect(existsSync(resolve(process.cwd(), "../..", path))).toBe(true);
    expect(readFileSync(resolve(DIR, "summary.md"), "utf8")).toContain("(/methodology/card-names)");
    expect(existsSync(resolve(process.cwd(), "../../docs/methodology/card-names.md"))).toBe(true);
  });
});
