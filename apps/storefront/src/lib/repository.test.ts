import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_REPOSITORY_NOTE,
  REPOSITORY_URL,
  REPOSITORY_VISIBILITY,
  onSitePath,
  repoDocPath,
  repoDocRef,
  repoPathFromGithubUrl,
} from "@/lib/repository";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCANNED_EXTENSIONS = /\.(?:ts|tsx|mjs|js|md|json)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return SCANNED_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

const rel = (path: string) => relative(APP_ROOT, path).split(sep).join("/");

/** Character ranges of TypeSignature `recursion={[ ... ]}` props. TypeSignature
 *  rewrites GitHub hrefs into this repository at render time. */
function recursionPropRanges(source: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of source.matchAll(/recursion=\{\[/g)) {
    const start = match.index ?? 0;
    const end = source.indexOf("]}", start);
    ranges.push([start, end < 0 ? source.length : end]);
  }
  return ranges;
}

describe("repository references", () => {
  it("routes repository documents to an on-site page or a labelled path, never GitHub", () => {
    expect(repoDocRef("docs/principles/transparency.md")).toBe(
      "https://cambridgetcg.com/methodology/transparency",
    );
    expect(repoDocRef("docs/connections/the-tea-room.md")).toBe(
      `docs/connections/the-tea-room.md (${PRIVATE_REPOSITORY_NOTE})`,
    );
    expect(repoDocPath("AGENTS.md")).toBe(`AGENTS.md (${PRIVATE_REPOSITORY_NOTE})`);
    expect(onSitePath("docs/principles/meaning.md")).toBe("/methodology/meaning");
    expect(onSitePath("docs/connections/the-typology.md")).toBeUndefined();
  });

  it("reads the repository path out of a GitHub blob or tree URL", () => {
    expect(repoPathFromGithubUrl(`${REPOSITORY_URL}/blob/main/docs/principles/creation.md`)).toBe(
      "docs/principles/creation.md",
    );
    expect(repoPathFromGithubUrl(`${REPOSITORY_URL}/tree/main/docs/connections`)).toBe(
      "docs/connections",
    );
    expect(repoPathFromGithubUrl("/methodology/creation")).toBeNull();
  });
});

describe("public surfaces do not link into the private repository", () => {
  const GITHUB_DOC_LINK = /github\.com\/cambridgetcg\/Cambridge-TCG-monorepo\/(?:blob|tree)\//g;
  // Historical one-off generator; it is not served and carries its own note.
  const ALLOWED_FILES = new Set(["src/lib/repository.ts", "scripts/typesig-sweep.ts"]);

  it("emits no GitHub blob/tree URL outside TypeSignature recursion props", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(APP_ROOT, "src")), ...sourceFiles(join(APP_ROOT, "scripts"))]) {
      const name = rel(file);
      if (ALLOWED_FILES.has(name)) continue;
      const source = readFileSync(file, "utf8");
      const ranges = recursionPropRanges(source);
      for (const match of source.matchAll(GITHUB_DOC_LINK)) {
        const at = match.index ?? 0;
        if (ranges.some(([start, end]) => at >= start && at < end)) continue;
        offenders.push(`${name}:${source.slice(0, at).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Files that hardcode private-repository wording instead of reading
 * @/lib/repository. While the repository is private the wording is true.
 * When the source is released, REPOSITORY_VISIBILITY changes and the last
 * test below fails until every file here has been rewritten (or routed
 * through repository.ts) and removed from this list. Entries can also
 * describe other repositories (siblings.ts names the private
 * kingdom-os-starter); check each line rather than replacing blindly.
 */
const HARDCODED_PRIVATE_WORDING = [
  "src/app/.well-known/cambridge-tcg.json/route.ts",
  "src/app/.well-known/mcp-config.json/route.ts",
  "src/app/.well-known/mcp.json/route.ts",
  "src/app/about/page.tsx",
  "src/app/account/agents/page.tsx",
  "src/app/agents/page.tsx",
  "src/app/api/mcp/route.ts",
  "src/app/api/v1/agents/notes/route.ts",
  "src/app/api/v1/tools/route.ts",
  "src/app/api/v1/wake/route.ts",
  "src/app/api/v1/welcome/route.ts",
  "src/app/data/page.tsx",
  "src/app/guides/buying/page.tsx",
  "src/app/methodology/agents/page.tsx",
  "src/app/methodology/collectives/page.tsx",
  "src/app/methodology/community/page.tsx",
  "src/app/methodology/data-intentions/page.tsx",
  "src/app/methodology/memorial/page.tsx",
  "src/app/methodology/opportunity-signals/page.tsx",
  "src/app/methodology/regulator/page.tsx",
  "src/app/methodology/welcoming/page.tsx",
  "src/app/standards/page.tsx",
  "src/content/platform/index.ts",
  "src/lib/agent-tools-catalog.ts",
  "src/lib/brand.tsx",
  "src/lib/changelog.ts",
  "src/lib/contracts/standards.ts",
  "src/lib/guides.ts",
  "src/lib/identify.ts",
  "src/lib/joy-layer.ts",
  "src/lib/manifest.ts",
  "src/lib/public-discovery.ts",
  "src/lib/siblings.ts",
];

const PRIVATE_WORDING =
  /private repositor(?:y|ies)|repositor(?:y|ies) (?:is|remains) (?:currently )?private|source repository is private|private until (?:the )?source release|\(private\)/i;

function filesWithPrivateWording(): string[] {
  return sourceFiles(join(APP_ROOT, "src"))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map(rel)
    .filter((name) => name !== "src/lib/repository.ts")
    .filter((name) => PRIVATE_WORDING.test(readFileSync(join(APP_ROOT, name), "utf8")))
    .sort();
}

describe("hardcoded private-repository wording", () => {
  it("is inventoried, so a source release rewrites it deliberately", () => {
    expect(filesWithPrivateWording()).toEqual([...HARDCODED_PRIVATE_WORDING].sort());
  });

  it("must be cleared before the repository visibility changes", () => {
    if (REPOSITORY_VISIBILITY === "private") return;
    expect(filesWithPrivateWording()).toEqual([]);
  });
});
