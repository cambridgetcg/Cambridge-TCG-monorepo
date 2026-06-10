/**
 * Pins the tier-upgrade reward path in challenge-claim.
 *
 * Before this refactor, `deliverTierUpgradeReward` set `Customer.currentTierId`
 * directly and inserted a TierChangeLog with field names that don't exist in
 * the Prisma schema (only compiled because the Data API adapter types are
 * permissive). The side effects:
 *   1. CustomerTierState.tierSource was never touched, so the next spending
 *      recalc would silently overwrite the challenge-awarded tier.
 *   2. `config.durationDays` was calculated but never enforced — the expiry
 *      lived in a log note and nothing read it.
 *
 * The fix routes all tier-upgrade rewards through `assignCustomerToTier`,
 * which knows how to update CustomerTierState, write a valid TierChangeLog
 * entry, and honor expiry. This file's job is to make sure nobody reverts
 * that. Source-level assertions — no runtime mocking of Prisma.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";

const CHALLENGE_CLAIM = path.resolve(
  __dirname,
  "../../app/services/challenge-claim.server.ts"
);

describe("challenge-claim — tier upgrade delegates to tier-resolution service", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(CHALLENGE_CLAIM, "utf-8");
  });

  it("imports assignCustomerToTier from manual-tier-assignment", () => {
    expect(source).toMatch(
      /import\s*\{\s*assignCustomerToTier\s*\}\s*from\s*["']\.\/manual-tier-assignment\.server["']/
    );
  });

  function getDeliverTierUpgradeBody(): string {
    const match = source.match(
      /async function deliverTierUpgradeReward\([\s\S]*?\n\}\s*\n/
    );
    expect(match, "could not find deliverTierUpgradeReward function").not.toBeNull();
    return match![0];
  }

  it("deliverTierUpgradeReward calls assignCustomerToTier", () => {
    const body = getDeliverTierUpgradeBody();
    expect(body).toMatch(/assignCustomerToTier\s*\(/);
  });

  it("deliverTierUpgradeReward does NOT write Customer.currentTierId directly", () => {
    const body = getDeliverTierUpgradeBody();
    // Bypass was `prisma.customer.update({ ... currentTierId ... })`.
    // The fix hands this off to assignCustomerToTier; writing directly
    // skips CustomerTierState and TierChangeLog bookkeeping.
    expect(body).not.toMatch(/prisma\.customer\.update/);
    expect(body).not.toMatch(/currentTierId\s*:/);
  });

  it("deliverTierUpgradeReward does NOT create its own TierChangeLog", () => {
    const body = getDeliverTierUpgradeBody();
    // The original duplicate insert used invalid field names (newTierId,
    // source) and wasn't transactionally consistent with the customer
    // update. Log creation now happens inside assignCustomerToTier.
    expect(body).not.toMatch(/tierChangeLog\.create/i);
    expect(body).not.toMatch(/\bnewTierId\s*:/);
    expect(body).not.toMatch(/\bsource\s*:\s*["']CHALLENGE_REWARD/);
  });

  it("deliverTierUpgradeReward forwards challenge metadata to the tier service", () => {
    const body = getDeliverTierUpgradeBody();
    // The synthetic admin identifier `system:challenge-reward:${challengeId}`
    // lets reports filter challenge-awarded tier changes without needing
    // a new TierTriggerType enum value.
    expect(body).toMatch(/system:challenge-reward:/);
    // Challenge name is passed as the note so the UI + tier-change log
    // show "Challenge reward: X" rather than a generic admin-override.
    expect(body).toMatch(/Challenge reward:/);
  });

  it("deliverTierUpgradeReward honors durationDays via overrideDuration", () => {
    const body = getDeliverTierUpgradeBody();
    // durationDays was previously calculated-then-discarded; now it maps
    // to assignCustomerToTier's overrideDuration option, which writes
    // manualOverrideExpiry to CustomerTierState.
    expect(body).toMatch(/overrideDuration\s*:\s*config\.durationDays/);
    // permanent = true only when duration is absent.
    expect(body).toMatch(/permanentOverride\s*:\s*!config\.durationDays/);
  });

  it("deliverTierUpgradeReward gracefully handles the 'already in this tier' case", () => {
    const body = getDeliverTierUpgradeBody();
    // assignCustomerToTier returns success=false with a specific message
    // when the customer is already in the target tier. The challenge
    // claimer shouldn't see this as an error — they earned it.
    expect(body).toMatch(/already in this tier/);
  });
});
