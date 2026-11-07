// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * scripts/vercel-ignore-build.sh decides whether a push redeploys
 * RewardsPro. Exit 0 skips the deployment; exit 1 builds. These runs use a
 * throwaway monorepo-shaped git history, where changes land as merge
 * commits like PRs on main, and shallow clones of it, the way Vercel clones
 * (10 commits deep).
 */

const SCRIPT = resolve(__dirname, "../../../scripts/vercel-ignore-build.sh");
const SKIP = 0;
const BUILD = 1;

// No inherited VERCEL_* variables, and no user git config (hooks, signing)
const gitEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8", stdio: "pipe" }).trim();
}

/** Writes one file and commits it; returns the commit's SHA. */
function commit(repo: string, file: string, content: string) {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), content);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", `change ${file}`);
  return git(repo, "rev-parse", "HEAD");
}

/** Lands one change the way a PR lands on main: a branch commit and a merge commit. */
function merge(repo: string, file: string, content: string) {
  git(repo, "checkout", "-q", "-b", "pr");
  commit(repo, file, content);
  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "-q", "--no-ff", "-m", `merge ${file}`, "pr");
  git(repo, "branch", "-q", "-d", "pr");
  return git(repo, "rev-parse", "HEAD");
}

/** Runs the script from apps/rewards, as Vercel does; returns its exit code. */
function ignoreStep(checkout: string, env: Record<string, string>) {
  const result = spawnSync("sh", ["scripts/vercel-ignore-build.sh"], {
    cwd: join(checkout, "apps/rewards"),
    env: { ...gitEnv, ...env },
    encoding: "utf8",
  });
  return result.status;
}

describe("vercel-ignore-build.sh", () => {
  let dir: string;
  let repo: string;
  let tip: string;
  let appChange: string;
  let lastDocsChange: string;

  /**
   * A shallow clone of the history so far, `depth` commits deep. Its origin
   * serves any commit by SHA, as GitHub does; `remote: false` removes it, so
   * nothing outside the clone can be fetched.
   */
  function cloneAt(name: string, depth: number, { remote = true } = {}) {
    const target = mkdtempSync(join(dir, `${name}-`));
    git(dir, "clone", "-q", `--depth=${depth}`, `file://${repo}`, target);
    if (!remote) git(target, "remote", "remove", "origin");
    return target;
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rp-ignore-build-"));
    repo = join(dir, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "uploadpack.allowReachableSHA1InWant", "true");
    commit(repo, "package.json", "{}\n");
    mkdirSync(join(repo, "apps/rewards/scripts"), { recursive: true });
    copyFileSync(SCRIPT, join(repo, "apps/rewards/scripts/vercel-ignore-build.sh"));
    appChange = commit(repo, "apps/rewards/app.ts", "export {};\n");
    for (let i = 0; i < 12; i++) lastDocsChange = merge(repo, "docs/notes.md", `note ${i}\n`);
    tip = git(repo, "rev-parse", "HEAD");
  });

  // A case that adds commits can't leak them into later cases, or into
  // vitest's retry, even when its expect fails.
  afterEach(() => {
    git(repo, "reset", "-q", "--hard", tip);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips when nothing the app uses changed since the last deployment", () => {
    const clone = cloneAt("full-docs", 50);
    expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: lastDocsChange })).toBe(SKIP);
  });

  it("builds when the app changed since the last deployment", () => {
    const clone = cloneAt("full-app", 50);
    const appParent = git(clone, "rev-parse", `${appChange}^`);
    expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appParent })).toBe(BUILD);
  });

  it("builds when a root install file changed since the last deployment", () => {
    merge(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    const clone = cloneAt("lockfile", 10);
    expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: tip })).toBe(BUILD);
  });

  it("builds on production when Vercel names no previous deployment", () => {
    // A first deployment, or a new or relinked project: nothing was checked.
    const clone = cloneAt("no-sha", 10);
    expect(ignoreStep(clone, { VERCEL_ENV: "production" })).toBe(BUILD);
  });

  it("builds a preview when Vercel names no previous deployment", () => {
    // A branch's first push: the clone says nothing about where the branch
    // left main.
    const clone = cloneAt("preview", 10);
    expect(ignoreStep(clone, { VERCEL_ENV: "preview" })).toBe(BUILD);
  });

  describe("when the previous deployment commit is older than the clone", () => {
    it("fetches it and skips a docs-only merge", () => {
      // The 2026-11-02 docs-only merge: Vercel named the last deployment's
      // commit, but it sat 11 commits back, past the 10-deep clone.
      const clone = cloneAt("fetch-docs", 10);
      expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(SKIP);
    });

    it("fetches it and builds when the app changed further back than the clone", () => {
      // An app change whose build failed, then a long run of docs merges:
      // only the real previous deployment shows the change.
      const clone = cloneAt("fetch-app", 10);
      const appParent = git(repo, "rev-parse", `${appChange}^`);
      expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appParent })).toBe(BUILD);
    });

    describe("and it can't be fetched", () => {
      it("skips a docs-only merge on production", () => {
        const clone = cloneAt("no-fetch-docs", 10, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(SKIP);
      });

      it("builds a merge when the merges in the clone change the app", () => {
        merge(repo, "apps/rewards/app.ts", "export const changed = true;\n");
        merge(repo, "docs/notes.md", "after the app change\n");
        const clone = cloneAt("no-fetch-app", 10, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      });

      it("builds a push of 10 commits whose app change comes first", () => {
        // A rebase merge or a direct push deploys only its last commit; in a
        // 10-deep clone the first commit's own change can't be seen.
        commit(repo, "apps/rewards/app.ts", "export const pushed = true;\n");
        for (let i = 0; i < 9; i++) commit(repo, "docs/notes.md", `pushed note ${i}\n`);
        const clone = cloneAt("no-fetch-push", 10, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: tip })).toBe(BUILD);
      });

      it("builds a commit that is not a merge", () => {
        commit(repo, "docs/notes.md", "pushed straight to main\n");
        const clone = cloneAt("no-fetch-direct", 10, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      });

      it("builds when the clone holds only this commit", () => {
        const clone = cloneAt("no-fetch-depth-one", 1, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      });

      it("builds a preview", () => {
        const clone = cloneAt("no-fetch-preview", 10, { remote: false });
        expect(ignoreStep(clone, { VERCEL_ENV: "preview", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      });
    });
  });
});
