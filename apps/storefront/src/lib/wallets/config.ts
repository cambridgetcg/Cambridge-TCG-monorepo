import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  WALLET_PROOF_SCOPE,
} from "./types";

const DEFAULT_CANONICAL_ORIGIN = "https://cambridgetcg.com";

export interface WalletLinkConfig {
  enabled: boolean;
  mode: "testnet" | "disabled";
  origin: string;
  domain: string;
  scheme: string;
  rpc_url: string | undefined;
  origin_configuration_error: string | null;
  rpc_configuration_error: string | null;
  configuration_error: string | null;
}

export interface WalletLinkEnvironment {
  EVM_WALLET_LINKING_MODE?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  BASE_SEPOLIA_RPC_URL?: string;
}

export interface WalletLinkAvailability {
  mode: "testnet" | "disabled";
  writes_available: boolean;
  revocation_available: boolean;
  reason:
    | "feature_disabled"
    | "configuration_invalid"
    | "storage_unavailable"
    | null;
  storage_ready: boolean;
  canonical_origin: string;
  canonical_domain: string;
  network: {
    caip2: typeof BASE_SEPOLIA_CAIP2;
    chain_id: typeof BASE_SEPOLIA_CHAIN_ID;
    name: "Base Sepolia";
    testnet: true;
  };
  custody: "none";
  assets_accepted: false;
  proof_scope: typeof WALLET_PROOF_SCOPE;
}

function canonicalOrigin(raw: string): {
  origin: string;
  domain: string;
  scheme: string;
  error: string | null;
} {
  try {
    const url = new URL(raw);
    const scheme = url.protocol.slice(0, -1);
    const isLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      (scheme !== "https" && !(scheme === "http" && isLocal)) ||
      url.username ||
      url.password
    ) {
      throw new Error(
        "origin must use https (http is allowed only for localhost)",
      );
    }
    if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
      throw new Error("origin must not contain a path, query, or fragment");
    }
    return { origin: url.origin, domain: url.host, scheme, error: null };
  } catch {
    const fallback = new URL(DEFAULT_CANONICAL_ORIGIN);
    return {
      origin: fallback.origin,
      domain: fallback.host,
      scheme: fallback.protocol.slice(0, -1),
      error: "NEXT_PUBLIC_SITE_URL is not a safe canonical origin.",
    };
  }
}

function configuredRpcUrl(raw: string | undefined): {
  url: string | undefined;
  error: string | null;
} {
  const value = raw?.trim();
  if (!value) return { url: undefined, error: null };
  try {
    const url = new URL(value);
    const isLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("RPC must use HTTPS, except HTTP on localhost");
    }
    return { url: url.toString(), error: null };
  } catch {
    return {
      url: undefined,
      error:
        "BASE_SEPOLIA_RPC_URL must be an HTTPS URL (HTTP is allowed only for localhost).",
    };
  }
}

export function getWalletLinkConfig(
  env: WalletLinkEnvironment = process.env as WalletLinkEnvironment,
): WalletLinkConfig {
  const configuredMode = env.EVM_WALLET_LINKING_MODE?.trim();
  const canonical = canonicalOrigin(
    env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_CANONICAL_ORIGIN,
  );
  const rpc = configuredRpcUrl(env.BASE_SEPOLIA_RPC_URL);
  const mode = configuredMode === "testnet" ? "testnet" : "disabled";
  const configurationError = canonical.error ?? rpc.error;
  return {
    enabled: mode === "testnet" && configurationError === null,
    mode,
    origin: canonical.origin,
    domain: canonical.domain,
    scheme: canonical.scheme,
    rpc_url: rpc.url,
    origin_configuration_error: canonical.error,
    rpc_configuration_error: rpc.error,
    configuration_error: configurationError,
  };
}

export function walletLinkAvailability(
  config: WalletLinkConfig = getWalletLinkConfig(),
  storageReady = true,
): WalletLinkAvailability {
  const reason = !storageReady
    ? "storage_unavailable"
    : config.configuration_error
      ? "configuration_invalid"
      : config.mode !== "testnet"
        ? "feature_disabled"
        : null;
  return {
    mode: config.mode,
    writes_available: config.enabled && storageReady,
    // Disabling new proofs must not trap a participant's existing link.
    // Revocation needs safe origin configuration and storage, not issuance.
    revocation_available:
      config.origin_configuration_error === null && storageReady,
    reason,
    storage_ready: storageReady,
    canonical_origin: config.origin,
    canonical_domain: config.domain,
    network: {
      caip2: BASE_SEPOLIA_CAIP2,
      chain_id: BASE_SEPOLIA_CHAIN_ID,
      name: "Base Sepolia",
      testnet: true,
    },
    custody: "none",
    assets_accepted: false,
    proof_scope: WALLET_PROOF_SCOPE,
  };
}
