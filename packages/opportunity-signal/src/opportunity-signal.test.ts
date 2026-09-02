import { describe, expect, it, vi } from "vitest";

import {
  OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE,
  OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
  OPPORTUNITY_SIGNAL_INPUT_SCHEMA,
  OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS,
  OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA,
  OpportunitySignalContractError,
  canonicalOpportunitySignalEvidenceBundleBytesV1,
  canonicalOpportunitySignalEvidenceBundleJsonV1,
  canonicalOpportunitySignalRequestBytesV1,
  canonicalOpportunitySignalRequestJsonV1,
  deriveOpportunitySignalEconomicsBandsV1,
  evaluateOpportunitySignalV1,
  opportunitySignalEvidenceBundleDigestV1,
  opportunitySignalRequestDigestV1,
  parseOpportunitySignalEvidenceEnvelopeV1,
  parseOpportunitySignalInputV1,
  parseOpportunitySignalProviderResultV1,
  parseOpportunitySignalV1,
  preflightOpportunitySignalV1,
  projectOpportunitySignalV1,
  type OpportunitySignalProviderV1,
} from "./index";

const EVALUATED_AT = "2026-09-01T12:00:00.000Z";
const CANDIDATE_REF = "ctcg_cand_0123456789ABCDEFGHIJKL";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PLACEHOLDER_DIGEST = `sha256:${"0".repeat(64)}`;
const EVIDENCE_VECTOR_DIGEST =
  "sha256:bd44417f3f3badcb75025e376576d690f648785460d60214286e64f4d4585e77";
const REQUEST_VECTOR_DIGEST =
  "sha256:3216f2e8fd6f2719fb0d1fc468eda9bf2f4849e3a4c8f5f358b7a2e05114c04a";
const VECTOR_CANDIDATE_JSON =
  '{"asking_price_minor":1000,"asset":{"condition":"near_mint","finish":"normal","sku":"op-op01-001-en"},"candidate_ref":"ctcg_cand_0123456789ABCDEFGHIJKL","expires_at":"2026-09-01T12:05:00.000Z","observed_at":"2026-09-01T11:57:00.000Z","quantity":1,"retrieved_at":"2026-09-01T11:59:00.000Z"}';
const VECTOR_COSTS_JSON =
  '{"acquisition_tax_and_duty":{"reason":"not_due","state":"not_applicable"},"buyer_fee":{"reason":"not_due","state":"not_applicable"},"disposal_tax_and_duty":{"reason":"not_due","state":"not_applicable"},"inbound_shipping":{"reason":"not_due","state":"not_applicable"},"outbound_shipping":{"reason":"not_due","state":"not_applicable"},"payment_processing":{"reason":"not_due","state":"not_applicable"},"seller_fee":{"reason":"not_due","state":"not_applicable"}}';
const VECTOR_CURRENCY_JSON =
  '{"currency":"GBP","reason":"all_inputs_native_gbp","state":"not_required"}';
const VECTOR_VALUATION_JSON =
  '{"asset":{"condition":"near_mint","finish":"normal","sku":"op-op01-001-en"},"basis":"completed_sales","confidence":"high","estimated_gross_exit_minor":{"high":1600,"low":1400,"midpoint":1500},"evidence":{"expires_at":"2026-09-01T12:08:00.000Z","retrieved_at":"2026-09-01T11:58:00.000Z","source_stated_at":"2026-09-01T11:55:00.000Z"},"evidence_flags":[],"liquidity":{"band":"unknown"}}';
const EVIDENCE_VECTOR_JSON =
  `{"candidate":${VECTOR_CANDIDATE_JSON},"costs":${VECTOR_COSTS_JSON},` +
  `"currency_normalization":${VECTOR_CURRENCY_JSON},` +
  `"schema":"cambridgetcg.opportunity-signal-evidence/1",` +
  `"valuation":${VECTOR_VALUATION_JSON}}`;
const VECTOR_RELEASE_JSON =
  `{"eligible":true,"evaluated_at":"2026-09-01T11:59:30.000Z",` +
  `"evidence_bundle_digest":"${EVIDENCE_VECTOR_DIGEST}",` +
  `"expires_at":"2026-09-01T12:15:00.000Z",` +
  `"operation":"subscriber_derived_signal",` +
  `"policy_digest":"${POLICY_DIGEST}"}`;
