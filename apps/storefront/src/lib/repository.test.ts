import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  REPOSITORY_NOTE,
  REPOSITORY_URL,
  REPOSITORY_VISIBILITY,
  onSitePath,
  repoDocPath,
  repoDocRef,
  repoPathFromGithubUrl,
} from "@/lib/repository";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const SCANNED_EXTENSIONS = /\.(?:ts|tsx|mjs|js|md|json)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return SCANNED_EXTENSIONS.test(entry.name) ? [path] : [];
  });
}

const rel = (path: string) => relative(APP_ROOT, path).split(sep).join("/");

describe("repository references", () => {
  it("routes repository documents to an on-site page, otherwise to the document on GitHub", () => {
    expect(REPOSITORY_VISIBILITY).toBe("public");
    expect(REPOSITORY_NOTE).toBe(
      "public repository at https://github.com/cambridgetcg/Cambridge-TCG-monorepo; the workspace packages are not published to npm",
    );
    expect(repoDocRef("docs/principles/transparency.md")).toBe(
      "https://cambridgetcg.com/methodology/transparency",
    );
    expect(repoDocRef("docs/connections/the-tea-room.md")).toBe(
      `${REPOSITORY_URL}/blob/main/docs/connections/the-tea-room.md`,
    );
    expect(repoDocRef("docs/connections/")).toBe(`${REPOSITORY_URL}/tree/main/docs/connections`);
    expect(repoDocRef("packages/mcp-server")).toBe(`${REPOSITORY_URL}/tree/main/packages/mcp-server`);
    expect(repoDocPath("AGENTS.md")).toBe(`${REPOSITORY_URL}/blob/main/AGENTS.md`);
    expect(repoDocPath("docs/principles/the-embassy.md")).toBe(
      `${REPOSITORY_URL}/blob/main/docs/principles/the-embassy.md`,
    );
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

/**
 * The repository is public, so a GitHub blob/tree link into it works for
 * every reader as long as the path exists on main. Links into any other
 * repository, or at another ref, are refused: this module records only this
 * repository's visibility, and branches other than main come and go.
 * Existence is checked against this checkout, so it stands for main only when
 * the checkout matches main; an untracked or gitignored local file passes
 * here and still 404s on GitHub.
 */
describe("public surfaces link into GitHub only where the link resolves", () => {
  // The path runs to the first character that ends a URL in source or prose
  // (a backslash covers escaped newlines in JSON and string literals).
  const GITHUB_DOC_LINK = /github\.com\/([\w.-]+)\/([\w.-]+)\/(?:blob|tree)\/([\w.-]+)\/([^\s"'`)<>\]#?*,|\\]*)/g;
  // Most links are built by repoDocRef()/repoDocPath() and TypeSignature's
  // `see` rather than written out, so their literal path arguments are
  // checked too. A path built at run time (api/v1/sources/[id] joins a
  // source's catalog_section) is not checked here.
  const HELPER_DOC_PATH = /\brepoDoc(Ref|Path)\(\s*(["'`])([^"'`$]*)\2\s*[,)]|\bsee\s*=\s*(["'])([^"']+)\4/g;

  const lineOf = (source: string, index = 0) => source.slice(0, index).split("\n").length;

  it("links only to paths that exist on this repository's main branch", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(APP_ROOT, "src")), ...sourceFiles(join(APP_ROOT, "scripts"))]) {
      const name = rel(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(GITHUB_DOC_LINK)) {
        const [, owner, repo, ref, encoded] = match;
        const at = `${name}:${lineOf(source, match.index)}`;
        let path: string;
        try {
          path = decodeURIComponent(encoded);
        } catch {
          offenders.push(`${at} links to ${encoded}, which is not a valid URL path`);
          continue;
        }
        if (`https://github.com/${owner}/${repo}` !== REPOSITORY_URL || ref !== "main") {
          offenders.push(`${at} links outside ${REPOSITORY_URL} main`);
        } else if (!existsSync(join(REPO_ROOT, path))) {
          offenders.push(`${at} links to ${path}, which does not exist`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives repoDocRef(), repoDocPath() and TypeSignature's see only paths that exist", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of [...sourceFiles(join(APP_ROOT, "src")), ...sourceFiles(join(APP_ROOT, "scripts"))]) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const name = rel(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(HELPER_DOC_PATH)) {
        const helper = match[1] ?? "see";
        const path = (match[3] ?? match[5]).replace(/#.*$/, "");
        checked += 1;
        // repoDocRef() and `see` prefer the on-site page, so only an unmapped
        // path becomes a GitHub link; repoDocPath() always links to GitHub.
        if (helper !== "Path" && onSitePath(path)) continue;
        if (!existsSync(join(REPO_ROOT, path))) {
          offenders.push(`${name}:${lineOf(source, match.index)} points at ${path}, which does not exist`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

/**
 * Files that still match PRIVATE_WORDING on purpose, with the exact matches
 * each one keeps and the reason they are still true. The repository is
 * public (see @/lib/repository), so a production file that calls it private,
 * says its source release is pending or says it cannot be cloned is false
 * and fails the test below. A kept file is pinned to its matches, so a new
 * claim added beside them fails too; changelog.ts alone has no matches
 * listed and is exempt as a whole, because its dated entries may quote what
 * was true on their date. Check each line rather than adding a match to
 * quiet the test.
 */
const KEPT_PRIVATE_WORDING: Readonly<Record<string, { matches?: readonly string[]; reason: string }>> = {
  "src/app/guides/buying/page.tsx": {
    matches: ["(private)"],
    reason: "\"5% (private)\" is a seller tier, not a repository",
  },
  "src/app/methodology/opportunity-signals/page.tsx": {
    matches: ["private repository"],
    reason: "\"a separate private repository\" holds the fixture provider; it is not this repository",
  },
  "src/lib/changelog.ts": { reason: "dated entries record what was true on their date" },
  "src/lib/manifest.ts": {
    matches: ["(private)"],
    reason: "repo_mirrors marks the Codeberg mirror (private); its visibility was not rechecked on 2026-10-29",
  },
};

// The last two alternatives catch code, source or repo described as private
// ("the code is Apache-2.0 and still private") whatever words come between.
const PRIVATE_WORDING =
  /private repositor(?:y|ies)|(?:repositor(?:y|ies)|monorepo)(?:,?\s+which)?(?:\s+itself)?\s+(?:is|remains)\s+(?:currently\s+)?private|source repository is private|private until (?:the )?source release|source(?:-code)? release (?:is )?pending|not publicly cloneable|\(private\)|\b(?:code|codebase|source(?: code)?|monorepo|repo)\b[^;\n]{0,40}?\b(?:still|currently)\s+private\b|\b(?:code|codebase|source code|monorepo|repo)\s+(?:is|remains|stays)\s+(?:still\s+|currently\s+)?private\b/gi;

/** Every PRIVATE_WORDING match in each production file that has one. */
function privateWordingMatches(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const file of sourceFiles(join(APP_ROOT, "src"))) {
    if (/\.test\.tsx?$/.test(file)) continue;
    const name = rel(file);
    if (name === "src/lib/repository.ts") continue;
    const matches = [...readFileSync(file, "utf8").matchAll(PRIVATE_WORDING)].map((match) => match[0]);
    if (matches.length > 0) found[name] = matches;
  }
  return found;
}

describe("private-repository wording", () => {
  it("is gone from every production file while the repository is public", () => {
    expect(REPOSITORY_VISIBILITY).toBe("public");
    const found = privateWordingMatches();
    expect(Object.keys(found).sort()).toEqual(Object.keys(KEPT_PRIVATE_WORDING).sort());
    for (const [name, kept] of Object.entries(KEPT_PRIVATE_WORDING)) {
      if (kept.matches) expect(found[name], name).toEqual(kept.matches);
    }
  });
});
