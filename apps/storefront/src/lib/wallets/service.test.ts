import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletLinkConfig } from "./config";
import { buildWalletLinkChallenge } from "./proof";
import {
  issueParticipantWalletChallenge,
  revokeParticipantWalletLink,
  verifyParticipantWalletChallenge,
} from "./service";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  revoke: vi.fn(),
  reserve: vi.fn(),
  storeChallenge: vi.fn(),
}));

vi.mock("./config", () => ({ getWalletLinkConfig: mocks.getConfig }));
vi.mock("./db", () => ({
  finalizeVerifiedWalletLink: vi.fn(),
  listActiveWalletLinks: vi.fn(),
  reserveWalletVerificationAttempt: mocks.reserve,
  revokeOwnedWalletLink: mocks.revoke,
  storeWalletLinkChallenge: mocks.storeChallenge,
}));

const USER_ID = "123e4567-e89b-42d3-a456-426614174099";
const WALLET_ID = "123e4567-e89b-42d3-a456-426614174002";
const ORIGIN = "https://cambridgetcg.com";
const ATTEMPT_AT = new Date("2026-08-24T12:01:00.000Z");
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

const disabledConfig: WalletLinkConfig = {
  enabled: false,
  mode: "disabled",
  origin: ORIGIN,
  domain: "cambridgetcg.com",
  scheme: "https",
  rpc_url: undefined,
  rpc_provider: null,
  origin_configuration_error: null,
  rpc_configuration_error: null,
  configuration_error: null,
};
const enabledConfig: WalletLinkConfig = {
  ...disabledConfig,
  enabled: true,
  mode: "testnet",
};

function request(): Request {
  return new Request(`${ORIGIN}/api/account/wallets/${WALLET_ID}`, {
    method: "DELETE",
    headers: {
      cookie: "__Secure-authjs.session-token=test-session",
      origin: ORIGIN,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getConfig.mockReturnValue(disabledConfig);
  mocks.revoke.mockResolvedValue({
    status: "revoked",
    already_revoked: false,
    id: WALLET_ID,
  });
});

describe("wallet service disablement boundary", () => {
  it("allows a participant-scoped revoke while new issuance is disabled", async () => {
    await expect(
      revokeParticipantWalletLink({
        user_id: USER_ID,
        request: request(),
        wallet_id: WALLET_ID,
      }),
    ).resolves.toEqual({
      revoked: true,
      already_revoked: false,
      wallet_id: WALLET_ID,
    });
    expect(mocks.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ id: WALLET_ID, user_id: USER_ID }),
    );
  });

  it("still rejects new challenge issuance while disabled", async () => {
    await expect(
      issueParticipantWalletChallenge({
        user_id: USER_ID,
        request: request(),
        address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        chain: "eip155:84532",
      }),
    ).rejects.toMatchObject({ code: "WALLET_LINKING_UNAVAILABLE" });
    expect(mocks.storeChallenge).not.toHaveBeenCalled();
  });

  it("fails revocation closed when canonical origin configuration is unsafe", async () => {
    mocks.getConfig.mockReturnValue({
      ...disabledConfig,
      origin_configuration_error:
        "NEXT_PUBLIC_SITE_URL is not a safe canonical origin.",
      configuration_error:
        "NEXT_PUBLIC_SITE_URL is not a safe canonical origin.",
    });
    await expect(
      revokeParticipantWalletLink({
        user_id: USER_ID,
        request: request(),
        wallet_id: WALLET_ID,
      }),
    ).rejects.toMatchObject({ code: "WALLET_LINKING_UNAVAILABLE" });
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it("spends the reserved DB attempt before rejecting a malformed proof", async () => {
    mocks.getConfig.mockReturnValue(enabledConfig);
    const built = buildWalletLinkChallenge({
      id: "123e4567-e89b-42d3-a456-426614174001",
      address: ADDRESS,
      session_binding_digest: "a".repeat(64),
      config: enabledConfig,
      now: new Date("2026-08-24T12:00:00.000Z"),
      nonce: "Nonce123456",
    });
    mocks.reserve.mockResolvedValue({
      status: "reserved",
      attempted_at: ATTEMPT_AT,
      challenge: {
        ...built,
        user_id: USER_ID,
        verification_attempt_count: 1,
        verification_last_attempt_at: ATTEMPT_AT,
        consumed_at: null,
        invalidated_at: null,
      },
    });

    await expect(
      verifyParticipantWalletChallenge({
        user_id: USER_ID,
        request: request(),
        challenge_id: built.id,
        message: built.message,
        signature: "not-hex",
        address: ADDRESS,
        chain: "eip155:84532",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(mocks.reserve).toHaveBeenCalledOnce();
  });

  it.each([
    ["challenge_attempt_limited", "CHALLENGE_ATTEMPT_LIMITED"],
    ["user_rate_limited", "VERIFICATION_RATE_LIMITED"],
  ] as const)(
    "maps %s to a typed 429 before proof work",
    async (status, code) => {
      mocks.getConfig.mockReturnValue(enabledConfig);
      mocks.reserve.mockResolvedValue({ status });
      await expect(
        verifyParticipantWalletChallenge({
          user_id: USER_ID,
          request: request(),
          challenge_id: "123e4567-e89b-42d3-a456-426614174001",
          message: "ignored",
          signature: "ignored",
          address: ADDRESS,
          chain: "eip155:84532",
        }),
      ).rejects.toMatchObject({ code, status: 429 });
    },
  );
});
