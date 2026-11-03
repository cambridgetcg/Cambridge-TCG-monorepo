/**
 * What `shopify app deploy` and `shopify app build` bundle from the theme app
 * extension. The CLI takes every file one folder down and stops with "Your
 * theme app extension includes files in an unsupported directory" when a file
 * sits outside assets/, blocks/, locales/ or snippets/ and .shopifyignore
 * doesn't exclude it.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const EXTENSION = path.resolve(__dirname, "../../../extensions/theme-app-extension-rewardspro");
const SHOPIFY_FOLDERS = ["assets", "blocks", "locales", "snippets"];
const read = (file: string) => fs.readFileSync(path.join(EXTENSION, file), "utf8");
const list = (dir: string) => fs.readdirSync(path.join(EXTENSION, dir));

/**
 * Raffles and mystery boxes are paused (CHANCE_MECHANICS_PAUSED), and
 * gift cards need the write_gift_cards scope the app doesn't request, so
 * the theme editor must not offer their blocks.
 */
const PAUSED = [
  { block: "raffles", assets: ["raffles.js", "raffles.css"] },
  { block: "mystery_boxes", assets: ["mystery-boxes-widget.js", "mystery-boxes-widget.css"] },
  { block: "gift_cards", assets: ["gift-cards.js", "gift-cards.css"] },
];

const ignored = () => {
  const file = path.join(EXTENSION, ".shopifyignore");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
};

describe("theme app extension bundle", () => {
  const folders = fs.readdirSync(EXTENSION, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !SHOPIFY_FOLDERS.includes(name));

  it.each(folders)("%s/ is left out of the Shopify bundle", (folder) => {
    expect(ignored()).toContain(`${folder}/**`);
  });
});

describe("blocks the theme editor offers", () => {
  it.each(PAUSED)("offers no $block block, and ships none of its assets", ({ block, assets }) => {
    expect(list("blocks")).not.toContain(`${block}.liquid`);
    for (const asset of assets) expect(list("assets")).not.toContain(asset);
  });

  it("names only blocks that exist in shopify.extension.toml", () => {
    const modules = [...read("shopify.extension.toml").matchAll(/module = "\.\/blocks\/([^"]+)"/g)]
      .map((match) => match[1]);
    expect(modules.sort()).toEqual(list("blocks").sort());
  });
});

describe("storefront scripts", () => {
  const blocks = list("blocks");

  it.each(blocks)("%s loads its widget through rp-widget-loader.js", (block) => {
    const source = read(`blocks/${block}`);
    expect(source).toContain('"javascript": "rp-widget-loader.js"');
    const runtimes = [...source.matchAll(/data-rp-widget-src="\{\{ '([^']+)' \| asset_url \}\}"/g)]
      .map((match) => match[1]);
    expect(runtimes.length).toBeGreaterThan(0);
    for (const runtime of runtimes) expect(list("assets")).toContain(runtime);
  });

  it("rp-widget-loader.js loads only runtimes that ship", () => {
    const runtimes = [...read("assets/rp-widget-loader.js").matchAll(/runtime: '([^']+)'/g)]
      .map((match) => match[1]);
    expect(runtimes.length).toBeGreaterThan(0);
    for (const runtime of runtimes) expect(list("assets")).toContain(runtime);
  });

  it.each([...blocks.map((f) => `blocks/${f}`), ...list("snippets").map((f) => `snippets/${f}`)])(
    "%s adds no parser-blocking <script>",
    (file) => {
      const tags = read(file).match(/<script\b[^>]*>/gi) ?? [];
      for (const tag of tags) expect(tag, file).toMatch(/\b(defer|async)\b/);
    },
  );
});
