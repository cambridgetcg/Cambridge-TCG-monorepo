import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./db", () => ({
  db: { transaction: mocks.transaction },
}));

import {
  canReserveLoginAttempt,
  credentialAttemptKey,
  LOGIN_ATTEMPT_POLICY,
  reserveCredentialLoginAttempt,
} from "./login-rate-limit";

const originalAuthSecret = process.env.AUTH_SECRET;
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;
const testSecret = "a-high-entropy-test-secret-that-is-long-enough";

beforeEach(() => {
  process.env.AUTH_SECRET = testSecret;
  delete process.env.NEXTAUTH_SECRET;
  mocks.execute.mockReset();
  mocks.transaction.mockReset();
  mocks.transaction.mockImplementation(
    async (
      callback: (transaction: {
        execute: typeof mocks.execute;
      }) => Promise<boolean>,
    ) => callback({ execute: mocks.execute }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalAuthSecret;
  if (originalNextAuthSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
});

function countsAt(
  values: {
    perKey?: number;
    global?: number;
    retained?: number;
  } = {},
) {
  mocks.execute.mockImplementation(async () => {
    if (mocks.execute.mock.calls.length === 4) {
      return [
        {
          per_key_attempts: values.perKey ?? 0,
          global_attempts: values.global ?? 0,
          retained_attempts: values.retained ?? 0,
        },
      ];
    }
    return [];
  });
}

describe("credential login rate limiter", () => {
  it("derives a stable pseudonymous key without retaining the email", async () => {
    const email = "person@example.com";
    const first = await credentialAttemptKey(email, testSecret);
    const second = await credentialAttemptKey(email, testSecret);

    expect(first).toBe(second);
    expect(first).toBe(
      "hmac-sha256:v1:65c462075cf057473361d7b1dd611923e25f5a9415e18b409b763c5cca177ecd",
    );
    expect(first).toMatch(/^hmac-sha256:v1:[a-f0-9]{64}$/u);
    expect(first).not.toContain(email);
    await expect(credentialAttemptKey(email, `${testSecret}!`)).resolves.not.toBe(first);
  });

  it("enforces each explicit ceiling", () => {
    expect(
      canReserveLoginAttempt({ perKey: 4, global: 99, retained: 9_999 }),
    ).toBe(true);
    expect(
      canReserveLoginAttempt({
        perKey: LOGIN_ATTEMPT_POLICY.perKeyLimit,
        global: 0,
        retained: 0,
      }),
    ).toBe(false);
    expect(
      canReserveLoginAttempt({
        perKey: 0,
        global: LOGIN_ATTEMPT_POLICY.globalLimit,
        retained: 0,
      }),
    ).toBe(false);
    expect(
      canReserveLoginAttempt({
        perKey: 0,
        global: 0,
        retained: LOGIN_ATTEMPT_POLICY.retainedRowLimit,
      }),
    ).toBe(false);
  });

  it("locks, prunes, counts, and inserts one reserved attempt", async () => {
    countsAt();
    const email = "person@example.com";

    await expect(reserveCredentialLoginAttempt(email)).resolves.toBe(true);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledTimes(5);

    const queryState = JSON.stringify(mocks.execute.mock.calls);
    expect(queryState).toContain(await credentialAttemptKey(email, testSecret));
    expect(queryState).not.toContain(email);
    expect(queryState).not.toContain(testSecret);
  });

  it("does not insert when any atomic count reaches its ceiling", async () => {
    countsAt({ perKey: LOGIN_ATTEMPT_POLICY.perKeyLimit });

    await expect(
      reserveCredentialLoginAttempt("person@example.com"),
    ).resolves.toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it("fails closed before the database when AUTH_SECRET is missing or weak", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.AUTH_SECRET;

    await expect(
      reserveCredentialLoginAttempt("person@example.com"),
    ).resolves.toBe(false);
    process.env.AUTH_SECRET = "too-short";
    await expect(
      reserveCredentialLoginAttempt("person@example.com"),
    ).resolves.toBe(false);

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("accepts the production NEXTAUTH_SECRET compatibility alias", async () => {
    delete process.env.AUTH_SECRET;
    process.env.NEXTAUTH_SECRET = testSecret;
    countsAt();

    await expect(
      reserveCredentialLoginAttempt("person@example.com"),
    ).resolves.toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(5);
  });

  it("fails closed without logging email, IP, secret, or database error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValueOnce(
      new Error("postgres://internal-user:internal-password@database"),
    );

    await expect(
      reserveCredentialLoginAttempt("private@example.com"),
    ).resolves.toBe(false);

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("denying attempt");
    expect(logged).not.toMatch(
      /private@example|internal-user|internal-password|postgres|127\.0\.0\.1/u,
    );
  });
});
