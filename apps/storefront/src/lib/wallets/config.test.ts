import { describe, expect, it } from "vitest";
import { getWalletLinkConfig, walletLinkAvailability } from "./config";

describe("wallet-link feature configuration", () => {
  it("fails creation closed but keeps revocation available when mode is off", () => {
    for (const value of [undefined, "", "enabled", "mainnet", "TESTNET"]) {
      const config = getWalletLinkConfig({ EVM_WALLET_LINKING_MODE: value });
      expect(config.enabled).toBe(false);
      expect(walletLinkAvailability(config).writes_available).toBe(false);
      expect(walletLinkAvailability(config).revocation_available).toBe(true);
      expect(walletLinkAvailability(config).reason).toBe("feature_disabled");
    }

    const testnet = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: " testnet ",
    });
    expect(testnet.enabled).toBe(true);
    expect(walletLinkAvailability(testnet).writes_available).toBe(true);
    expect(walletLinkAvailability(testnet).revocation_available).toBe(true);
  });

  it("fails closed on an unsafe canonical origin", () => {
    const config = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      NEXT_PUBLIC_SITE_URL: "https://cambridgetcg.com/not-an-origin",
    });
    expect(config.enabled).toBe(false);
    expect(walletLinkAvailability(config)).toMatchObject({
      reason: "configuration_invalid",
      writes_available: false,
      revocation_available: false,
      canonical_origin: "https://cambridgetcg.com",
    });
  });

  it("allows localhost http for testnet development and reports storage truthfully", () => {
    const config = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3001/",
    });
    expect(config).toMatchObject({
      enabled: true,
      origin: "http://localhost:3001",
      domain: "localhost:3001",
      scheme: "http",
    });
    expect(walletLinkAvailability(config, false)).toMatchObject({
      writes_available: false,
      revocation_available: false,
      reason: "storage_unavailable",
      storage_ready: false,
      custody: "none",
      assets_accepted: false,
    });
    expect(walletLinkAvailability(config, false).proof_scope.proves).toEqual([
      expect.stringContaining("Control"),
    ]);
    expect(
      walletLinkAvailability(config, false).proof_scope.does_not_prove,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("identity"),
        expect.stringContaining("KYC"),
        expect.stringContaining("funds"),
      ]),
    );
  });

  it("never invents an RPC processor when none is configured", () => {
    const config = getWalletLinkConfig({ EVM_WALLET_LINKING_MODE: "testnet" });
    expect(config).toMatchObject({
      enabled: true,
      rpc_url: undefined,
      rpc_provider: null,
      rpc_configuration_error: null,
    });
    expect(walletLinkAvailability(config).remote_verification).toEqual({
      available: false,
      provider: null,
    });
  });

  it("requires public processor disclosure before enabling a remote RPC", () => {
    const missingDisclosure = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      BASE_SEPOLIA_RPC_URL: " https://rpc.example.test/base-sepolia ",
    });
    expect(missingDisclosure).toMatchObject({
      enabled: false,
      rpc_url: "https://rpc.example.test/base-sepolia",
      rpc_provider: null,
      rpc_configuration_error: expect.stringContaining("PROVIDER_NAME"),
    });

    const missingPrivacy = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      BASE_SEPOLIA_RPC_URL: "https://rpc.example.test/base-sepolia",
      BASE_SEPOLIA_RPC_PROVIDER_NAME: "Example RPC",
    });
    expect(missingPrivacy).toMatchObject({
      enabled: false,
      rpc_configuration_error: expect.stringContaining("PRIVACY_URL"),
    });

    const configured = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      BASE_SEPOLIA_RPC_URL: "https://rpc.example.test/base-sepolia?key=secret",
      BASE_SEPOLIA_RPC_PROVIDER_NAME: "Example RPC",
      BASE_SEPOLIA_RPC_PRIVACY_URL: "https://provider.example/privacy",
    });
    expect(configured).toMatchObject({
      enabled: true,
      rpc_provider: {
        name: "Example RPC",
        privacy_url: "https://provider.example/privacy",
        external: true,
      },
    });
    const availability = walletLinkAvailability(configured);
    expect(availability.remote_verification).toEqual({
      available: true,
      provider: {
        name: "Example RPC",
        privacy_url: "https://provider.example/privacy",
        external: true,
      },
    });
    expect(JSON.stringify(availability)).not.toContain("key=secret");
  });

  it("rejects non-HTTPS remote RPCs but permits localhost development", () => {
    const unsafe = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      BASE_SEPOLIA_RPC_URL: "http://rpc.example.test/base-sepolia",
    });
    expect(unsafe).toMatchObject({
      enabled: false,
      rpc_url: undefined,
      rpc_configuration_error: expect.stringContaining("HTTPS"),
    });
    expect(walletLinkAvailability(unsafe)).toMatchObject({
      writes_available: false,
      revocation_available: true,
      reason: "configuration_invalid",
    });

    expect(
      getWalletLinkConfig({
        EVM_WALLET_LINKING_MODE: "testnet",
        BASE_SEPOLIA_RPC_URL: "http://localhost:8545",
      }),
    ).toMatchObject({
      enabled: true,
      rpc_url: "http://localhost:8545/",
      rpc_provider: {
        name: "Local development RPC",
        privacy_url: null,
        external: false,
      },
      rpc_configuration_error: null,
    });
  });

  it("rejects disclosure metadata when no RPC exists", () => {
    const config = getWalletLinkConfig({
      EVM_WALLET_LINKING_MODE: "testnet",
      BASE_SEPOLIA_RPC_PROVIDER_NAME: "Stale provider",
      BASE_SEPOLIA_RPC_PRIVACY_URL: "https://provider.example/privacy",
    });
    expect(config).toMatchObject({
      enabled: false,
      rpc_provider: null,
      rpc_configuration_error: expect.stringContaining("must not be configured"),
    });
  });
});
