import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The site serves the brand kit's web files from public/. The kit in
// marketing/kit is built by the artcraft-brand skill and never hand-edited,
// so a rebuild changes it there first; these checks catch a copy left behind.
const app = join(dirname(fileURLToPath(import.meta.url)), "../..");
const kitWeb = join(app, "marketing/kit/web");
const pub = join(app, "public");
const SERVED = [
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "site.webmanifest",
  "og.jpg",
];

describe("brand kit served from public/", () => {
  it.each(SERVED)("public/%s matches marketing/kit/web", (name) => {
    expect(readFileSync(join(pub, name)).equals(readFileSync(join(kitWeb, name)))).toBe(true);
  });

  it("serves every icon the manifest names", () => {
    const manifest = JSON.parse(readFileSync(join(pub, "site.webmanifest"), "utf8"));
    for (const icon of manifest.icons) {
      expect(SERVED).toContain(icon.src.replace(/^\//, ""));
    }
  });

  it("draws the nav mark with the kit's paths", () => {
    const nav = readFileSync(join(app, "src/components/layout/Nav.tsx"), "utf8");
    const mark = readFileSync(join(app, "marketing/cambridge-tcg-mark-nav.svg"), "utf8");
    const paths = [...mark.matchAll(/ d="([^"]+)"/g)].map((match) => match[1]);
    expect(paths).toHaveLength(3);
    for (const d of paths) expect(nav).toContain(`d="${d}"`);
    expect(nav).toContain(`viewBox="${/viewBox="([^"]+)"/.exec(mark)?.[1]}"`);
  });
});

// Next.js merges metadata shallowly: a page that sets `openGraph` replaces the
// layout's, image included. Every such block names SHARE_CARD, as its image or
// as the fallback when the page has no image of its own (card images are
// often withheld, so "its own image" alone can resolve to none).
describe("share card on pages with their own openGraph", () => {
  const appDir = join(app, "src/app");
  const sources = (readdirSync(appDir, { recursive: true }) as string[])
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(appDir, name));

  // Every `openGraph:` value: a block over several lines (to its closing
  // brace), or the rest of the line (a one-line block, a fixedShareCard()
  // call, anything else). Anything else fails the check below rather than
  // escaping it.
  function openGraphBlocks(source: string): string[] {
    const blocks: string[] = [];
    for (const match of source.matchAll(/^([ \t]*)openGraph:(.*)$/gm)) {
      if (match[2].trim() !== "{") {
        blocks.push(match[0]);
        continue;
      }
      const end = source.indexOf(`\n${match[1]}},`, match.index);
      blocks.push(source.slice(match.index, end < 0 ? undefined : end));
    }
    return blocks;
  }

  it("finds the pages it checks", () => {
    expect(sources.filter((file) => openGraphBlocks(readFileSync(file, "utf8")).length).length).toBeGreaterThan(5);
  });

  it("gives every openGraph block the share card", () => {
    const missing = sources.flatMap((file) =>
      openGraphBlocks(readFileSync(file, "utf8"))
        .filter((block) => !/\bimages\s*:[^\n]*\bSHARE_CARD\b/.test(block) && !/\bfixedShareCard\(/.test(block))
        .map(() => relative(app, file)),
    );
    expect(missing).toEqual([]);
  });
});