const REQUEST_VECTOR_JSON =
  `{"candidate":${VECTOR_CANDIDATE_JSON},"costs":${VECTOR_COSTS_JSON},` +
  `"currency_normalization":${VECTOR_CURRENCY_JSON},` +
  `"evaluated_at":"${EVALUATED_AT}",` +
  `"release_eligibility":${VECTOR_RELEASE_JSON},` +
  `"schema":"cambridgetcg.opportunity-signal-input/1",` +
  `"valuation":${VECTOR_VALUATION_JSON}}`;

function evidence(expiresAt = "2026-09-01T12:10:00.000Z") {
  return {
    source_stated_at: "2026-09-01T11:55:00.000Z",
    retrieved_at: "2026-09-01T11:58:00.000Z",
    expires_at: expiresAt,
  };
}

function range(low = 100, midpoint = 120, high = 140) {
  return { low, midpoint, high };
}

function validInput(): Record<string, any> {
  const notDue = { state: "not_applicable", reason: "not_due" };
  return {
    schema: OPPORTUNITY_SIGNAL_INPUT_SCHEMA,
    evaluated_at: EVALUATED_AT,
    candidate: {
      candidate_ref: CANDIDATE_REF,
      asset: {
        sku: "op-op01-001-en",
        condition: "near_mint",
        finish: "normal",
      },
      quantity: 1,
      asking_price_minor: 1_000,
      observed_at: "2026-09-01T11:57:00.000Z",
      retrieved_at: "2026-09-01T11:59:00.000Z",
      expires_at: "2026-09-01T12:05:00.000Z",
    },
    valuation: {
      asset: {
        sku: "op-op01-001-en",
        condition: "near_mint",
        finish: "normal",
      },
      estimated_gross_exit_minor: range(1_400, 1_500, 1_600),
      evidence: evidence("2026-09-01T12:08:00.000Z"),
      basis: "completed_sales",
      confidence: "high",
      evidence_flags: [],
      liquidity: { band: "unknown" },
    },
    costs: {
      buyer_fee: { ...notDue },
      inbound_shipping: { ...notDue },
      acquisition_tax_and_duty: { ...notDue },
      seller_fee: { ...notDue },
      payment_processing: { ...notDue },
      outbound_shipping: { ...notDue },
      disposal_tax_and_duty: { ...notDue },
    },
    currency_normalization: {
      currency: "GBP",
      state: "not_required",
      reason: "all_inputs_native_gbp",
    },
    release_eligibility: {
      operation: "subscriber_derived_signal",
      eligible: true,
      evaluated_at: "2026-09-01T11:59:30.000Z",
      expires_at: "2026-09-01T12:15:00.000Z",
      policy_digest: POLICY_DIGEST,
      evidence_bundle_digest: PLACEHOLDER_DIGEST,
    },
  };
}

function evidenceEnvelope(input: Record<string, any>) {
  return {
    schema: OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA,
    evaluated_at: input.evaluated_at,
    candidate: input.candidate,
    valuation: input.valuation,
    costs: input.costs,
    currency_normalization: input.currency_normalization,
  };
}

async function bindEvidence(input: Record<string, any>) {
  input.release_eligibility.evidence_bundle_digest =
    await opportunitySignalEvidenceBundleDigestV1(evidenceEnvelope(input));
  return input;
}

function providerResult(
  classification: "potential_deal" | "not_qualified" | "unavailable" =
    "potential_deal",
  requestDigest = PLACEHOLDER_DIGEST,
) {
  return {
    schema: OPPORTUNITY_SIGNAL_PROVIDER_RESULT_SCHEMA,
    candidate_ref: CANDIDATE_REF,
    evaluated_at: EVALUATED_AT,
    request_digest: requestDigest,
    expires_at: "2026-09-01T12:03:00.000Z",
    classification,
    reason_codes:
      classification === "potential_deal"
        ? ["private_policy_threshold_met"]
        : classification === "not_qualified"
          ? ["private_policy_threshold_not_met"]
          : ["insufficient_evidence"],
  };
}

async function boundProviderResult(
  input: Record<string, any>,
  classification: "potential_deal" | "not_qualified" | "unavailable" =
    "potential_deal",
) {
  return providerResult(
    classification,
    await opportunitySignalRequestDigestV1(input),
  );
}

