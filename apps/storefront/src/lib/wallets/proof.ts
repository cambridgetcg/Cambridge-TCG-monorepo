import {
  createPublicClient,
  getAddress,
  http,
  isAddressEqual,
  isErc6492Signature,
  isHex,
  verifyMessage as verifyEoaMessage,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  createSiweMessage,
  generateSiweNonce,
  parseSiweMessage,
  validateSiweMessage,
} from "viem/siwe";
import type { WalletLinkConfig } from "./config";
import { WalletLinkError } from "./errors";
import { sha256Hex } from "./session-binding";
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  WALLET_LINK_STATEMENT,
  type SignatureProof,
  type WalletChallengeRecord,
  type WalletProofKind,
} from "./types";

export const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const MAX_MESSAGE_LENGTH = 4_096;
const MAX_SIGNATURE_LENGTH = 8_194;

export interface BuiltWalletChallenge {
  id: string;
  address: Address;
  address_key: Address;
  chain_id: typeof BASE_SEPOLIA_CHAIN_ID;
  chain_ref: typeof BASE_SEPOLIA_CAIP2;
  nonce_digest: string;
  session_binding_digest: string;
  request_id: string;
  domain: string;
  origin: string;
  statement: string;
  message: string;
  issued_at: Date;
  expires_at: Date;
}

export interface SignatureVerificationDependencies {
  verify_eoa?: (parameters: {
    address: Address;
    message: string;
    signature: Hex;
  }) => Promise<boolean>;
  verify_public_client?: (parameters: {
    address: Address;
    message: string;
    signature: Hex;
  }) => Promise<boolean>;
  get_chain_id?: () => Promise<number>;
  get_code?: (address: Address) => Promise<Hex | undefined>;
}

export function canonicalizeEvmAddress(value: unknown): Address {
  if (typeof value !== "string") {
    throw new WalletLinkError(
      "INVALID_ADDRESS",
      "A valid EVM wallet address is required.",
      400,
    );
  }
  try {
    return getAddress(value.trim());
  } catch {
    throw new WalletLinkError(
      "INVALID_ADDRESS",
      "A valid EVM wallet address is required.",
      400,
    );
  }
}

export function assertBaseSepoliaChain(
  chain: unknown,
  chainId?: unknown,
): void {
  if (chain !== BASE_SEPOLIA_CAIP2) {
    throw new WalletLinkError(
      "UNSUPPORTED_CHAIN",
      `Wallet linking is limited to ${BASE_SEPOLIA_CAIP2} (Base Sepolia).`,
      400,
    );
  }
  if (chainId !== undefined && Number(chainId) !== BASE_SEPOLIA_CHAIN_ID) {
    throw new WalletLinkError(
      "UNSUPPORTED_CHAIN",
      `Wallet linking is limited to chain ID ${BASE_SEPOLIA_CHAIN_ID}.`,
      400,
    );
  }
}

export function walletChallengeRequestId(challengeId: string): string {
  // Session ownership is enforced through a separate server-held digest and
  // database predicate. Keep the wallet-visible SIWE request ID random and
  // challenge-scoped instead of exposing a stable session pseudonym.
  return challengeId;
}

export function buildWalletLinkChallenge(args: {
  id: string;
  address: unknown;
  session_binding_digest: string;
  config: WalletLinkConfig;
  now?: Date;
  nonce?: string;
}): BuiltWalletChallenge {
  const address = canonicalizeEvmAddress(args.address);
  const addressKey = address.toLowerCase() as Address;
  const issuedAt = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(issuedAt.getTime())) {
    throw new WalletLinkError(
      "INVALID_REQUEST",
      "Challenge time is invalid.",
      400,
    );
  }
  const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_MS);
  const nonce = args.nonce ?? generateSiweNonce();
  const requestId = walletChallengeRequestId(args.id);
  const message = createSiweMessage({
    address,
    chainId: BASE_SEPOLIA_CHAIN_ID,
    domain: args.config.domain,
    expirationTime: expiresAt,
    issuedAt,
    nonce,
    requestId,
    scheme: args.config.scheme,
    statement: WALLET_LINK_STATEMENT,
    uri: args.config.origin,
    version: "1",
  });
  return {
    id: args.id,
    address,
    address_key: addressKey,
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    chain_ref: BASE_SEPOLIA_CAIP2,
    nonce_digest: sha256Hex(nonce),
    session_binding_digest: args.session_binding_digest,
    request_id: requestId,
    domain: args.config.domain,
    origin: args.config.origin,
    statement: WALLET_LINK_STATEMENT,
    message,
    issued_at: issuedAt,
    expires_at: expiresAt,
  };
}

