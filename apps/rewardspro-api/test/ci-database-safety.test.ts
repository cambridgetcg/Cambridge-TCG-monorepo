import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("CI PostgreSQL helper safety", () => {
  it("requires explicit CI opt-in and the expected bootstrap identity", async () => {
    const script = await readFile(
      new URL("../scripts/bootstrap-ci-database-roles.mjs", import.meta.url),
      "utf8",
    );

    expect(script).toContain('process.env.CI === "true"');
    expect(script).toContain('process.env.GITHUB_ACTIONS === "true"');
    expect(script).toContain(
      'process.env.REWARDSPRO_CI_DATABASE_CONFORMANCE === "true"',
    );
    expect(script).toContain(
      'process.env.REWARDSPRO_LOCAL_DISPOSABLE_DATABASE_CONFORMANCE === "true"',
    );
    expect(script).toContain(
      "process.env.REWARDSPRO_CONFORMANCE_ADMIN_USERNAME",
    );
    expect(script).toContain('parsedUrl.pathname !== "/rewardspro"');
    expect(script).toContain(
      "decodeURIComponent(parsedUrl.username) !== expectedAdminUsername",
    );
  });

  it("pins all conformance URLs to distinct users on one local database", async () => {
    const script = await readFile(
      new URL("../scripts/postgres-conformance.mjs", import.meta.url),
      "utf8",
    );

    expect(script).toContain("expectedAdminUsername");
    expect(script).toContain('"rewardspro_ci_api"');
    expect(script).toContain('"rewardspro_ci_worker"');
    expect(script).toContain(
      "process.env.REWARDSPRO_CONFORMANCE_ADMIN_USERNAME",
    );
    expect(script).toContain('parsed.pathname !== "/rewardspro"');
    expect(script).toContain("parsed.protocol !== adminUrl?.protocol");
    expect(script).toContain("parsed.hostname !== adminUrl.hostname");
    expect(script).toContain("parsed.port !== adminUrl.port");
    expect(script).toContain("parsed.pathname !== adminUrl.pathname");
  });
});
