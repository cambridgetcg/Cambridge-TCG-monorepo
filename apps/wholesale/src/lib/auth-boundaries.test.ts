import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
const loginActionSource = readFileSync(
  new URL("../app/login/actions.ts", import.meta.url),
  "utf8",
);
const limiterSource = readFileSync(
  new URL("./login-rate-limit.ts", import.meta.url),
  "utf8",
);

describe("credential authentication boundaries", () => {
  it("validates credential input before querying for a client", () => {
    const validation = authSource.indexOf(
      "const email = normalizeCredentialEmail(",
    );
    const reservation = authSource.indexOf(
      "await reserveCredentialLoginAttempt(email)",
    );
    const query = authSource.indexOf(".select()");

    expect(validation).toBeGreaterThan(-1);
    expect(reservation).toBeGreaterThan(validation);
    expect(query).toBeGreaterThan(reservation);
  });

  it("counts every reserved attempt without storing raw identity or outcome", () => {
    expect(limiterSource).toContain("pg_advisory_xact_lock");
    expect(limiterSource).toContain("retainedRowLimit: 10_000");
    expect(limiterSource).toContain(
      "LIMIT ${LOGIN_ATTEMPT_POLICY.pruneBatchSize}",
    );
    expect(limiterSource).not.toMatch(/WHERE[^`]*success\s*=/u);
    expect(limiterSource).toContain(
      "VALUES (${attemptKey}, ${now}, false, NULL)",
    );
  });

  it("does not return unexpected sign-in exceptions to the client", () => {
    expect(loginActionSource).toContain("unstable_rethrow(error)");
    expect(loginActionSource).toContain(
      'console.error("[AUTH] Login action unavailable; denying attempt")',
    );
    expect(loginActionSource).not.toContain("redactInternalError");
    expect(loginActionSource).not.toContain("throw error");
  });
});
