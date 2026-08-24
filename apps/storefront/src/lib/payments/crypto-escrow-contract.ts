/**
 * Crypto escrow integration contract.
 *
 * This is deliberately a boundary, not a payment implementation. It gives a
 * future provider/contract adapter one vocabulary and one set of invariants
 * without teaching the storefront that a submitted transaction is payment.
 *
 * v1 is Base Sepolia only and uses Circle's no-value test USDC. There is no
 * mainnet configuration, custody key, deployed escrow contract, checkout API,
 * or trade-state mutation in this module.
 */

export const CRYPTO_ESCROW_TEST_ASSET = {
  network: "Base Sepolia",
  chainNamespace: "eip155",
  chainId: 84_532,
  caip2: "eip155:84532",
  symbol: "USDC",
  decimals: 6,
  contractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  hasFinancialValue: false,
} as const;

export const CRYPTO_ESCROW_ADAPTER_PHASES = [
  "prepare",
  "authorize",
  "submit",
  "observe",
  "reconcile",
  "adjust",
  "dispute",
] as const;

export type CryptoEscrowAdapterPhase =
  (typeof CRYPTO_ESCROW_ADAPTER_PHASES)[number];

export const CRYPTO_ESCROW_STATES = [
  "prepared",
  "authorization_pending",
  "submitted",
  "submission_unknown",
  "observed_unfinalized",
  "reconciling",
  "funded_final",
  "shipped",
  "inspection",
  "releasable",
  "funding_review",
  "shipping_review",
  "inspection_review",
  "release_review",
  "released",
  "refunded",
  "failed",
  "expired",
] as const;

export type CryptoEscrowState = (typeof CRYPTO_ESCROW_STATES)[number];

const ALLOWED_TRANSITIONS: Readonly<
  Record<CryptoEscrowState, readonly CryptoEscrowState[]>
> = {
  prepared: ["authorization_pending", "expired"],
  authorization_pending: ["submitted", "failed", "expired"],
  // A reported broadcast may still land after a timeout. Absence of prompt
  // observation is not proof of failure, so uncertainty remains recoverable
  // and neither submitted state can become terminal `failed`.
  submitted: ["submission_unknown", "observed_unfinalized"],
  submission_unknown: ["submitted", "observed_unfinalized", "reconciling"],
  observed_unfinalized: ["submission_unknown", "reconciling"],
  reconciling: ["submission_unknown", "funded_final"],
  funded_final: ["shipped", "refunded", "funding_review"],
  funding_review: ["shipped", "refunded"],
  shipped: ["inspection", "shipping_review"],
  shipping_review: ["inspection", "refunded"],
  inspection: ["releasable", "refunded", "inspection_review"],
  inspection_review: ["releasable", "refunded"],
  releasable: ["released", "refunded", "release_review"],
  release_review: ["released", "refunded"],
  released: [],
  refunded: [],
  failed: [],
  expired: [],
};

export interface CryptoEscrowAvailability {
  mode: "disabled" | "testnet";
  modelEnabled: boolean;
  checkoutEnabled: false;
  acceptsFinancialValue: false;
  reason: string;
}

/**
 * Fail closed. Explicit testnet mode exposes the integration model only;
 * moving even test tokens remains disabled until an approved adapter and
 * audited contract are separately supplied.
 */
export function getCryptoEscrowAvailability(
  mode = process.env.CRYPTO_ESCROW_MODE,
): CryptoEscrowAvailability {
  if (mode?.trim() !== "testnet") {
    return {
      mode: "disabled",
      modelEnabled: false,
      checkoutEnabled: false,
      acceptsFinancialValue: false,
      reason:
        "Crypto settlement is disabled unless CRYPTO_ESCROW_MODE=testnet.",
    };
  }

  return {
    mode: "testnet",
    modelEnabled: true,
    checkoutEnabled: false,
    acceptsFinancialValue: false,
    reason:
      "The Base Sepolia model is available for no-value testing; checkout and value transfer are not implemented.",
  };
}

