import { describe, expect, it, vi } from "vitest";
import { evaluateCashloomKarma } from "./karma";

const EVALUATED_AT = "2026-08-01T09:00:00.000Z";

describe("CashLoom KARMA observe-only evaluator", () => {
  it("returns a deterministic clean observation without a global subject identifier", () => {
    const input = {
      purpose: "market.cashloom-handoff" as const,
      evaluated_at: EVALUATED_AT,
      signals: [],
    };
    const first = evaluateCashloomKarma(input);
    const second = evaluateCashloomKarma(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: "evaluated",
      proposed_response: "observe",
      effective_response: "observe",
      evidence_count: 0,
      subject_scope: "current-authenticated-participant",
      effects: {
        changes_account_state: false,
        changes_trade_state: false,
        changes_escrow_state: false,
        moves_or_holds_money: false,
        contacts_or_attacks_external_systems: false,
        publishes_identity_or_reputation: false,
      },
    });
    expect(JSON.stringify(first)).not.toMatch(/user_id|email|wallet|ip_address/i);
  });

  it("proposes the strongest reversible response while effective behaviour remains observe", () => {
    const decision = evaluateCashloomKarma({
      purpose: "account.cashloom-profile",
      evaluated_at: EVALUATED_AT,
      signals: [
        {
          signal_type: "rapid_listing",
          severity: "medium",
          observed_at: "2026-07-31T09:00:00.000Z",
        },
        {
          signal_type: "failed_payment_burst",
          severity: "high",
          observed_at: "2026-07-31T10:00:00.000Z",
        },
      ],
    });

    expect(decision.proposed_response).toBe("isolate");
    expect(decision.effective_response).toBe("observe");
    expect(decision.findings).toHaveLength(2);
    expect(decision.findings[1]).toMatchObject({
      signal_type: "failed_payment_burst",
      proposed_response: "isolate",
    });
  });

  it("hashes accepted evidence independently of input order and names stale omissions", () => {
    const fresh = {
      signal_type: "rapid_listing",
      severity: "medium",
      observed_at: "2026-07-31T09:00:00.000Z",
    };
    const stale = {
      signal_type: "negative_reviews",
      severity: "medium",
      observed_at: "2026-01-01T09:00:00.000Z",
    };
    const first = evaluateCashloomKarma({
      purpose: "account.cashloom-profile",
      evaluated_at: EVALUATED_AT,
      signals: [fresh, stale],
    });
    const second = evaluateCashloomKarma({
      purpose: "account.cashloom-profile",
      evaluated_at: EVALUATED_AT,
      signals: [stale, fresh],
    });

    expect(first.evidence_bundle_hash).toBe(second.evidence_bundle_hash);
    expect(first).toMatchObject({
      supplied_evidence_count: 2,
      evidence_count: 1,
      ignored_evidence_count: 1,
    });
    expect(first.notices.join(" ")).toMatch(/outside the 90-day policy window/);
  });

  it("does not let duplicate observations amplify beyond their severity", () => {
    const signal = {
      signal_type: "rapid_listing",
      severity: "medium",
      observed_at: "2026-07-31T09:00:00.000Z",
    };
    const decision = evaluateCashloomKarma({
      purpose: "market.cashloom-handoff",
      evaluated_at: EVALUATED_AT,
      signals: [signal, signal, signal],
    });
    expect(decision.proposed_response).toBe("friction");
    expect(decision.effective_response).toBe("observe");
  });

  it("ignores unknown and cross-purpose critical rows instead of laundering severity into a deny proposal", () => {
    const decision = evaluateCashloomKarma({
      purpose: "market.cashloom-handoff",
      evaluated_at: EVALUATED_AT,
      signals: [
        {
          signal_type: "attacker_supplied_future_policy",
          severity: "critical",
          observed_at: "2026-07-31T09:00:00.000Z",
        },
        {
          signal_type: "chargeback",
          severity: "critical",
          observed_at: "2026-07-31T10:00:00.000Z",
        },
      ],
    });

    expect(decision).toMatchObject({
      state: "evaluated",
      evidence_count: 0,
      ignored_evidence_count: 2,
      proposed_response: "observe",
      effective_response: "observe",
      policy: {
        evidence_scope: "current-account-unresolved-advisory",
        activation: "preview-only-never-enforce",
      },
    });
    expect(decision.notices.join(" ")).toMatch(/unrecognised signal type/);
    expect(decision.notices.join(" ")).toMatch(/outside this purpose's closed policy/);
  });

  it("rejects a catalog severity mismatch without trusting the supplied severity", () => {
    const decision = evaluateCashloomKarma({
      purpose: "account.cashloom-profile",
      evaluated_at: EVALUATED_AT,
      signals: [{
        signal_type: "rapid_listing",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    });

    expect(decision).toMatchObject({
      state: "evidence-invalid",
      evidence_count: 0,
      proposed_response: "isolate",
      effective_response: "observe",
    });
  });

  it("treats malformed, future, and truncated evidence as invalid without enforcing", () => {
    for (const decision of [
      evaluateCashloomKarma({
        purpose: "market.cashloom-handoff",
        evaluated_at: EVALUATED_AT,
        signals: [{
          signal_type: "bad signal",
          severity: "high",
          observed_at: "2026-07-31T09:00:00.000Z",
        }],
      }),
      evaluateCashloomKarma({
        purpose: "market.cashloom-handoff",
        evaluated_at: EVALUATED_AT,
        signals: [{
          signal_type: "failed_payment_burst",
          severity: "high",
          observed_at: "2026-08-02T09:00:00.000Z",
        }],
      }),
      evaluateCashloomKarma({
        purpose: "market.cashloom-handoff",
        evaluated_at: EVALUATED_AT,
        signals: [],
        evidence_truncated: true,
      }),
    ]) {
      expect(decision).toMatchObject({
        state: "evidence-invalid",
        proposed_response: "isolate",
        effective_response: "observe",
        evidence_count: 0,
      });
    }
  });

  it("has no network or mutation side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    evaluateCashloomKarma({
      purpose: "market.cashloom-handoff",
      evaluated_at: EVALUATED_AT,
      signals: [{
        signal_type: "chargeback",
        severity: "critical",
        observed_at: "2026-07-31T09:00:00.000Z",
      }],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