function expectIssue(
  action: () => unknown,
  phase: "input" | "provider_result" | "output",
  path: string,
  code?: string,
) {
  try {
    action();
    throw new Error("Expected OpportunitySignalContractError");
  } catch (error) {
    expect(error).toBeInstanceOf(OpportunitySignalContractError);
    const contractError = error as OpportunitySignalContractError;
    expect(contractError.phase).toBe(phase);
    expect(contractError.issues[0]?.path).toBe(path);
    if (code) expect(contractError.issues[0]?.code).toBe(code);
  }
}

async function expectIssueAsync(
  action: () => Promise<unknown>,
  phase: "input" | "provider_result" | "output",
  path: string,
  code?: string,
) {
  try {
    await action();
    throw new Error("Expected OpportunitySignalContractError");
  } catch (error) {
    expect(error).toBeInstanceOf(OpportunitySignalContractError);
    const contractError = error as OpportunitySignalContractError;
    expect(contractError.phase).toBe(phase);
    expect(contractError.issues[0]?.path).toBe(path);
    if (code) expect(contractError.issues[0]?.code).toBe(code);
  }
}

describe("strict input and evidence contracts", () => {
  it("parses and freezes an exact v1 input", () => {
    const parsed = parseOpportunitySignalInputV1(validInput());
    expect(parsed.candidate.candidate_ref).toBe(CANDIDATE_REF);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.costs)).toBe(true);
  });

  it.each([
    ["debug", (input: any) => (input.debug = {}), "$.debug"],
    ["seller", (input: any) => (input.candidate.seller_identity = "alice"), "$.candidate.seller_identity"],
    ["source", (input: any) => (input.valuation.source_url = "https://example.test"), "$.valuation.source_url"],
  ])("rejects unknown %s fields", (_name, mutate, path) => {
    const input = validInput();
    mutate(input);
    expectIssue(() => parseOpportunitySignalInputV1(input), "input", path, "unknown_field");
  });

  it.each([
    [1.5, "wrong_type"],
    [Number.NaN, "wrong_type"],
    [-0, "wrong_type"],
    [0, "out_of_range"],
    [-1, "out_of_range"],
    [OPPORTUNITY_SIGNAL_MAX_MINOR_UNITS + 1, "out_of_range"],
  ])("rejects unsafe candidate minor units %s", (value, code) => {
    const input = validInput();
    input.candidate.asking_price_minor = value;
    expectIssue(
      () => parseOpportunitySignalInputV1(input),
      "input",
      "$.candidate.asking_price_minor",
      code,
    );
  });

  it("rejects non-canonical SKU and candidate references including alice", () => {
    const sku = validInput();
    sku.candidate.asset.sku = "OP-OP01-001-EN";
    expectIssue(() => parseOpportunitySignalInputV1(sku), "input", "$.candidate.asset.sku");

    for (const candidateRef of ["alice", "ctcg_cand_short", "https://example.test"]) {
      const input = validInput();
      input.candidate.candidate_ref = candidateRef;
      expectIssue(
        () => parseOpportunitySignalInputV1(input),
        "input",
        "$.candidate.candidate_ref",
        "invalid_format",
      );
    }
  });

  it("requires explicit not-applicable and native-GBP reasons", () => {
    const cost = validInput();
    delete cost.costs.buyer_fee.reason;
    expectIssue(
      () => parseOpportunitySignalInputV1(cost),
      "input",
      "$.costs.buyer_fee.reason",
      "required",
    );

    const fx = validInput();
    delete fx.currency_normalization.reason;
    expectIssue(
      () => parseOpportunitySignalInputV1(fx),
      "input",
      "$.currency_normalization.reason",
      "required",
    );
  });

  it("rejects malformed time, range, and digest values", () => {
    const time = validInput();
    time.evaluated_at = "2026-09-01T12:00:00Z";
    expectIssue(() => parseOpportunitySignalInputV1(time), "input", "$.evaluated_at", "invalid_format");

    const badRange = validInput();
    badRange.valuation.estimated_gross_exit_minor = range(500, 400, 600);
    expectIssue(
      () => parseOpportunitySignalInputV1(badRange),
      "input",
      "$.valuation.estimated_gross_exit_minor",
      "invalid_order",
    );

    const digest = validInput();
    digest.release_eligibility.evidence_bundle_digest = "sha256:bad";
    expectIssue(
      () => parseOpportunitySignalInputV1(digest),
      "input",
      "$.release_eligibility.evidence_bundle_digest",
      "invalid_format",
    );
  });
});