export function canTransitionCryptoEscrow(
  from: CryptoEscrowState,
  to: CryptoEscrowState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertCryptoEscrowTransition(
  from: CryptoEscrowState,
  to: CryptoEscrowState,
): void {
  if (!canTransitionCryptoEscrow(from, to)) {
    throw new Error(`Invalid crypto escrow transition: ${from} -> ${to}`);
  }
}

type HexAddress = `0x${string}`;
type TransactionHash = `0x${string}`;

export interface ExpectedCryptoDeposit {
  chainId: typeof CRYPTO_ESCROW_TEST_ASSET.chainId;
  assetAddress: typeof CRYPTO_ESCROW_TEST_ASSET.contractAddress;
  escrowContract: HexAddress;
  /** Canonical base-10 integer string; avoids JavaScript number precision loss. */
  amountAtomic: string;
  tradeReference: string;
  /** Positive reservation/settlement generation fixed before authorization. */
  settlementGeneration: number;
  /** 32-byte digest of the exact settlement and fulfilment terms. */
  termsDigest: `0x${string}`;
  /** Frozen deposit deadline as a positive Unix timestamp in seconds. */
  expiresAtUnixSeconds: number;
  payerAddress: HexAddress;
  beneficiaryAddress: HexAddress;
}

export interface ObservedCryptoDeposit {
  chainId: number;
  assetAddress: HexAddress;
  escrowContract: HexAddress;
  /** Canonical base-10 integer string emitted by the approved observer. */
  amountAtomic: string;
  tradeReference: string;
  /** Generation emitted by the approved settlement event. */
  settlementGeneration: number;
  /** Terms digest emitted by the approved settlement event. */
  termsDigest: `0x${string}`;
  /** Timestamp of the containing block, not observer wall-clock receipt time. */
  includedAtUnixSeconds: number;
  payerAddress: HexAddress;
  beneficiaryAddress: HexAddress;
  transactionHash: TransactionHash;
  logIndex: number;
  receiptStatus: "success" | "reverted";
  finality: "unfinalized" | "finalized";
  removed: boolean;
}

export type CryptoDepositMismatch =
  | "non_positive_expected_amount"
  | "unsupported_expected_chain"
  | "unsupported_expected_asset"
  | "invalid_expected_escrow_contract"
  | "invalid_expected_payer"
  | "invalid_expected_beneficiary"
  | "invalid_expected_trade_reference"
  | "invalid_expected_settlement_generation"
  | "invalid_expected_terms_digest"
  | "invalid_expected_expiry"
  | "invalid_observed_settlement_generation"
  | "invalid_observed_terms_digest"
  | "invalid_observed_inclusion_time"
  | "wrong_chain"
  | "wrong_asset"
  | "wrong_escrow_contract"
  | "wrong_amount"
  | "wrong_trade_reference"
  | "wrong_settlement_generation"
  | "wrong_terms_digest"
  | "late_deposit"
  | "wrong_payer"
  | "wrong_beneficiary"
  | "reverted"
  | "unfinalized"
  | "removed_log";

export interface CryptoDepositReconciliation {
  matches: boolean;
  mismatches: CryptoDepositMismatch[];
  eventKey: string;
}

function sameHex(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isCanonicalPositiveAtomicAmount(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

function isNonZeroHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

function isCanonicalTradeReference(value: string): boolean {
  return (
    value.length > 0 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    new TextEncoder().encode(value).byteLength <= 128
  );
}

function isPositiveUnixInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isBytes32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** Stable external-event identity for webhook/poller idempotency. */
export function cryptoDepositEventKey(
  observation: Pick<
    ObservedCryptoDeposit,
    "chainId" | "transactionHash" | "logIndex"
  >,
): string {
  if (!Number.isSafeInteger(observation.chainId) || observation.chainId <= 0) {
    throw new Error("Crypto deposit chainId must be a positive safe integer.");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(observation.transactionHash)) {
    throw new Error(
      "Crypto deposit transactionHash must be a 32-byte hex value.",
    );
  }
  if (!Number.isSafeInteger(observation.logIndex) || observation.logIndex < 0) {
    throw new Error(
      "Crypto deposit logIndex must be a non-negative safe integer.",
    );
  }
  return `${observation.chainId}:${observation.transactionHash.toLowerCase()}:${observation.logIndex}`;
}

/**
 * Compare a finalized event with the fixed quote. A caller may advance from
 * `reconciling` to `funded_final` only when `matches` is true. This function
 * does not mutate a trade and does not release funds.
 */
export function reconcileFinalizedCryptoDeposit(
  expected: ExpectedCryptoDeposit,
  observed: ObservedCryptoDeposit,
): CryptoDepositReconciliation {
  const mismatches: CryptoDepositMismatch[] = [];

  if (!isCanonicalPositiveAtomicAmount(expected.amountAtomic))
    mismatches.push("non_positive_expected_amount");
  if (expected.chainId !== CRYPTO_ESCROW_TEST_ASSET.chainId) {
    mismatches.push("unsupported_expected_chain");
  }
  if (
    !sameHex(expected.assetAddress, CRYPTO_ESCROW_TEST_ASSET.contractAddress)
  ) {
    mismatches.push("unsupported_expected_asset");
  }
  if (!isNonZeroHexAddress(expected.escrowContract)) {
    mismatches.push("invalid_expected_escrow_contract");
  }
  if (!isNonZeroHexAddress(expected.payerAddress)) {
    mismatches.push("invalid_expected_payer");
  }
  if (!isNonZeroHexAddress(expected.beneficiaryAddress)) {
    mismatches.push("invalid_expected_beneficiary");
  }
  if (!isCanonicalTradeReference(expected.tradeReference)) {
    mismatches.push("invalid_expected_trade_reference");
  }
  if (
    !Number.isSafeInteger(expected.settlementGeneration) ||
    expected.settlementGeneration <= 0
  ) {
    mismatches.push("invalid_expected_settlement_generation");
  }
  if (!isBytes32(expected.termsDigest)) {
    mismatches.push("invalid_expected_terms_digest");
  }
  if (!isPositiveUnixInteger(expected.expiresAtUnixSeconds)) {
    mismatches.push("invalid_expected_expiry");
  }
  if (!isPositiveUnixInteger(observed.includedAtUnixSeconds)) {
    mismatches.push("invalid_observed_inclusion_time");
  }
  if (
    !Number.isSafeInteger(observed.settlementGeneration) ||
    observed.settlementGeneration <= 0
  ) {
    mismatches.push("invalid_observed_settlement_generation");
  }
  if (!isBytes32(observed.termsDigest)) {
    mismatches.push("invalid_observed_terms_digest");
  }
  if (observed.chainId !== expected.chainId) mismatches.push("wrong_chain");
  if (!sameHex(observed.assetAddress, expected.assetAddress))
    mismatches.push("wrong_asset");
  if (!sameHex(observed.escrowContract, expected.escrowContract)) {
    mismatches.push("wrong_escrow_contract");
  }
  if (observed.amountAtomic !== expected.amountAtomic)
    mismatches.push("wrong_amount");
  if (observed.tradeReference !== expected.tradeReference) {
    mismatches.push("wrong_trade_reference");
  }
  if (observed.settlementGeneration !== expected.settlementGeneration) {
    mismatches.push("wrong_settlement_generation");
  }
  if (!sameHex(observed.termsDigest, expected.termsDigest)) {
    mismatches.push("wrong_terms_digest");
  }
  if (
    isPositiveUnixInteger(expected.expiresAtUnixSeconds) &&
    isPositiveUnixInteger(observed.includedAtUnixSeconds) &&
    observed.includedAtUnixSeconds > expected.expiresAtUnixSeconds
  ) {
    mismatches.push("late_deposit");
  }
  if (!sameHex(observed.payerAddress, expected.payerAddress))
    mismatches.push("wrong_payer");
  if (!sameHex(observed.beneficiaryAddress, expected.beneficiaryAddress)) {
    mismatches.push("wrong_beneficiary");
  }
  if (observed.receiptStatus !== "success") mismatches.push("reverted");
  if (observed.finality !== "finalized") mismatches.push("unfinalized");
  if (observed.removed) mismatches.push("removed_log");

  return {
    matches: mismatches.length === 0,
    mismatches,
    eventKey: cryptoDepositEventKey(observed),
  };
}