function sameTime(left: Date | undefined, right: Date): boolean {
  return (
    left instanceof Date &&
    !Number.isNaN(left.getTime()) &&
    left.getTime() === right.getTime()
  );
}

/**
 * Validate every EIP-4361 field against server-held challenge truth.  Exact
 * message equality is checked first, then viem parses and validates the
 * structure; manual checks cover fields validateSiweMessage intentionally
 * leaves to the relying party (chain, URI, statement and request ID).
 */
export function validateWalletLinkMessage(args: {
  challenge: WalletChallengeRecord;
  message: unknown;
  address: unknown;
  chain: unknown;
  config: WalletLinkConfig;
  now?: Date;
}): Address {
  assertBaseSepoliaChain(args.chain);
  const submittedAddress = canonicalizeEvmAddress(args.address);
  if (!isAddressEqual(submittedAddress, args.challenge.address)) {
    throw new WalletLinkError(
      "ADDRESS_MISMATCH",
      "The signing wallet does not match this challenge.",
      400,
    );
  }
  if (
    typeof args.message !== "string" ||
    args.message.length > MAX_MESSAGE_LENGTH
  ) {
    throw new WalletLinkError(
      "INVALID_SIWE_MESSAGE",
      "The SIWE message is invalid.",
      400,
    );
  }
  if (args.message !== args.challenge.message) {
    throw new WalletLinkError(
      "MESSAGE_MISMATCH",
      "The signed message must exactly match the issued challenge.",
      400,
    );
  }

  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new WalletLinkError(
      "INVALID_REQUEST",
      "Verification time is invalid.",
      400,
    );
  }
  if (args.challenge.invalidated_at) {
    throw new WalletLinkError(
      "CHALLENGE_INVALIDATED",
      "This wallet-link challenge was replaced by a newer one.",
      409,
    );
  }
  if (args.challenge.consumed_at) {
    throw new WalletLinkError(
      "CHALLENGE_USED",
      "This wallet-link challenge has already been used.",
      409,
    );
  }
  if (now.getTime() >= args.challenge.expires_at.getTime()) {
    throw new WalletLinkError(
      "CHALLENGE_EXPIRED",
      "This wallet-link challenge expired. Request a new one.",
      410,
    );
  }

  const parsed = parseSiweMessage(args.message);
  const parsedNonce = parsed.nonce;
  const structurallyValid =
    typeof parsedNonce === "string" &&
    validateSiweMessage({
      address: args.challenge.address,
      domain: args.config.domain,
      message: parsed,
      nonce: parsedNonce,
      scheme: args.config.scheme,
      time: now,
    });

  const fieldsMatch =
    structurallyValid &&
    args.challenge.chain_id === BASE_SEPOLIA_CHAIN_ID &&
    args.challenge.chain_ref === BASE_SEPOLIA_CAIP2 &&
    parsed.version === "1" &&
    parsed.chainId === BASE_SEPOLIA_CHAIN_ID &&
    parsed.uri === args.config.origin &&
    parsed.domain === args.challenge.domain &&
    parsed.statement === args.challenge.statement &&
    parsed.requestId === args.challenge.request_id &&
    parsed.notBefore === undefined &&
    parsed.resources === undefined &&
    sameTime(parsed.issuedAt, args.challenge.issued_at) &&
    sameTime(parsed.expirationTime, args.challenge.expires_at) &&
    args.challenge.expires_at.getTime() - args.challenge.issued_at.getTime() ===
      WALLET_CHALLENGE_TTL_MS &&
    now.getTime() >= args.challenge.issued_at.getTime() &&
    sha256Hex(parsedNonce ?? "") === args.challenge.nonce_digest;

  if (!fieldsMatch) {
    throw new WalletLinkError(
      "INVALID_SIWE_MESSAGE",
      "The SIWE message does not match the issued domain, chain, nonce, session, or lifetime.",
      400,
    );
  }
  return submittedAddress;
}

function publicClientDependencies(
  rpcUrl: string,
): Required<
  Pick<
    SignatureVerificationDependencies,
    "verify_public_client" | "get_chain_id" | "get_code"
  >
> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl, { retryCount: 1, timeout: 6_000 }),
  });
  return {
    verify_public_client: (parameters) => client.verifyMessage(parameters),
    get_chain_id: () => client.getChainId(),
    get_code: (address) => client.getCode({ address }),
  };
}

export function normalizeWalletSignature(value: unknown): Hex {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length > MAX_SIGNATURE_LENGTH ||
    !isHex(value, { strict: true })
  ) {
    throw new WalletLinkError(
      "INVALID_SIGNATURE",
      "A valid hexadecimal wallet signature is required.",
      400,
    );
  }
  return value as Hex;
}

export async function verifyWalletLinkSignature(args: {
  address: Address;
  message: string;
  signature: unknown;
  config: WalletLinkConfig;
  dependencies?: SignatureVerificationDependencies;
}): Promise<SignatureProof> {
  const signature = normalizeWalletSignature(args.signature);
  const verifyEoa = args.dependencies?.verify_eoa ?? verifyEoaMessage;
  let eoaValid = false;
  try {
    eoaValid = await verifyEoa({
      address: args.address,
      message: args.message,
      signature,
    });
  } catch {
    eoaValid = false;
  }
  if (eoaValid) {
    return {
      proof_kind: "eoa",
      verification_method: "viem_eoa_local",
      signature_digest: sha256Hex(signature.toLowerCase()),
    };
  }

  // `http(undefined)` silently selects viem's public Base RPC. Do not disclose
  // the address, exact challenge and signature to an unnamed third party.
  // EOA verification above stays local; smart-wallet verification requires an
  // explicitly configured processor (test dependencies may inject one).
  const defaults = args.config.rpc_url
    ? publicClientDependencies(args.config.rpc_url)
    : undefined;
  const verifyPublic =
    args.dependencies?.verify_public_client ?? defaults?.verify_public_client;
  const getChainId = args.dependencies?.get_chain_id ?? defaults?.get_chain_id;
  const getCode = args.dependencies?.get_code ?? defaults?.get_code;
  if (!getChainId || !getCode) {
    throw new WalletLinkError(
      "SIGNATURE_VERIFICATION_UNAVAILABLE",
      "Base Sepolia smart-wallet verification requires a configured RPC service.",
      503,
    );
  }

  let rpcChainId: number;
  try {
    rpcChainId = await getChainId();
  } catch {
    throw new WalletLinkError(
      "SIGNATURE_VERIFICATION_UNAVAILABLE",
      "The configured Base Sepolia RPC service is temporarily unavailable.",
      503,
    );
  }
  if (rpcChainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new WalletLinkError(
      "RPC_CHAIN_MISMATCH",
      `The configured wallet RPC reports chain ${rpcChainId}, not Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}).`,
      503,
    );
  }

  let code: Hex | undefined;
  try {
    // Address-only classification comes before any remote proof disclosure.
    code = await getCode(args.address);
  } catch {
    throw new WalletLinkError(
      "SIGNATURE_VERIFICATION_UNAVAILABLE",
      "Base Sepolia wallet classification is temporarily unavailable. Please retry.",
      503,
    );
  }
  const hasDeployedCode = code !== undefined && code !== "0x";
  const isCounterfactual = isErc6492Signature(signature);
  if (!hasDeployedCode && !isCounterfactual) {
    throw new WalletLinkError(
      "INVALID_SIGNATURE",
      "The wallet did not produce a valid signature for this challenge.",
      422,
    );
  }
  if (!verifyPublic) {
    throw new WalletLinkError(
      "SIGNATURE_VERIFICATION_UNAVAILABLE",
      "Base Sepolia smart-wallet verification requires a configured RPC service.",
      503,
    );
  }
  let smartWalletValid: boolean;
  try {
    smartWalletValid = await verifyPublic({
      address: args.address,
      message: args.message,
      signature,
    });
  } catch {
    throw new WalletLinkError(
      "SIGNATURE_VERIFICATION_UNAVAILABLE",
      "Base Sepolia smart-wallet verification is temporarily unavailable. Please retry.",
      503,
    );
  }
  if (!smartWalletValid) {
    throw new WalletLinkError(
      "INVALID_SIGNATURE",
      "The wallet did not produce a valid signature for this challenge.",
      422,
    );
  }

  const proofKind: WalletProofKind = hasDeployedCode ? "erc1271" : "erc6492";
  return {
    proof_kind: proofKind,
    verification_method: "viem_base_sepolia_public_client",
    signature_digest: sha256Hex(signature.toLowerCase()),
  };
}