describe("canonical cryptographic binding", () => {
  it("requires the versioned evidence hash domain", () => {
    const envelope = evidenceEnvelope(validInput());
    delete (envelope as any).schema;
    expectIssue(
      () => parseOpportunitySignalEvidenceEnvelopeV1(envelope),
      "input",
      "$.schema",
      "required",
    );
    expect(
      canonicalOpportunitySignalEvidenceBundleJsonV1(
        evidenceEnvelope(validInput()),
      ),
    ).toContain(
      `"schema":"${OPPORTUNITY_SIGNAL_EVIDENCE_SCHEMA}"`,
    );
  });

  it("computes the bundle digest before any rights receipt exists", async () => {
    const raw = validInput();
    const envelope = evidenceEnvelope(raw);
    const parsed = parseOpportunitySignalEvidenceEnvelopeV1(envelope);
    const digestBeforeReceipt = await opportunitySignalEvidenceBundleDigestV1(parsed);

    raw.release_eligibility.evidence_bundle_digest = digestBeforeReceipt;
    const digestAfterReceipt = await opportunitySignalEvidenceBundleDigestV1(
      evidenceEnvelope(parseOpportunitySignalInputV1(raw) as any),
    );
    expect(digestAfterReceipt).toBe(digestBeforeReceipt);
  });

  it("canonicalizes object-key order deterministically", () => {
    const first = validInput();
    const second = JSON.parse(JSON.stringify(first));
    second.costs = Object.fromEntries(Object.entries(second.costs).reverse());
    expect(
      canonicalOpportunitySignalEvidenceBundleJsonV1(evidenceEnvelope(first)),
    ).toBe(
      canonicalOpportunitySignalEvidenceBundleJsonV1(evidenceEnvelope(second)),
    );
  });

  it("bundle digest excludes rights while full request digest binds rights", async () => {
    const first = await bindEvidence(validInput());
    const second = JSON.parse(JSON.stringify(first));
    second.release_eligibility.policy_digest = `sha256:${"b".repeat(64)}`;

    expect(
      await opportunitySignalEvidenceBundleDigestV1(evidenceEnvelope(first)),
    ).toBe(
      await opportunitySignalEvidenceBundleDigestV1(evidenceEnvelope(second)),
    );
    expect(await opportunitySignalRequestDigestV1(first)).not.toBe(
      await opportunitySignalRequestDigestV1(second),
    );
    expect(canonicalOpportunitySignalRequestJsonV1(first)).not.toBe(
      canonicalOpportunitySignalRequestJsonV1(second),
    );
  });

  it("supports an explicitly injected Web Crypto digest provider", async () => {
    const digest = await opportunitySignalEvidenceBundleDigestV1(
      evidenceEnvelope(validInput()),
      {
        digest: async (algorithm, data) => {
          expect(algorithm).toBe("SHA-256");
          expect(data.byteLength).toBeGreaterThan(0);
          return new ArrayBuffer(32);
        },
      },
    );
    expect(digest).toBe(PLACEHOLDER_DIGEST);
  });
});

