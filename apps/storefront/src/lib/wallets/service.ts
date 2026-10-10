import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { getWalletLinkConfig, type WalletLinkConfig } from "./config";
import {
  finalizeVerifiedWalletLink,
  listActiveWalletLinks,
  reserveWalletVerificationAttempt,
  revokeOwnedWalletLink,
  storeWalletLinkChallenge,
} from "./db";
import { WalletLinkError } from "./errors";
import {
  assertBaseSepoliaChain,
  buildWalletLinkChallenge,
  validateWalletLinkMessage,
  verifyWalletLinkSignature,
} from "./proof";
import { assertCanonicalOrigin, sessionBindingDigest } from "./session-binding";
import {
  BASE_SEPOLIA_CAIP2,
  BASE_SEPOLIA_CHAIN_ID,
  WALLET_PROOF_SCOPE,
  toPublicWalletLink,
  type WalletLinkPublicRecord,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireCanonicalConfiguration(config: WalletLinkConfig): void {
  if (config.origin_configuration_error) {
    throw new WalletLinkError(
      "WALLET_LINKING_UNAVAILABLE",
      "Wallet linking is unavailable because its canonical origin is not safely configured.",
      503,
    );
  }
}

function requireEnabled(config: WalletLinkConfig): void {
  requireCanonicalConfiguration(config);
  if (config.rpc_configuration_error) {
    throw new WalletLinkError(
      "WALLET_LINKING_UNAVAILABLE",
      "Wallet linking is unavailable because its Base Sepolia RPC URL is not safely configured.",
      503,
    );
  }
  if (!config.enabled) {
    throw new WalletLinkError(
      "WALLET_LINKING_UNAVAILABLE",
      "Wallet linking is unavailable unless EVM_WALLET_LINKING_MODE=testnet.",
      503,
    );
  }
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new WalletLinkError(
      "INVALID_REQUEST",
      `${label} must be a UUID.`,
      400,
    );
  }
  return value;
}

export async function listParticipantWalletLinks(
  userId: string,
): Promise<WalletLinkPublicRecord[]> {
  return (await listActiveWalletLinks(userId)).map(toPublicWalletLink);
}

export async function issueParticipantWalletChallenge(args: {
  user_id: string;
  request: Request;
  address: unknown;
  chain: unknown;
  chain_id?: unknown;
  now?: Date;
}): Promise<{
  id: string;
  message: string;
  address: Address;
  chain: typeof BASE_SEPOLIA_CAIP2;
  chain_id: typeof BASE_SEPOLIA_CHAIN_ID;
  domain: string;
  origin: string;
  issued_at: string;
  expires_at: string;
  statement: string;
  proof_scope: typeof WALLET_PROOF_SCOPE;
}> {
  const config = getWalletLinkConfig();
  requireEnabled(config);
  assertCanonicalOrigin(args.request, config);
  assertBaseSepoliaChain(args.chain, args.chain_id);
  const bindingDigest = sessionBindingDigest(args.request);
  const built = buildWalletLinkChallenge({
    id: randomUUID(),
    address: args.address,
    session_binding_digest: bindingDigest,
    config,
    now: args.now,
  });
  const stored = await storeWalletLinkChallenge({
    user_id: args.user_id,
    challenge: built,
  });
  if (stored.status === "rate_limited") {
    throw new WalletLinkError(
      "CHALLENGE_RATE_LIMITED",
      "Too many wallet-link challenges were requested. Try again later.",
      429,
    );
  }
  const challenge = stored.challenge;
  return {
    id: challenge.id,
    message: challenge.message,
    address: challenge.address,
    chain: BASE_SEPOLIA_CAIP2,
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    domain: challenge.domain,
    origin: challenge.origin,
    issued_at: challenge.issued_at.toISOString(),
    expires_at: challenge.expires_at.toISOString(),
    statement: challenge.statement,
    proof_scope: WALLET_PROOF_SCOPE,
  };
}

