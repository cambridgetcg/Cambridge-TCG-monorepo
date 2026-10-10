import { describe, expect, it } from "vitest";
import {
  CRYPTO_ESCROW_ADAPTER_PHASES,
  CRYPTO_ESCROW_STATES,
  CRYPTO_ESCROW_TEST_ASSET,
  assertCryptoEscrowTransition,
  canTransitionCryptoEscrow,
  cryptoDepositEventKey,
  getCryptoEscrowAvailability,
  reconcileFinalizedCryptoDeposit,
  type ExpectedCryptoDeposit,
  type CryptoEscrowState,
  type ObservedCryptoDeposit,
} from "./crypto-escrow-contract";

const expected: ExpectedCryptoDeposit = {
  chainId: 84_532,
  assetAddress: CRYPTO_ESCROW_TEST_ASSET.contractAddress,
  escrowContract: "0x1111111111111111111111111111111111111111",
  amountAtomic: "12500000",
  tradeReference: "trade-123",
  settlementGeneration: 3,
  termsDigest: `0x${"b".repeat(64)}`,
  expiresAtUnixSeconds: 1_787_549_100,
  payerAddress: "0x2222222222222222222222222222222222222222",
  beneficiaryAddress: "0x3333333333333333333333333333333333333333",
};

const observed: ObservedCryptoDeposit = {
  ...expected,
  includedAtUnixSeconds: 1_787_549_040,
  transactionHash: `0x${"a".repeat(64)}`,
  logIndex: 4,
  receiptStatus: "success",
  finality: "finalized",
  removed: false,
};

