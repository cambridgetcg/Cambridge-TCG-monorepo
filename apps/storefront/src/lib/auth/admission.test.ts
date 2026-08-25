import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { NextAuthConfig } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountExists: vi.fn(),
  capacity: vi.fn(),
}));

vi.mock("./adapter", () => ({
  accountExistsForSignIn: mocks.accountExists,
  magicLinkRequestCapacity: mocks.capacity,
}));

import {
  MAGIC_LINK_RESPONSE_FLOOR_MS,
  MAGIC_LINK_SUCCESS_REDIRECT,
  REGISTRATION_PAUSED_REDIRECT,
  admissionSignInCallback,
  googleSignInDecision,
  magicLinkSignInDecision,
  waitForMagicLinkResponseFloor,
} from "./admission";
import { ACCOUNT_ADMISSION_REVIEWED_MODE } from "@/lib/release/production-gates";

const AVAILABLE_CAPACITY = {
  allowed: true,
  reason: null,
  emailActiveCount: 0,
  globalActiveCount: 0,
  retryAfterSeconds: 0,
};

type SignInParams = Parameters<
  NonNullable<NonNullable<NextAuthConfig["callbacks"]>["signIn"]>
>[0];

beforeEach(() => {
  mocks.accountExists.mockReset();
  mocks.capacity.mockReset();
  mocks.capacity.mockResolvedValue(AVAILABLE_CAPACITY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("magic-link admission decision", () => {
  it("uses ordinary Auth.js success for an unknown account while admission is paused", async () => {
    mocks.accountExists.mockResolvedValue(false);

    await expect(magicLinkSignInDecision("unknown@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: "paused",
    })).resolves.toBe(MAGIC_LINK_SUCCESS_REDIRECT);

    expect(mocks.capacity).toHaveBeenCalledWith("unknown@example.com");
    expect(mocks.accountExists).toHaveBeenCalledWith("unknown@example.com");
  });

  it("preserves existing-user sign-in while admission is paused", async () => {
    mocks.accountExists.mockResolvedValue(true);

    await expect(magicLinkSignInDecision("existing@example.com", {
      NODE_ENV: "production",
    })).resolves.toBe(true);
  });

  it("allows new-account email issuance only under the exact reviewed mode", async () => {
    await expect(magicLinkSignInDecision("new@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).resolves.toBe(true);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("hides address-specific token capacity behind ordinary Auth.js success", async () => {
    mocks.capacity.mockResolvedValue({
      allowed: false,
      reason: "email",
      emailActiveCount: 5,
      globalActiveCount: 25,
      retryAfterSeconds: 3600,
    });

    await expect(magicLinkSignInDecision("existing@example.com", {
      NODE_ENV: "production",
    })).resolves.toBe(MAGIC_LINK_SUCCESS_REDIRECT);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });
});

describe("Google admission callback", () => {
  function callbackParams(email: string | null): SignInParams {
    return {
      user: {
        id: "google-profile",
        name: "Collector",
        email,
        emailVerified: null,
        image: null,
      },
      account: {
        provider: "google",
        type: "oidc",
        providerAccountId: "google-profile",
      },
      profile: {},
    } as SignInParams;
  }

  it("allows Google sign-in for an existing email while admission is paused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockResolvedValue(true);

    await expect(admissionSignInCallback(
      callbackParams("existing@example.com"),
    )).resolves.toBe(true);

    expect(mocks.accountExists).toHaveBeenCalledWith("existing@example.com");
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("redirects a first-time Google email before Auth.js may write", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockResolvedValue(false);

    await expect(admissionSignInCallback(
      callbackParams("new@example.com"),
    )).resolves.toBe(REGISTRATION_PAUSED_REDIRECT);

    expect(mocks.accountExists).toHaveBeenCalledWith("new@example.com");
    expect(mocks.capacity).not.toHaveBeenCalled();
  });

  it("fails a missing Google email closed and opens only after exact review", async () => {
    await expect(googleSignInDecision(null, {
      NODE_ENV: "production",
    })).resolves.toBe(REGISTRATION_PAUSED_REDIRECT);

    await expect(googleSignInDecision("new@example.com", {
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).resolves.toBe(true);

    expect(mocks.accountExists).not.toHaveBeenCalled();
  });

  it("is the signIn callback wired into the deployed Auth.js config", () => {
    const authConfig = readFileSync(
      resolve(process.cwd(), "src/lib/auth/index.ts"),
      "utf8",
    );

    expect(authConfig).toContain("signIn: admissionSignInCallback");
    expect(authConfig).toContain(
      'import { admissionSignInCallback } from "./admission"',
    );
  });
});

describe("Auth.js external response equivalence", () => {
  it("gives unknown and eligible existing addresses identical status, body and headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ACCOUNT_ADMISSION_MODE", "paused");
    mocks.accountExists.mockImplementation(
      async (email: string) => email === "existing@example.com",
    );
    const sendVerificationRequest = vi.fn().mockResolvedValue(undefined);
    const createVerificationToken = vi.fn(async (token) => token);
    const createUser = vi.fn();
    const existingUser: AdapterUser = {
      id: "existing-user",
      name: null,
      email: "existing@example.com",
      emailVerified: null,
      image: null,
    };
    const adapter = {
      getUserByEmail: vi.fn(async (email: string) => (
        email === existingUser.email ? existingUser : null
      )),
      createVerificationToken,
      useVerificationToken: vi.fn(async () => null),
      createUser,
    } as unknown as Adapter;
    // Resolve Auth.js from next-auth's declared dependency. It is deliberately
    // not a direct application dependency, so resolving from the owning
    // package keeps this integration check honest under pnpm isolation.
    const nextAuthPackage = createRequire(import.meta.url).resolve(
      "next-auth/package.json",
    );
    const coreEntry = createRequire(nextAuthPackage).resolve("@auth/core");
    const core = await import(/* @vite-ignore */ pathToFileURL(coreEntry).href) as {
      Auth: (request: Request, config: unknown) => Promise<Response>;
      skipCSRFCheck: symbol;
    };
    const config = {
      basePath: "/api/auth",
      providers: [
        {
          id: "email",
          name: "Email",
          type: "email",
          from: "noreply@cambridgetcg.com",
          maxAge: 86_400,
          sendVerificationRequest,
        },
      ],
      adapter,
      secret: "test-secret-test-secret-test-secret",
      trustHost: true,
      skipCSRFCheck: core.skipCSRFCheck,
      callbacks: {
        signIn: admissionSignInCallback,
      },
    };

    async function requestShape(email: string) {
      const response = await core.Auth(
        new Request("https://cambridgetcg.com/api/auth/signin/email", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            email,
            callbackUrl: "/account",
          }),
        }),
        config,
      );
      return {
        status: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
      };
    }

    const unknown = await requestShape("unknown@example.com");
    const existing = await requestShape("existing@example.com");

    expect(unknown).toEqual(existing);
    expect(unknown).toEqual({
      status: 302,
      body: "",
      headers: {
        location:
          "https://cambridgetcg.com/api/auth/verify-request?provider=email&type=email",
        "set-cookie":
          "__Secure-authjs.callback-url=https%3A%2F%2Fcambridgetcg.com%2Faccount; Path=/; HttpOnly; Secure; SameSite=Lax",
      },
    });
    expect(sendVerificationRequest).toHaveBeenCalledOnce();
    expect(sendVerificationRequest.mock.calls[0]?.[0]).toMatchObject({
      identifier: "existing@example.com",
    });
    expect(createVerificationToken).toHaveBeenCalledOnce();
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("magic-link response timing class", () => {
  it("pads production, unset and unrecognised runtimes to the response floor", async () => {
    for (const env of [
      { NODE_ENV: "production" },
      {},
      { NODE_ENV: "staging" },
    ]) {
      const wait = vi.fn().mockResolvedValue(undefined);

      await waitForMagicLinkResponseFloor(100, env, () => 300, wait);

      expect(wait).toHaveBeenCalledWith(MAGIC_LINK_RESPONSE_FLOOR_MS - 200);
    }
  });

  it("does not delay tests or development, or add time after the floor", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);

    await waitForMagicLinkResponseFloor(100, { NODE_ENV: "test" }, () => 200, wait);
    await waitForMagicLinkResponseFloor(100, { NODE_ENV: "development" }, () => 200, wait);
    await waitForMagicLinkResponseFloor(
      100,
      { NODE_ENV: "production" },
      () => 100 + MAGIC_LINK_RESPONSE_FLOOR_MS,
      wait,
    );

    expect(wait).not.toHaveBeenCalled();
  });
});