describe("public preflight and transparent economics", () => {
  it.each([
    ["rights_not_eligible", (input: any) => (input.release_eligibility.eligible = false)],
    ["candidate_expired", (input: any) => (input.candidate.expires_at = "2026-09-01T11:59:30.000Z")],
    ["valuation_expired", (input: any) => (input.valuation.evidence.expires_at = "2026-09-01T11:59:00.000Z")],
    ["unknown_cost", (input: any) => (input.costs.buyer_fee = { state: "unknown" })],
    ["fx_missing", (input: any) => {
      input.currency_normalization = {
        currency: "GBP",
        state: "unknown",
        evidence: evidence(),
      };
    }],
    ["asset_mismatch", (input: any) => (input.valuation.asset.finish = "foil")],
    ["insufficient_evidence", (input: any) => (input.valuation.confidence = "low")],
  ])("fails closed with %s", (reason, mutate) => {
    const input = validInput();
    mutate(input);
    const result = preflightOpportunitySignalV1(
      parseOpportunitySignalInputV1(input),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason_codes).toContain(reason);
  });

  it("subtracts HIGH costs from the LOW valuation with BigInt", () => {
    const input = validInput();
    input.costs.buyer_fee = {
      state: "known",
      amount_minor: range(10, 20, 100),
      evidence: evidence(),
    };
    input.costs.seller_fee = {
      state: "estimated",
      amount_minor: range(10, 20, 100),
      evidence: evidence(),
    };
    const bands = deriveOpportunitySignalEconomicsBandsV1(
      parseOpportunitySignalInputV1(input),
    );
    // 1400 - (1000 + 100) - 100 = 200; 200 / 1100 = 1818 bps.
    expect(bands).toEqual({
      currency: "GBP",
      conservative_net_transaction_spread_band:
        "positive_under_500_minor",
      conservative_margin_band: "1000_to_2499_bps",
    });
  });

  it("returns no economics bands when the conservative spread is non-positive", () => {
    const input = validInput();
    input.valuation.estimated_gross_exit_minor = range(900, 1_000, 1_100);
    expect(
      deriveOpportunitySignalEconomicsBandsV1(
        parseOpportunitySignalInputV1(input),
      ),
    ).toBeNull();
  });

  it.each([
    [1, "positive_under_500_minor"],
    [499, "positive_under_500_minor"],
    [500, "500_to_1499_minor"],
    [1_499, "500_to_1499_minor"],
    [1_500, "1500_to_4999_minor"],
    [4_999, "1500_to_4999_minor"],
    [5_000, "5000_plus_minor"],
  ])("maps spread %i to %s", (spread, expected) => {
    const input = validInput();
    input.candidate.asking_price_minor = 10_000;
    input.valuation.estimated_gross_exit_minor = range(
      10_000 + spread,
      10_000 + spread,
      10_000 + spread,
    );
    expect(
      deriveOpportunitySignalEconomicsBandsV1(
        parseOpportunitySignalInputV1(input),
      )?.conservative_net_transaction_spread_band,
    ).toBe(expected);
  });

  it.each([
    [99, "positive_under_1000_bps"],
    [100, "1000_to_2499_bps"],
    [249, "1000_to_2499_bps"],
    [250, "2500_to_4999_bps"],
    [499, "2500_to_4999_bps"],
    [500, "5000_plus_bps"],
  ])("maps the margin boundary at spread %i to %s", (spread, expected) => {
    const input = validInput();
    input.valuation.estimated_gross_exit_minor = range(
      1_000 + spread,
      1_000 + spread,
      1_000 + spread,
    );
    expect(
      deriveOpportunitySignalEconomicsBandsV1(
        parseOpportunitySignalInputV1(input),
      )?.conservative_margin_band,
    ).toBe(expected);
  });
});