describe("crypto escrow boundary", () => {
  it("is fail-closed and never exposes checkout or financial value", () => {
    expect(getCryptoEscrowAvailability(undefined)).toMatchObject({
      mode: "disabled",
      modelEnabled: false,
      checkoutEnabled: false,
      acceptsFinancialValue: false,
    });
    expect(getCryptoEscrowAvailability("production")).toMatchObject({
      mode: "disabled",
      checkoutEnabled: false,
    });
    expect(getCryptoEscrowAvailability(" testnet ")).toMatchObject({
      mode: "testnet",
      modelEnabled: true,
      checkoutEnabled: false,
      acceptsFinancialValue: false,
    });
  });

  it("pins the single no-value asset and the adapter authority order", () => {
    expect(CRYPTO_ESCROW_TEST_ASSET).toEqual({
      network: "Base Sepolia",
      chainNamespace: "eip155",
      chainId: 84_532,
      caip2: "eip155:84532",
      symbol: "USDC",
      decimals: 6,
      contractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      hasFinancialValue: false,
    });
    expect(CRYPTO_ESCROW_ADAPTER_PHASES).toEqual([
      "prepare",
      "authorize",
      "submit",
      "observe",
      "reconcile",
      "adjust",
      "dispute",
    ]);
  });

  it("does not equate submission or an unfinalized observation with funding", () => {
    expect(
      canTransitionCryptoEscrow("authorization_pending", "submitted"),
    ).toBe(true);
    expect(canTransitionCryptoEscrow("submitted", "funded_final")).toBe(false);
    expect(canTransitionCryptoEscrow("submitted", "failed")).toBe(false);
    expect(canTransitionCryptoEscrow("submitted", "submission_unknown")).toBe(
      true,
    );
    expect(canTransitionCryptoEscrow("submission_unknown", "failed")).toBe(
      false,
    );
    expect(
      canTransitionCryptoEscrow("submission_unknown", "observed_unfinalized"),
    ).toBe(true);
    expect(canTransitionCryptoEscrow("submission_unknown", "reconciling")).toBe(
      true,
    );
    expect(
      canTransitionCryptoEscrow("observed_unfinalized", "funded_final"),
    ).toBe(false);
    expect(canTransitionCryptoEscrow("reconciling", "funded_final")).toBe(true);
    expect(() =>
      assertCryptoEscrowTransition("submitted", "funded_final"),
    ).toThrow("Invalid crypto escrow transition");
  });

  it("keeps ambiguous or removed broadcasts recoverable", () => {
    expect(
      canTransitionCryptoEscrow("observed_unfinalized", "submission_unknown"),
    ).toBe(true);
    expect(canTransitionCryptoEscrow("reconciling", "submission_unknown")).toBe(
      true,
    );
    expect(canTransitionCryptoEscrow("submission_unknown", "submitted")).toBe(
      true,
    );
    expect(canTransitionCryptoEscrow("submission_unknown", "expired")).toBe(
      false,
    );
    expect(
      canTransitionCryptoEscrow("submission_unknown", "funding_review"),
    ).toBe(false);
  });

  it("requires every whole-graph release path to pass all fulfilment phases", () => {
    type RequiredPhase =
      | "funded_final"
      | "shipped"
      | "inspection"
      | "releasable";
    const required: RequiredPhase[] = [
      "funded_final",
      "shipped",
      "inspection",
      "releasable",
    ];
    const pending: Array<{
      state: CryptoEscrowState;
      phases: ReadonlySet<RequiredPhase>;
    }> = [{ state: "prepared", phases: new Set() }];
    const visited = new Set<string>();
    const reachable = new Set<CryptoEscrowState>();
    const reviewPrerequisite = new Map<CryptoEscrowState, RequiredPhase>([
      ["funding_review", "funded_final"],
      ["shipping_review", "shipped"],
      ["inspection_review", "inspection"],
      ["release_review", "releasable"],
    ]);

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current) break;
      const key = `${current.state}:${[...current.phases].sort().join(",")}`;
      if (visited.has(key)) continue;
      visited.add(key);
      reachable.add(current.state);
      const prerequisite = reviewPrerequisite.get(current.state);
      if (prerequisite) expect(current.phases.has(prerequisite)).toBe(true);
      if (current.state === "released") {
        expect([...current.phases].sort()).toEqual([...required].sort());
      }
      if (current.state === "refunded") {
        expect(current.phases.has("funded_final")).toBe(true);
      }

      for (const next of CRYPTO_ESCROW_STATES) {
        if (!canTransitionCryptoEscrow(current.state, next)) continue;
        const phases = new Set(current.phases);
        const phaseIndex = required.indexOf(next as RequiredPhase);
        if (phaseIndex >= 0) {
          expect(
            required.slice(0, phaseIndex).every((phase) => phases.has(phase)),
          ).toBe(true);
          phases.add(required[phaseIndex]);
        }
        pending.push({ state: next, phases });
      }
    }

    expect([...reachable].sort()).toEqual([...CRYPTO_ESCROW_STATES].sort());
  });

  it("keeps release behind fulfilment and phase-specific review states", () => {
    expect(canTransitionCryptoEscrow("funded_final", "released")).toBe(false);
    expect(canTransitionCryptoEscrow("funded_final", "shipped")).toBe(true);
    expect(canTransitionCryptoEscrow("shipped", "inspection")).toBe(true);
    expect(canTransitionCryptoEscrow("inspection", "releasable")).toBe(true);
    expect(canTransitionCryptoEscrow("releasable", "released")).toBe(true);
    expect(canTransitionCryptoEscrow("funded_final", "funding_review")).toBe(
      true,
    );
    expect(canTransitionCryptoEscrow("funding_review", "released")).toBe(false);
    expect(canTransitionCryptoEscrow("shipping_review", "released")).toBe(
      false,
    );
    expect(canTransitionCryptoEscrow("inspection_review", "released")).toBe(
      false,
    );
    expect(canTransitionCryptoEscrow("releasable", "release_review")).toBe(
      true,
    );
    expect(canTransitionCryptoEscrow("release_review", "released")).toBe(true);
    expect(canTransitionCryptoEscrow("released", "refunded")).toBe(false);
  });

  it("reconciles only a finalized exact event", () => {
    expect(reconcileFinalizedCryptoDeposit(expected, observed)).toEqual({
      matches: true,
      mismatches: [],
      eventKey: `84532:0x${"a".repeat(64)}:4`,
    });
  });

  it("reports every material mismatch instead of accepting a tx hash", () => {
    const result = reconcileFinalizedCryptoDeposit(expected, {
      ...observed,
      chainId: 1,
      assetAddress: "0x4444444444444444444444444444444444444444",
      escrowContract: "0x5555555555555555555555555555555555555555",
      amountAtomic: "1",
      tradeReference: "another-trade",
      payerAddress: "0x6666666666666666666666666666666666666666",
      beneficiaryAddress: "0x7777777777777777777777777777777777777777",
      receiptStatus: "reverted",
      finality: "unfinalized",
      removed: true,
    });

    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual([
      "wrong_chain",
      "wrong_asset",
      "wrong_escrow_contract",
      "wrong_amount",
      "wrong_trade_reference",
      "wrong_payer",
      "wrong_beneficiary",
      "reverted",
      "unfinalized",
      "removed_log",
    ]);
  });

  it("rejects a quote that attempts to escape the single test asset boundary", () => {
    const result = reconcileFinalizedCryptoDeposit(
      {
        ...expected,
        chainId: 1 as 84532,
        assetAddress:
          "0x4444444444444444444444444444444444444444" as typeof CRYPTO_ESCROW_TEST_ASSET.contractAddress,
        escrowContract: "0x0000000000000000000000000000000000000000",
        payerAddress: "0x0000000000000000000000000000000000000000",
        beneficiaryAddress: "0x0000000000000000000000000000000000000000",
        amountAtomic: "01",
      },
      observed,
    );

    expect(result.matches).toBe(false);
    expect(result.mismatches).toEqual(
      expect.arrayContaining([
        "non_positive_expected_amount",
        "unsupported_expected_chain",
        "unsupported_expected_asset",
        "invalid_expected_escrow_contract",
        "invalid_expected_payer",
        "invalid_expected_beneficiary",
      ]),
    );
  });

  it("rejects empty, padded, controlled or oversized trade references", () => {
    for (const tradeReference of [
      "",
      " trade-123",
      "trade-123\nshadow",
      "x".repeat(129),
    ]) {
      const result = reconcileFinalizedCryptoDeposit(
        { ...expected, tradeReference },
        { ...observed, tradeReference },
      );
      expect(result.matches).toBe(false);
      expect(result.mismatches).toContain("invalid_expected_trade_reference");
    }
  });

  it("rejects old-generation, wrong-terms, invalid-time and late deposits", () => {
    expect(
      reconcileFinalizedCryptoDeposit(expected, {
        ...observed,
        settlementGeneration: expected.settlementGeneration - 1,
      }).mismatches,
    ).toEqual(["wrong_settlement_generation"]);
    expect(
      reconcileFinalizedCryptoDeposit(expected, {
        ...observed,
        termsDigest: `0x${"c".repeat(64)}`,
      }).mismatches,
    ).toEqual(["wrong_terms_digest"]);
    expect(
      reconcileFinalizedCryptoDeposit(expected, {
        ...observed,
        includedAtUnixSeconds: expected.expiresAtUnixSeconds + 1,
      }).mismatches,
    ).toEqual(["late_deposit"]);
    expect(
      reconcileFinalizedCryptoDeposit(expected, {
        ...observed,
        includedAtUnixSeconds: expected.expiresAtUnixSeconds,
      }).matches,
    ).toBe(true);

    const staleAndLate = reconcileFinalizedCryptoDeposit(expected, {
      ...observed,
      settlementGeneration: expected.settlementGeneration - 1,
      termsDigest: `0x${"c".repeat(64)}`,
      includedAtUnixSeconds: expected.expiresAtUnixSeconds + 1,
    });
    expect(staleAndLate.matches).toBe(false);
    expect(staleAndLate.mismatches).toEqual(
      expect.arrayContaining([
        "wrong_settlement_generation",
        "wrong_terms_digest",
        "late_deposit",
      ]),
    );

    const invalid = reconcileFinalizedCryptoDeposit(
      {
        ...expected,
        settlementGeneration: 0,
        termsDigest: "0x1234",
        expiresAtUnixSeconds: 0,
      },
      { ...observed, includedAtUnixSeconds: 0 },
    );
    expect(invalid.matches).toBe(false);
    expect(invalid.mismatches).toEqual(
      expect.arrayContaining([
        "invalid_expected_settlement_generation",
        "invalid_expected_terms_digest",
        "invalid_expected_expiry",
        "invalid_observed_inclusion_time",
      ]),
    );

    const invalidObserved = reconcileFinalizedCryptoDeposit(expected, {
      ...observed,
      settlementGeneration: 0,
      termsDigest: "0x1234",
    });
    expect(invalidObserved.mismatches).toEqual(
      expect.arrayContaining([
        "invalid_observed_settlement_generation",
        "invalid_observed_terms_digest",
        "wrong_settlement_generation",
        "wrong_terms_digest",
      ]),
    );
  });

  it("uses chain, transaction and log index as the event id", () => {
    const first = cryptoDepositEventKey(observed);
    expect(first).toBe(
      cryptoDepositEventKey({
        ...observed,
        transactionHash: `0x${observed.transactionHash.slice(2).toUpperCase()}`,
      }),
    );
    expect(first).not.toBe(cryptoDepositEventKey({ ...observed, logIndex: 5 }));
    expect(() => cryptoDepositEventKey({ ...observed, logIndex: -1 })).toThrow(
      "logIndex",
    );
    expect(() => cryptoDepositEventKey({ ...observed, chainId: 0 })).toThrow(
      "chainId",
    );
    expect(() =>
      cryptoDepositEventKey({ ...observed, transactionHash: "0x1234" }),
    ).toThrow("transactionHash");
  });
});