export async function verifyParticipantWalletChallenge(args: {
  user_id: string;
  request: Request;
  challenge_id: unknown;
  message: unknown;
  signature: unknown;
  address: unknown;
  chain: unknown;
  now?: Date;
}): Promise<{
  created: boolean;
  wallet: WalletLinkPublicRecord;
}> {
  const config = getWalletLinkConfig();
  requireEnabled(config);
  assertCanonicalOrigin(args.request, config);
  const bindingDigest = sessionBindingDigest(args.request);
  const challengeId = requireUuid(args.challenge_id, "challenge_id");
  // This transaction commits before any message validation, EOA recovery or
  // RPC classification. Every later rejection therefore spends the reserved
  // attempt instead of rolling it back with proof work.
  const reservation = await reserveWalletVerificationAttempt({
    id: challengeId,
    user_id: args.user_id,
    session_binding_digest: bindingDigest,
    ...(args.now ? { now: new Date(args.now) } : {}),
  });
  switch (reservation.status) {
    case "not_found":
      throw new WalletLinkError(
        "CHALLENGE_NOT_FOUND",
        "Wallet-link challenge not found for this Cambridge session.",
        404,
      );
    case "consumed":
      throw new WalletLinkError(
        "CHALLENGE_USED",
        "This wallet-link challenge has already been used.",
        409,
      );
    case "invalidated":
      throw new WalletLinkError(
        "CHALLENGE_INVALIDATED",
        "This wallet-link challenge was replaced by a newer one.",
        409,
      );
    case "expired":
      throw new WalletLinkError(
        "CHALLENGE_EXPIRED",
        "This wallet-link challenge expired. Request a new one.",
        410,
      );
    case "challenge_attempt_limited":
      throw new WalletLinkError(
        "CHALLENGE_ATTEMPT_LIMITED",
        "This wallet-link challenge has reached its verification-attempt limit. Request a new one.",
        429,
      );
    case "user_rate_limited":
      throw new WalletLinkError(
        "VERIFICATION_RATE_LIMITED",
        "Too many wallet verification attempts were made. Try again later.",
        429,
      );
    case "reserved":
      break;
  }
  const challenge = reservation.challenge;
  const address = validateWalletLinkMessage({
    challenge,
    message: args.message,
    address: args.address,
    chain: args.chain,
    config,
    now: reservation.attempted_at,
  });
  const proof = await verifyWalletLinkSignature({
    address,
    message: challenge.message,
    signature: args.signature,
    config,
  });
  // In production the finalizer reads PostgreSQL's wall clock only after
  // re-locking the challenge, so RPC time or a row-lock wait cannot extend
  // the signed five-minute lifetime. Tests may inject one deterministic clock
  // through both phases.
  const finalized = await finalizeVerifiedWalletLink({
    challenge,
    proof,
    ...(args.now ? { now: new Date(args.now) } : {}),
  });
  switch (finalized.status) {
    case "linked":
      return {
        created: finalized.created,
        wallet: toPublicWalletLink(finalized.link),
      };
    case "conflict":
      throw new WalletLinkError(
        "WALLET_ALREADY_LINKED",
        "This wallet is actively linked to another Cambridge account. Revoke that link before trying again.",
        409,
      );
    case "consumed":
      throw new WalletLinkError(
        "CHALLENGE_USED",
        "This wallet-link challenge has already been used.",
        409,
      );
    case "invalidated":
      throw new WalletLinkError(
        "CHALLENGE_INVALIDATED",
        "This wallet-link challenge was replaced by a newer one.",
        409,
      );
    case "expired":
      throw new WalletLinkError(
        "CHALLENGE_EXPIRED",
        "This wallet-link challenge expired. Request a new one.",
        410,
      );
    case "not_found":
      throw new WalletLinkError(
        "CHALLENGE_NOT_FOUND",
        "Wallet-link challenge not found for this Cambridge session.",
        404,
      );
    case "changed":
      throw new WalletLinkError(
        "MESSAGE_MISMATCH",
        "The wallet-link challenge changed before it could be consumed.",
        409,
      );
  }
}

export async function revokeParticipantWalletLink(args: {
  user_id: string;
  request: Request;
  wallet_id: unknown;
  now?: Date;
}): Promise<{ revoked: true; already_revoked: boolean; wallet_id: string }> {
  const config = getWalletLinkConfig();
  // Turning off new challenge issuance is not authority to trap an existing
  // participant link. Revocation remains authenticated, same-origin,
  // exact-session and participant-scoped while the registry is reachable.
  requireCanonicalConfiguration(config);
  assertCanonicalOrigin(args.request, config);
  // A successful Auth.js callback plus possession of the same database-session
  // cookie is required. The digest is intentionally discarded for revocation;
  // its role here is to reject ambiguous or synthetic cookie state.
  sessionBindingDigest(args.request);
  const walletId = requireUuid(args.wallet_id, "wallet_id");
  const result = await revokeOwnedWalletLink({
    id: walletId,
    user_id: args.user_id,
    now: args.now ? new Date(args.now) : new Date(),
  });
  if (result.status === "not_found") {
    throw new WalletLinkError(
      "WALLET_LINK_NOT_FOUND",
      "Wallet link not found.",
      404,
    );
  }
  return {
    revoked: true,
    already_revoked: result.already_revoked,
    wallet_id: result.id,
  };
}
