import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";

import { main, readBoundedFixtureJson } from "../../../scripts/verify-auth-provider";

const execute = promisify(execFile);
import type { AuthVerifyDependencies } from "./runner";

describe("auth verification CLI entrypoint", () => {
  it("reports an internal canary as failed without raw error output", async () => {
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const dependencies: AuthVerifyDependencies = {
      request: async () => ({ status: 200, headers: {}, body: "{}" }),
      now: () => {
        throw new Error("internal-canary-do-not-emit");
      },
    };
    try {
      const exitCode = await main([
        "github", "--mode", "preflight", "--base", "https://cambridgetcg.com", "--allow-production", "--json",
      ], dependencies);
      expect(exitCode).toBe(3);
      expect(writes.join("")).toBe("{\"status\":\"failed\",\"code\":\"verification_internal_error\"}\n");
      expect(writes.join("")).not.toContain("internal-canary-do-not-emit");
    } finally {
      output.mockRestore();
    }
  });

  it("normalizes production slash and default-port bases before selecting Vercel target", async () => {
    const targets: string[] = [];
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const dependencies: AuthVerifyDependencies = {
      now: () => new Date("2026-09-07T12:00:00.000Z"),
      request: async () => ({
        status: 200,
        headers: {
          "x-ctcg-verification-version": "github-oauth/1",
          "x-ctcg-deployment-id": "dpl_123",
          "x-ctcg-commit-sha": "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        },
        body: JSON.stringify({ github: { id: "github" } }),
      }),
      readVercelMetadata: async (descriptor) => {
        targets.push(descriptor.vercel!.target);
        return {
          id: "dpl_123",
          sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
          observedAt: "2026-09-07T12:00:00.000Z",
          target: "production",
          configurationFreshness: "current",
        };
      },
    };
    try {
      for (const base of ["https://cambridgetcg.com/", "https://cambridgetcg.com:443"]) {
        const exitCode = await main([
          "github", "--mode", "preflight", "--base", base, "--allow-production", "--vercel-metadata", "--json",
        ], dependencies);
        expect(exitCode, writes.join("")).toBe(2);
      }
      expect(targets).toEqual(["production", "production"]);
    } finally {
      output.mockRestore();
    }
  });

  it("documents private fixture public-denial and declaration flags without traffic", async () => {
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      expect(await main(["github", "--help"])).toBe(0);
      const help = writes.join("");
      expect(help).toContain("expectedPublicErrorCode:\"access_denied\"");
      expect(help).toContain("--operator-declared-github-app");
    } finally {
      output.mockRestore();
    }
  });

  it("reads only bounded regular JSON fixtures without following links or waiting on FIFOs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ctcg-auth-fixture-reader-"));
    const valid = join(directory, "valid.json");
    const oversized = join(directory, "oversized.json");
    const linked = join(directory, "linked.json");
    const fifo = join(directory, "fixture.pipe");
    try {
      await writeFile(valid, JSON.stringify({ origin: "https://fixture.example.test" }), { mode: 0o600 });
      await writeFile(oversized, `{"canary":"${"x".repeat(64 * 1024)}"}`, { mode: 0o600 });
      await symlink(valid, linked);
      await execute("mkfifo", [fifo]);

      await expect(readBoundedFixtureJson(valid)).resolves.toEqual({ origin: "https://fixture.example.test" });
      for (const path of [oversized, linked, fifo]) {
        await expect(Promise.race([
          readBoundedFixtureJson(path),
          new Promise((_, reject) => setTimeout(() => reject(new Error("reader-hung-canary")), 500)),
        ])).rejects.toMatchObject({ code: "config_fixture_not_approved" });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
