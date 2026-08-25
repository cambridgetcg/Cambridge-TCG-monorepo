/**
 * Wallet links are attestations of control, not identities or payment
 * instruments.  These types intentionally carry that boundary into every
 * account response so a future escrow surface cannot silently upgrade a
 * five-minute signature into KYC, title to funds, or spending authority.
 */

export const BASE_SEPOLIA_CHAIN_ID = 84_532 as const;
export const BASE_SEPOLIA_CAIP2 = "eip155:84532" as const;
export const WALLET_PROOF_SCOPE_VERSION = "wallet-control-v1" as const;
export const WALLET_LINK_STATEMENT =
  "Link this wallet to your Cambridge TCG account as proof that this session controls it. This does not prove identity, KYC status, ownership of funds, or permission to spend.";

export const WALLET_PROOF_SCOPE = Object.freeze({
  version: WALLET_PROOF_SCOPE_VERSION,
  proves: Object.freeze([
    "Control of this wallet by this Cambridge session at verification time.",
  ]),
  does_not_prove: Object.freeze([
    "Legal or civil identity",
    "KYC, AML, sanctions, or eligibility status",
    "Ownership or lawful source of funds",
    "Permission for Cambridge TCG to move or spend assets",
    "Continuing control after the recorded verification time",
  ]),
});

export type WalletProofKind =
  | "eoa"
  | "erc1271"
  | "erc6492"
  | "smart_contract_unclassified";

export type WalletVerificationMethod =
  | "viem_eoa_local"
  | "viem_base_sepolia_public_client";

export interface WalletLinkRecord {
  id: string;
  user_id: string;
  address: `0x${string}`;
  address_key: `0x${string}`;
  chain_id: typeof BASE_SEPOLIA_CHAIN_ID;
  chain_ref: typeof BASE_SEPOLIA_CAIP2;
  proof_kind: WalletProofKind;
  verification_method: WalletVerificationMethod;
  initial_challenge_id: string;
  last_verified_challenge_id: string;
  linked_at: Date;
  last_verified_at: Date;
  revoked_at: Date | null;
}

export interface WalletLinkPublicRecord {
  id: string;
  address: `0x${string}`;
  chain: typeof BASE_SEPOLIA_CAIP2;
  chain_id: typeof BASE_SEPOLIA_CHAIN_ID;
  proof_kind: WalletProofKind;
  verification_method: WalletVerificationMethod;
  linked_at: string;
  last_verified_at: string;
}

export interface WalletChallengeRecord {
  id: string;
  user_id: string;
  address: `0x${string}`;
  address_key: `0x${string}`;
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
  verification_attempt_count: number;
  verification_last_attempt_at: Date | null;
  consumed_at: Date | null;
  invalidated_at: Date | null;
}

export interface SignatureProof {
  proof_kind: WalletProofKind;
  verification_method: WalletVerificationMethod;
  signature_digest: string;
}

export function toPublicWalletLink(
  link: WalletLinkRecord,
): WalletLinkPublicRecord {
  return {
    id: link.id,
    address: link.address,
    chain: BASE_SEPOLIA_CAIP2,
    chain_id: BASE_SEPOLIA_CHAIN_ID,
    proof_kind: link.proof_kind,
    verification_method: link.verification_method,
    linked_at: link.linked_at.toISOString(),
    last_verified_at: link.last_verified_at.toISOString(),
  };
}
