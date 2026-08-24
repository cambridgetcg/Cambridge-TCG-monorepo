import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { parseSiweMessage } from "viem/siwe";
import type { WalletLinkConfig } from "./config";
import {
  buildWalletLinkChallenge,
  canonicalizeEvmAddress,
  validateWalletLinkMessage,
  verifyWalletLinkSignature,
} from "./proof";
import { sha256Hex } from "./session-binding";
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  type WalletChallengeRecord,
} from "./types";

const PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const now = new Date("2026-08-23T12:00:00.000Z");
const config: WalletLinkConfig = {
  enabled: true,
  mode: "testnet",
  origin: "https://cambridgetcg.com",
  domain: "cambridgetcg.com",
  scheme: "https",
  rpc_url: undefined,
  origin_configuration_error: null,
  rpc_configuration_error: null,
  configuration_error: null,
};

function record(
  overrides: Partial<WalletChallengeRecord> = {},
  challengeConfig = config,
): WalletChallengeRecord {
  const built = buildWalletLinkChallenge({
    id: "123e4567-e89b-42d3-a456-426614174001",
    address: account.address.toLowerCase(),
    session_binding_digest: "a".repeat(64),
    config: challengeConfig,
    now,
    nonce: "Nonce123456",
  });
  return {
    ...built,
    user_id: "123e4567-e89b-42d3-a456-426614174099",
    consumed_at: null,
    invalidated_at: null,
    verification_attempt_count: 0,
    verification_last_attempt_at: null,
    ...overrides,
  };
}

