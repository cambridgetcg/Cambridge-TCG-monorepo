import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/app/methodology/fraud-flag/page.tsx"),
  "utf8",
).replace(/\s+/g, " ");

const summary = readFileSync(
  resolve(process.cwd(), "src/app/methodology/fraud-flag/summary.md"),
  "utf8",
);

const sidecar = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "src/app/methodology/fraud-flag/data.json"),
    "utf8",
  ),
) as {
  status: string;
  source_code: string[];
  decision_effects: Record<string, boolean | string>;
};

describe("fraud-flag methodology contract", () => {
  it("discloses the automatic score and downstream service effects", () => {
    expect(page).toContain("automatically subtracts 20 points");
    expect(page).toContain("per-trade and daily limits");
    expect(page).toContain("trust-based commission rate");
    expect(page).toContain("payout hold applied to a future trade");
    expect(page).toContain("without waiting for an operator");
    expect(page).not.toContain("no automatic person-level action is taken");
  });

  it("distinguishes a signal, its stored label and the human emergency freeze", () => {
    expect(page).toContain("risk indicator, not proof");
    expect(page).toContain("auto_action");
    expect(page).toContain("classification label, not an action runner");
    expect(page).toContain("does not directly set");
    expect(page).toContain("human-only");
    expect(page).toContain("payout sweeps also skip a suspended account");
    expect(page).toContain("logged and available for review");
  });

  it("names every active signal producer and the real resolution lifecycle", () => {
    for (const signal of [
      "rapid_listing",
      "self_trading",
      "velocity_spike",
      "failed_payment_burst",
      "new_account_high_value",
      "bid_sniping",
      "auction_default",
      "trade_payment_default",
      "chargeback",
    ]) {
      expect(page, signal).toContain(signal);
    }
    expect(page).toContain("does not clear itself");
    expect(page).toContain("operator resolves or dismisses it");
    expect(page).toContain("daily sweep does not resolve old signals");
    expect(page).toContain("authenticated operator and written reason");
    expect(page).toContain(
      "signal change and governance record commit together",
    );
    expect(page).toContain("trust score recalculation is awaited");
    expect(page).toContain("reports that partial outcome");
    expect(page).toContain("state change and governance record commit in one");
    expect(page).toContain("state change rolls back");
  });

  it("keeps the short sidecar aligned", () => {
    expect(summary).toContain("automatically subtracts 20 trust-score points");
    expect(summary).toContain("does not clear itself");
    expect(summary).toContain("human-only");
    expect(sidecar.status).toBe("published");
    expect(sidecar.source_code).toContain(
      "apps/storefront/src/lib/admin/fraud-review.ts",
    );
    expect(sidecar.decision_effects).toMatchObject({
      direct_signal_suspension: false,
      human_review_required_to_clear: true,
      review_mutation_and_governance_record_commit_together: true,
      affected_trust_score_recalculation_is_awaited: true,
      emergency_freeze_is_human_only: true,
    });
  });
});