describe("provider contract and digest-bound projection", () => {
  it("accepts classification and binding only, with no provider estimate", () => {
    const parsed = parseOpportunitySignalProviderResultV1(providerResult());
    expect(parsed.classification).toBe("potential_deal");
    expect(Object.keys(parsed)).not.toContain("estimate");

    const leaking = { ...providerResult(), exact_spread_minor: 400 };
    expectIssue(
      () => parseOpportunitySignalProviderResultV1(leaking),
      "provider_result",
      "$.exact_spread_minor",
      "unknown_field",
    );
  });

  it("rejects unknown debug fields and an arbitrage classification", () => {
    const debug = { ...providerResult(), debug: { weights: [0.9] } };
    expectIssue(
      () => parseOpportunitySignalProviderResultV1(debug),
      "provider_result",
      "$.debug",
      "unknown_field",
    );

    const classification = { ...providerResult(), classification: "arbitrage" };
    expectIssue(
      () => parseOpportunitySignalProviderResultV1(classification),
      "provider_result",
      "$.classification",
      "unsupported_value",
    );
  });

  it("emits only coarse bands and no exact valuation/spread/margin", async () => {
    const input = await bindEvidence(validInput());
    const output = await projectOpportunitySignalV1(
      input,
      await boundProviderResult(input),
    );

    expect(output.estimate).toEqual({
      currency: "GBP",
      conservative_net_transaction_spread_band:
        "positive_under_500_minor",
      conservative_margin_band: "2500_to_4999_bps",
    });
    const serialized = JSON.stringify(output);
    expect(serialized).not.toMatch(
      /estimated_gross_exit_minor|exact_spread|spread_minor"|margin_bps"|fair_value/,
    );
  });

  it("buckets nearby economics identically", async () => {
    const estimates = [];
    for (const low of [1_400, 1_499]) {
      const input = validInput();
      input.valuation.estimated_gross_exit_minor.low = low;
      await bindEvidence(input);
      estimates.push(
        (
          await projectOpportunitySignalV1(
            input,
            await boundProviderResult(input),
          )
        ).estimate,
      );
    }
    expect(estimates[0]).toEqual(estimates[1]);
  });

  it("rejects an economically impossible potential claim", async () => {
    const input = validInput();
    input.valuation.estimated_gross_exit_minor = range(900, 1_000, 1_100);
    await bindEvidence(input);
    await expectIssueAsync(
      async () =>
        projectOpportunitySignalV1(
          input,
          await boundProviderResult(input),
        ),
      "provider_result",
      "$.classification",
      "unsafe_claim",
    );
  });

  it("caps the signal at the earliest evidence and 60 seconds", async () => {
    const input = validInput();
    input.costs.buyer_fee = {
      state: "known",
      amount_minor: range(10, 10, 10),
      evidence: evidence("2026-09-01T12:00:45.000Z"),
    };
    await bindEvidence(input);
    const output = await projectOpportunitySignalV1(
      input,
      await boundProviderResult(input),
    );
    expect(output.expires_at).toBe("2026-09-01T12:00:45.000Z");
    expect(output.does_not_include).toEqual(OPPORTUNITY_SIGNAL_DOES_NOT_INCLUDE);
  });

  it.each(["valuation", "costs", "rights"])(
    "rejects replay after material %s changes",
    async (kind) => {
      const original = await bindEvidence(validInput());
      const staleResult = await boundProviderResult(original);
      const changed = JSON.parse(JSON.stringify(original));
      if (kind === "valuation") {
        changed.valuation.estimated_gross_exit_minor.low = 1_450;
        await bindEvidence(changed);
      } else if (kind === "costs") {
        changed.costs.buyer_fee = {
          state: "known",
          amount_minor: range(10, 10, 10),
          evidence: evidence(),
        };
        await bindEvidence(changed);
      } else {
        changed.release_eligibility.policy_digest = `sha256:${"b".repeat(64)}`;
      }

      await expectIssueAsync(
        () => projectOpportunitySignalV1(changed, staleResult),
        "provider_result",
        "$.request_digest",
        "cross_contract_mismatch",
      );
    },
  );

  it("treats an evidence-bundle mismatch as rights denied and redacts valuation", async () => {
    const input = await bindEvidence(validInput());
    input.valuation.estimated_gross_exit_minor.low = 1_401;
    const output = await projectOpportunitySignalV1(input, providerResult());

    expect(output.reason_codes).toContain("rights_not_eligible");
    expect(output.valuation_as_of).toBeNull();
    expect(output.confidence).toBeNull();
    expect(output.liquidity).toBeNull();
    expect(output.risk_codes).toEqual([
      "availability_not_reserved",
      "condition_unverified",
      "authenticity_unverified",
    ]);
  });

  it("redacts provider-side rights denial too", async () => {
    const input = await bindEvidence(validInput());
    const result = await boundProviderResult(input, "unavailable");
    result.reason_codes = ["rights_not_eligible", "insufficient_evidence"];
    const output = await projectOpportunitySignalV1(input, result);

    expect(output.valuation_as_of).toBeNull();
    expect(output.confidence).toBeNull();
    expect(output.liquidity).toBeNull();
    expect(output.risk_codes).toEqual([
      "availability_not_reserved",
      "condition_unverified",
      "authenticity_unverified",
    ]);
  });

  it("standalone output parsing enforces rights-blind metadata and risks", async () => {
    const input = await bindEvidence(validInput());
    const result = await boundProviderResult(input, "unavailable");
    result.reason_codes = ["rights_not_eligible"];
    const valid = await projectOpportunitySignalV1(input, result);

    for (const mutate of [
      (output: any) => (output.valuation_as_of = "2026-09-01T11:55:00.000Z"),
      (output: any) => (output.confidence = "high"),
      (output: any) => (output.liquidity = "unknown"),
    ]) {
      const invalid = JSON.parse(JSON.stringify(valid));
      mutate(invalid);
      expectIssue(
        () => parseOpportunitySignalV1(invalid),
        "output",
        "$",
        "unsafe_claim",
      );
    }

    const invalidRisks = JSON.parse(JSON.stringify(valid));
    invalidRisks.risk_codes = [
      "liquidity_unknown",
      "availability_not_reserved",
      "condition_unverified",
      "authenticity_unverified",
    ];
    expectIssue(
      () => parseOpportunitySignalV1(invalidRisks),
      "output",
      "$.risk_codes",
      "unsafe_claim",
    );
  });

  it.each(["potential_deal", "not_qualified", "unavailable"] as const)(
    "standalone output parsing requires every inherent risk for %s",
    async (classification) => {
      const input = await bindEvidence(validInput());
      const valid = await projectOpportunitySignalV1(
        input,
        await boundProviderResult(input, classification),
      );

      for (const missingRisk of [
        "availability_not_reserved",
        "condition_unverified",
        "authenticity_unverified",
      ]) {
        const invalid = JSON.parse(JSON.stringify(valid));
        invalid.risk_codes = invalid.risk_codes.filter(
          (risk: string) => risk !== missingRisk,
        );
        expectIssue(
          () => parseOpportunitySignalV1(invalid),
          "output",
          "$.risk_codes",
          "unsafe_claim",
        );
      }

      const emptyRisks = JSON.parse(JSON.stringify(valid));
      emptyRisks.risk_codes = [];
      expectIssue(
        () => parseOpportunitySignalV1(emptyRisks),
        "output",
        "$.risk_codes",
        "unsafe_claim",
      );
    },
  );

  it.each(["potential_deal", "not_qualified", "unavailable"] as const)(
    "standalone output parsing allows valuation risks for non-rights %s",
    async (classification) => {
      const input = await bindEvidence(validInput());
      const valid = await projectOpportunitySignalV1(
        input,
        await boundProviderResult(input, classification),
      );
      const withValuationRisk = JSON.parse(JSON.stringify(valid));
      withValuationRisk.risk_codes = [
        "short_history",
        ...withValuationRisk.risk_codes,
      ];

      expect(parseOpportunitySignalV1(withValuationRisk).risk_codes).toEqual([
        "short_history",
        "liquidity_unknown",
        "availability_not_reserved",
        "condition_unverified",
        "authenticity_unverified",
      ]);
    },
  );

  it("rejects valuation_as_of after evaluated_at in standalone output parsing", async () => {
    const input = await bindEvidence(validInput());
    const output = await projectOpportunitySignalV1(
      input,
      await boundProviderResult(input),
    );
    const invalid = JSON.parse(JSON.stringify(output));
    invalid.valuation_as_of = "2026-09-01T12:00:01.000Z";
    expectIssue(
      () => parseOpportunitySignalV1(invalid),
      "output",
      "$.valuation_as_of",
      "cross_contract_mismatch",
    );
  });
});

