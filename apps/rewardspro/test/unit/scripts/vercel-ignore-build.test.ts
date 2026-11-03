// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * scripts/vercel-ignore-build.sh decides whether a push redeploys
 * RewardsPro. Exit 0 skips the deployment; exit 1 builds. These runs use a
 * throwaway monorepo-shaped git history and a shallow clone of it, the way
 * Vercel clones (10 commits deep).
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

/** Runs the script from apps/rewardspro, as Vercel does; returns its exit code. */
function ignoreStep(checkout: string, env: Record<string, string>) {
  const result = spawnSync("sh", ["scripts/vercel-ignore-build.sh"], {
    cwd: join(checkout, "apps/rewardspro"),
    env: { ...gitEnv, ...env },
    encoding: "utf8",
  });
  return result.status;
}

describe("vercel-ignore-build.sh", () => {
  let dir: string;
  let repo: string;
  let appChange: string;
  let lastDocsChange: string;

  /** A shallow clone of the history so far, `depth` commits deep. */
  function cloneAt(name: string, depth: number) {
    const target = join(dir, name);
    git(dir, "clone", "-q", `--depth=${depth}`, `file://${repo}`, target);
    return target;
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "rp-ignore-build-"));
    repo = join(dir, "repo");
    mkdirSync(repo);
    git(repo, "init", "-q");
    commit(repo, "package.json", "{}\n");
    mkdirSync(join(repo, "apps/rewardspro/scripts"), { recursive: true });
    copyFileSync(SCRIPT, join(repo, "apps/rewardspro/scripts/vercel-ignore-build.sh"));
    appChange = commit(repo, "apps/rewardspro/app.ts", "export {};\n");
    for (let i = 0; i < 12; i++) lastDocsChange = commit(repo, "docs/notes.md", `note ${i}\n`);
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
    const base = git(repo, "rev-parse", "HEAD");
    commit(repo, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    const clone = cloneAt("lockfile", 10);
    expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: base })).toBe(BUILD);
    git(repo, "reset", "-q", "--hard", "HEAD^");
  });

  describe("on production, with no usable previous deployment commit", () => {
    it("skips a docs-only commit whose previous deployment is older than the clone", () => {
      // The 2026-11-02 docs-only merge: Vercel named the last deployment's
      // commit, but it sat 11 commits back, past the 10-deep clone.
      const clone = cloneAt("shallow-docs", 10);
      expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(SKIP);
    });

    it("skips a docs-only commit when Vercel names no previous deployment", () => {
      const clone = cloneAt("no-sha-docs", 10);
      expect(ignoreStep(clone, { VERCEL_ENV: "production" })).toBe(SKIP);
    });

    it("builds when the commit itself changes the app", () => {
      const before = git(repo, "rev-parse", "HEAD");
      commit(repo, "apps/rewardspro/app.ts", "export const changed = true;\n");
      const clone = cloneAt("no-sha-app", 10);
      expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      git(repo, "reset", "-q", "--hard", before);
    });

    it("builds when an earlier commit of the same push changes the app", () => {
      // A push of several commits (rebase merge, direct push) deploys only
      // its last one, so the parent alone would miss the app change.
      const before = git(repo, "rev-parse", "HEAD");
      commit(repo, "apps/rewardspro/app.ts", "export const pushed = true;\n");
      commit(repo, "docs/notes.md", "after the app change\n");
      const clone = cloneAt("push-of-two", 10);
      expect(ignoreStep(clone, { VERCEL_ENV: "production", VERCEL_GIT_PREVIOUS_SHA: appChange })).toBe(BUILD);
      git(repo, "reset", "-q", "--hard", before);
    });

    it("builds when the clone holds only this commit", () => {
      const clone = cloneAt("depth-one", 1);
      expect(ignoreStep(clone, { VERCEL_ENV: "production" })).toBe(BUILD);
    });
  });

  it("builds a preview when Vercel names no previous deployment", () => {
    // A branch's first push: the clone says nothing about where the branch
    // left main.
    const clone = cloneAt("preview", 10);
    expect(ignoreStep(clone, { VERCEL_ENV: "preview" })).toBe(BUILD);
  });
});
