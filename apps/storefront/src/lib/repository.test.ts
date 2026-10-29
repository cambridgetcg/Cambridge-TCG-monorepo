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
 */
describe("public surfaces link into GitHub only where the link resolves", () => {
  const GITHUB_DOC_LINK = /github\.com\/([\w.-]+)\/([\w.-]+)\/(?:blob|tree)\/([\w.-]+)\/([\w./-]*)/g;

  it("links only to paths that exist on this repository's main branch", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(join(APP_ROOT, "src")), ...sourceFiles(join(APP_ROOT, "scripts"))]) {
      const name = rel(file);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(GITHUB_DOC_LINK)) {
        const [, owner, repo, ref, path] = match;
        const at = `${name}:${source.slice(0, match.index ?? 0).split("\n").length}`;
        if (`https://github.com/${owner}/${repo}` !== REPOSITORY_URL || ref !== "main") {
          offenders.push(`${at} links outside ${REPOSITORY_URL} main`);
        } else if (!existsSync(join(REPO_ROOT, path))) {
          offenders.push(`${at} links to ${path}, which does not exist`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * Files that still match PRIVATE_WORDING on purpose, with the reason each
 * one is still true. The repository is public (see @/lib/repository), so a
 * production file that calls it private, says its source release is pending
 * or says it cannot be cloned is false and fails the test below. Keep an
 * entry only when its matches describe something else; check each line
 * rather than adding a file to quiet the test.
 */
const KEPT_PRIVATE_WORDING: Readonly<Record<string, string>> = {
  "src/app/guides/buying/page.tsx": "\"5% (private)\" is a seller tier, not a repository",
  "src/app/methodology/opportunity-signals/page.tsx":
    "\"a separate private repository\" holds the fixture provider; it is not this repository",
  "src/lib/changelog.ts": "dated entries record what was true on their date",
  "src/lib/manifest.ts":
    "repo_mirrors marks the Codeberg mirror (private); its visibility was not rechecked on 2026-10-29",
};

const PRIVATE_WORDING =
  /private repositor(?:y|ies)|(?:repositor(?:y|ies)|monorepo)(?:,?\s+which)?(?:\s+itself)?\s+(?:is|remains)\s+(?:currently\s+)?private|source repository is private|private until (?:the )?source release|source(?:-code)? release (?:is )?pending|not publicly cloneable|\(private\)/i;

function filesWithPrivateWording(): string[] {
  return sourceFiles(join(APP_ROOT, "src"))
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map(rel)
    .filter((name) => name !== "src/lib/repository.ts")
    .filter((name) => PRIVATE_WORDING.test(readFileSync(join(APP_ROOT, name), "utf8")))
    .sort();
}

describe("private-repository wording", () => {
  it("is gone from every production file while the repository is public", () => {
    expect(REPOSITORY_VISIBILITY).toBe("public");
    expect(filesWithPrivateWording()).toEqual(Object.keys(KEPT_PRIVATE_WORDING).sort());
  });
});