describe("evaluateOpportunitySignalV1", () => {
  it("passes a frozen full-request digest context to the provider", async () => {
    const input = await bindEvidence(validInput());
    const evaluate = vi.fn(async (_input, context) => {
      expect(Object.isFrozen(context)).toBe(true);
      return providerResult("potential_deal", context.request_digest);
    });
    const output = await evaluateOpportunitySignalV1({ evaluate }, input);

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(output.classification).toBe("potential_deal");
    expect(output.estimate).not.toBeNull();
  });

  it("never calls the provider for public preflight blockers", async () => {
    const input = validInput();
    input.costs.outbound_shipping = { state: "unknown" };
    await bindEvidence(input);
    const evaluate = vi.fn(async () => providerResult());
    const output = await evaluateOpportunitySignalV1({ evaluate }, input);

    expect(evaluate).not.toHaveBeenCalled();
    expect(output.reason_codes).toContain("unknown_cost");
  });

  it("never calls the provider for an evidence-digest mismatch", async () => {
    const input = await bindEvidence(validInput());
    input.costs.seller_fee = {
      state: "known",
      amount_minor: range(10, 10, 10),
      evidence: evidence(),
    };
    const evaluate = vi.fn(async () => providerResult());
    const output = await evaluateOpportunitySignalV1({ evaluate }, input);

    expect(evaluate).not.toHaveBeenCalled();
    expect(output.reason_codes).toContain("rights_not_eligible");
    expect(output.valuation_as_of).toBeNull();
  });

  it("redacts provider debug fields, replay, exceptions, and impossible claims", async () => {
    const input = await bindEvidence(validInput());
    const cases: OpportunitySignalProviderV1[] = [
      {
        evaluate: async (_input, context) => ({
          ...providerResult("potential_deal", context.request_digest),
          debug: { private: true },
        }),
      },
      {
        evaluate: async (_input, context) => ({
          ...providerResult("unavailable", context.request_digest),
          reason_codes: ["rights_not_eligible", "insufficient_evidence"],
          debug: { private: true },
        }),
      },
      {
        evaluate: async () => providerResult("potential_deal", PLACEHOLDER_DIGEST),
      },
      {
        evaluate: async () => {
          throw new Error("private-model-secret");
        },
      },
    ];
    for (const provider of cases) {
      const output = await evaluateOpportunitySignalV1(provider, input);
      expect(output.classification).toBe("unavailable");
      expect(output.reason_codes).toEqual(["invalid_input"]);
      expect(output.valuation_as_of).toBeNull();
      expect(output.confidence).toBeNull();
      expect(output.liquidity).toBeNull();
      expect(output.risk_codes).toEqual([
        "availability_not_reserved",
        "condition_unverified",
        "authenticity_unverified",
      ]);
      expect(JSON.stringify(output)).not.toContain("secret");
    }

    const impossible = validInput();
    impossible.valuation.estimated_gross_exit_minor = range(900, 1_000, 1_100);
    await bindEvidence(impossible);
    const output = await evaluateOpportunitySignalV1(
      {
        evaluate: async (_input, context) =>
          providerResult("potential_deal", context.request_digest),
      },
      impossible,
    );
    expect(output.classification).toBe("unavailable");
    expect(output.estimate).toBeNull();
    expect(output.valuation_as_of).toBeNull();
    expect(output.confidence).toBeNull();
    expect(output.liquidity).toBeNull();
  });

  it("throws safe typed errors for structurally invalid caller input", async () => {
    const input = validInput();
    input.raw_listing = { seller: "alice" };
    const evaluate = vi.fn(async () => providerResult());
    await expect(evaluateOpportunitySignalV1({ evaluate }, input)).rejects.toMatchObject({
      name: "OpportunitySignalContractError",
      phase: "input",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
});

it("matches fixed canonical JSON, UTF-8, and SHA-256 vectors", async () => {
  const input = await bindEvidence(validInput());
  const envelope = evidenceEnvelope(input);
  const evidenceBytes = canonicalOpportunitySignalEvidenceBundleBytesV1(
    envelope,
  );
  const requestBytes = canonicalOpportunitySignalRequestBytesV1(input);

  expect(canonicalOpportunitySignalEvidenceBundleJsonV1(envelope)).toBe(
    EVIDENCE_VECTOR_JSON,
  );
  expect(canonicalOpportunitySignalRequestJsonV1(input)).toBe(
    REQUEST_VECTOR_JSON,
  );
  expect(evidenceBytes).toEqual(
    Uint8Array.from(EVIDENCE_VECTOR_JSON, (character) =>
      character.charCodeAt(0),
    ),
  );
  expect(requestBytes).toEqual(
    Uint8Array.from(REQUEST_VECTOR_JSON, (character) => character.charCodeAt(0)),
  );
  expect(evidenceBytes.byteLength).toBe(1_322);
  expect(requestBytes.byteLength).toBe(1_712);
  expect(await opportunitySignalEvidenceBundleDigestV1(envelope)).toBe(
    EVIDENCE_VECTOR_DIGEST,
  );
  expect(await opportunitySignalRequestDigestV1(input)).toBe(
    REQUEST_VECTOR_DIGEST,
  );
});