describe("EIP-4361 wallet control proof", () => {
  it("canonicalizes addresses through viem and accepts a real EOA signature", async () => {
    const challenge = record();
    expect(canonicalizeEvmAddress(account.address.toLowerCase())).toBe(
      account.address,
    );
    const validatedAddress = validateWalletLinkMessage({
      challenge,
      message: challenge.message,
      address: account.address.toLowerCase(),
      chain: BASE_SEPOLIA_CAIP2,
      config,
      now: new Date(now.getTime() + 1_000),
    });
    const signature = await account.signMessage({ message: challenge.message });
    const proof = await verifyWalletLinkSignature({
      address: validatedAddress,
      message: challenge.message,
      signature,
      config,
    });
    expect(proof).toMatchObject({
      proof_kind: "eoa",
      verification_method: "viem_eoa_local",
    });
  });

  it("rejects the wrong chain, address, domain, nonce and exact message", () => {
    const challenge = record();
    const common = {
      challenge,
      message: challenge.message,
      address: challenge.address,
      chain: BASE_SEPOLIA_CAIP2,
      config,
      now: new Date(now.getTime() + 1_000),
    };
    expect(() =>
      validateWalletLinkMessage({ ...common, chain: "eip155:1" }),
    ).toThrowError(expect.objectContaining({ code: "UNSUPPORTED_CHAIN" }));
    expect(() =>
      validateWalletLinkMessage({
        ...common,
        address: "0x0000000000000000000000000000000000000000",
      }),
    ).toThrowError(expect.objectContaining({ code: "ADDRESS_MISMATCH" }));
    expect(() =>
      validateWalletLinkMessage({
        ...common,
        message: challenge.message.replace(
          "cambridgetcg.com",
          "attacker.example",
        ),
      }),
    ).toThrowError(expect.objectContaining({ code: "MESSAGE_MISMATCH" }));

    const wrongDomainConfig = {
      ...config,
      domain: "attacker.example",
      origin: "https://attacker.example",
    };
    const wrongDomainChallenge = record({}, wrongDomainConfig);
    expect(() =>
      validateWalletLinkMessage({
        ...common,
        challenge: wrongDomainChallenge,
        message: wrongDomainChallenge.message,
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_SIWE_MESSAGE" }));
    expect(() =>
      validateWalletLinkMessage({
        ...common,
        challenge: { ...challenge, nonce_digest: sha256Hex("DifferentNonce9") },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_SIWE_MESSAGE" }));
  });

  it("rejects expiration, invalidation and replay", () => {
    const challenge = record();
    expect(() =>
      validateWalletLinkMessage({
        challenge,
        message: challenge.message,
        address: challenge.address,
        chain: BASE_SEPOLIA_CAIP2,
        config,
        now: challenge.expires_at,
      }),
    ).toThrowError(expect.objectContaining({ code: "CHALLENGE_EXPIRED" }));
    expect(() =>
      validateWalletLinkMessage({
        challenge: { ...challenge, consumed_at: new Date(now.getTime() + 500) },
        message: challenge.message,
        address: challenge.address,
        chain: BASE_SEPOLIA_CAIP2,
        config,
        now: new Date(now.getTime() + 1_000),
      }),
    ).toThrowError(expect.objectContaining({ code: "CHALLENGE_USED" }));
    expect(() =>
      validateWalletLinkMessage({
        challenge: {
          ...challenge,
          invalidated_at: new Date(now.getTime() + 500),
        },
        message: challenge.message,
        address: challenge.address,
        chain: BASE_SEPOLIA_CAIP2,
        config,
        now: new Date(now.getTime() + 1_000),
      }),
    ).toThrowError(expect.objectContaining({ code: "CHALLENGE_INVALIDATED" }));
  });

  it("uses the Base Sepolia public client path for ERC-1271", async () => {
    const challenge = record();
    const getChainId = vi.fn().mockResolvedValue(BASE_SEPOLIA_CHAIN_ID);
    const getCode = vi.fn().mockResolvedValue("0x60016000");
    const verifyPublic = vi.fn().mockResolvedValue(true);
    const proof = await verifyWalletLinkSignature({
      address: challenge.address,
      message: challenge.message,
      signature: `0x${"11".repeat(65)}`,
      config,
      dependencies: {
        verify_eoa: vi.fn().mockResolvedValue(false),
        get_chain_id: getChainId,
        verify_public_client: verifyPublic,
        get_code: getCode,
      },
    });
    expect(verifyPublic).toHaveBeenCalledWith(
      expect.objectContaining({
        address: challenge.address,
        message: challenge.message,
      }),
    );
    expect(getChainId.mock.invocationCallOrder[0]).toBeLessThan(
      getCode.mock.invocationCallOrder[0] ?? 0,
    );
    expect(getCode.mock.invocationCallOrder[0]).toBeLessThan(
      verifyPublic.mock.invocationCallOrder[0] ?? 0,
    );
    expect(proof).toMatchObject({
      proof_kind: "erc1271",
      verification_method: "viem_base_sepolia_public_client",
    });
  });

  it("fails loudly when smart-wallet verification cannot reach Base Sepolia", async () => {
    const challenge = record();
    await expect(
      verifyWalletLinkSignature({
        address: challenge.address,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        config,
        dependencies: {
          verify_eoa: vi.fn().mockResolvedValue(false),
          get_chain_id: vi.fn().mockResolvedValue(BASE_SEPOLIA_CHAIN_ID),
          get_code: vi.fn().mockResolvedValue("0x60016000"),
          verify_public_client: vi
            .fn()
            .mockRejectedValue(new Error("rpc unavailable")),
        },
      }),
    ).rejects.toMatchObject({ code: "SIGNATURE_VERIFICATION_UNAVAILABLE" });
  });

  it("does not fall back to an unnamed public RPC for smart wallets", async () => {
    const challenge = record();
    const getCode = vi.fn();
    await expect(
      verifyWalletLinkSignature({
        address: challenge.address,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        config,
        dependencies: {
          verify_eoa: vi.fn().mockResolvedValue(false),
          get_code: getCode,
        },
      }),
    ).rejects.toMatchObject({
      code: "SIGNATURE_VERIFICATION_UNAVAILABLE",
      message: expect.stringContaining("configured RPC"),
    });
    expect(getCode).not.toHaveBeenCalled();
  });

  it("rejects a configured RPC that does not report Base Sepolia", async () => {
    const challenge = record();
    const getCode = vi.fn();
    const verifyPublic = vi.fn();
    await expect(
      verifyWalletLinkSignature({
        address: challenge.address,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        config,
        dependencies: {
          verify_eoa: vi.fn().mockResolvedValue(false),
          get_chain_id: vi.fn().mockResolvedValue(1),
          get_code: getCode,
          verify_public_client: verifyPublic,
        },
      }),
    ).rejects.toMatchObject({ code: "RPC_CHAIN_MISMATCH" });
    expect(getCode).not.toHaveBeenCalled();
    expect(verifyPublic).not.toHaveBeenCalled();
  });

  it("does not disclose an invalid EOA proof to the RPC verifier", async () => {
    const challenge = record();
    const getCode = vi.fn().mockResolvedValue("0x");
    const verifyPublic = vi.fn();
    await expect(
      verifyWalletLinkSignature({
        address: challenge.address,
        message: challenge.message,
        signature: `0x${"11".repeat(65)}`,
        config,
        dependencies: {
          verify_eoa: vi.fn().mockResolvedValue(false),
          get_chain_id: vi.fn().mockResolvedValue(BASE_SEPOLIA_CHAIN_ID),
          get_code: getCode,
          verify_public_client: verifyPublic,
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    expect(getCode).toHaveBeenCalledWith(challenge.address);
    expect(verifyPublic).not.toHaveBeenCalled();
  });

  it("routes locally identified ERC-6492 proofs to the pinned RPC", async () => {
    const challenge = record();
    const signature = `0x${"11".repeat(65)}${"6492".repeat(16)}` as const;
    const getCode = vi.fn().mockResolvedValue("0x");
    const verifyPublic = vi.fn().mockResolvedValue(true);
    const proof = await verifyWalletLinkSignature({
      address: challenge.address,
      message: challenge.message,
      signature,
      config,
      dependencies: {
        verify_eoa: vi.fn().mockResolvedValue(false),
        get_chain_id: vi.fn().mockResolvedValue(BASE_SEPOLIA_CHAIN_ID),
        get_code: getCode,
        verify_public_client: verifyPublic,
      },
    });
    expect(getCode).toHaveBeenCalledWith(challenge.address);
    expect(verifyPublic).toHaveBeenCalledWith(
      expect.objectContaining({ signature, message: challenge.message }),
    );
    expect(proof).toMatchObject({ proof_kind: "erc6492" });
  });

  it("pins the SIWE message to Base Sepolia", () => {
    const challenge = record();
    const parsed = parseSiweMessage(challenge.message);
    expect(challenge.chain_id).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(challenge.chain_ref).toBe(BASE_SEPOLIA_CAIP2);
    expect(challenge.expires_at.getTime() - challenge.issued_at.getTime()).toBe(
      300_000,
    );
    expect(challenge.request_id).toBe(challenge.id);
    expect(parsed.requestId).toBe(challenge.id);
    expect(challenge.message).not.toContain(challenge.session_binding_digest);
    expect(challenge.message).toContain(`Chain ID: ${BASE_SEPOLIA_CHAIN_ID}`);
  });
});
