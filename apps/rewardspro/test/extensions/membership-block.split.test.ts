/**
 * Pins the MembershipBlock orchestrator split.
 *
 * Before: one ~2207-line file with interfaces, utility functions, ~15
 * card sub-components, ~200 lines of data-fetch / loading / refresh /
 * error state, and a ~600-line render.
 *
 * After: same file, minus:
 *   - `LoyaltyData` + dependent interfaces → `./types/loyaltyData.ts`
 *   - Data lifecycle (fetch + mock + refresh + error) → `./hooks/useLoyaltyData.ts`
 * Orchestrator now consumes the hook and threads `loyaltyData` into the
 * existing render tree. Cards stay alongside the orchestrator because
 * they're tightly coupled to the shape of `LoyaltyData` — moving them
 * to separate files is deferred.
 *
 * Source-level test — guarantees the orchestrator doesn't re-grow.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const EXT = path.resolve(
  __dirname,
  "../../extensions/rewards-pro-membership/src"
);

const MEMBERSHIP = fs.readFileSync(path.join(EXT, "MembershipBlock.tsx"), "utf-8");
const USE_LOYALTY = fs.readFileSync(path.join(EXT, "hooks/useLoyaltyData.ts"), "utf-8");
const TYPES = fs.readFileSync(path.join(EXT, "types/loyaltyData.ts"), "utf-8");

describe("useLoyaltyData hook — owns the data lifecycle", () => {
  it("exports the hook and its input/return types", () => {
    expect(USE_LOYALTY).toMatch(/export\s+function\s+useLoyaltyData\s*\(/);
    expect(USE_LOYALTY).toMatch(/export\s+interface\s+UseLoyaltyDataInput/);
    expect(USE_LOYALTY).toMatch(/export\s+interface\s+UseLoyaltyDataReturn/);
  });

  it("returns the five-piece state: loyaltyData, isLoading, isRefreshing, error, refresh", () => {
    for (const field of [
      "loyaltyData",
      "isLoading",
      "isRefreshing",
      "error",
      "refresh",
    ]) {
      expect(USE_LOYALTY).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("handles the editor preview mock path", () => {
    // Shopify's checkout/theme editor hits this code WITHOUT a session;
    // the hook must short-circuit to mock data so merchants can preview.
    expect(USE_LOYALTY).toMatch(/isInEditor/);
    expect(USE_LOYALTY).toMatch(/getMockData\s*\(\s*\)/);
  });

  it("distinguishes initial-load (isLoading) from refresh (isRefreshing)", () => {
    // Two separate flags so the UI can show a skeleton on first load
    // but a button spinner on pull-to-refresh.
    expect(USE_LOYALTY).toMatch(/setIsLoading\(true\)/);
    expect(USE_LOYALTY).toMatch(/setIsRefreshing\(true\)/);
  });

  it("only surfaces errors to authenticated customers", () => {
    // Unauthenticated state renders the preview banner; we must not
    // flash an "error" to customers who haven't signed in yet.
    expect(USE_LOYALTY).toMatch(/if\s*\(\s*isAuthenticated\s*\)/);
  });
});

describe("types/loyaltyData.ts — LoyaltyData shape lives in its own module", () => {
  it("exports the LoyaltyData type", () => {
    expect(TYPES).toMatch(/export\s+interface\s+LoyaltyData\b/);
  });

  it("exports every dependent interface the orchestrator needs", () => {
    for (const name of [
      "CustomerInfo",
      "BalanceInfo",
      "TierSourceDetails",
      "TierInfo",
      "ProgressInfo",
      "MaintenanceInfo",
      "TransactionInfo",
      "AllTierInfo",
      "SpendingProgressInfo",
      "PendingCashbackInfo",
      "TierChangeInfo",
      "DataFreshnessInfo",
    ]) {
      expect(TYPES, `missing export: ${name}`).toMatch(
        new RegExp(`export\\s+interface\\s+${name}\\b`)
      );
    }
  });
});

describe("MembershipBlock.tsx — orchestrator shape", () => {
  it("imports useLoyaltyData from its new module", () => {
    expect(MEMBERSHIP).toMatch(
      /import\s*\{\s*useLoyaltyData\s*\}\s*from\s*["']\.\/hooks\/useLoyaltyData["']/
    );
  });

  it("imports LoyaltyData + dependent types from ./types/loyaltyData", () => {
    expect(MEMBERSHIP).toMatch(
      /from\s*["']\.\/types\/loyaltyData["']/
    );
  });

  it("no longer declares LoyaltyData locally", () => {
    // The orchestrator previously had `interface LoyaltyData { ... }`.
    // Keeping it would defeat the hook extraction — the hook and
    // orchestrator would import the same name from different modules.
    expect(MEMBERSHIP).not.toMatch(/^\s*interface\s+LoyaltyData\b/m);
  });

  it("no longer declares the data-fetch lifecycle inline", () => {
    // The useCallback + three useState + two useEffect block is gone.
    // These patterns are what we're making sure doesn't grow back.
    expect(MEMBERSHIP).not.toMatch(/setLoyaltyData\s*\(/);
    expect(MEMBERSHIP).not.toMatch(/setDataLoading\s*\(/);
    // The refresh function is now returned by the hook.
    expect(MEMBERSHIP).not.toMatch(/const\s+fetchLoyaltyData\s*=\s*useCallback/);
  });

  it("orchestrator calls useLoyaltyData exactly once", () => {
    const calls = MEMBERSHIP.match(/useLoyaltyData\s*\(/g) || [];
    // One call (the import doesn't match because the regex requires `(`).
    expect(calls.length).toBe(1);
  });

  it("orchestrator shrank dramatically", () => {
    // Before the full split: 2207 lines (orchestrator + types + hook +
    // formatters + mockData + ~15 card components all in one file).
    // After extractions (types → types/loyaltyData; hook →
    // hooks/useLoyaltyData; formatters → utils/format; mock →
    // mockData.ts; cards → components/overview-cards), the orchestrator
    // is ~1500 lines lighter. Guardrail: under 900.
    const lineCount = MEMBERSHIP.split("\n").length;
    expect(lineCount).toBeLessThan(900);
  });

  it("formatters live in utils/format.ts, not in the orchestrator", () => {
    expect(MEMBERSHIP).toMatch(/from\s*["']\.\/utils\/format["']/);
    expect(MEMBERSHIP).not.toMatch(/^function formatCurrency\s*\(/m);
    expect(MEMBERSHIP).not.toMatch(/^function formatDate\s*\(/m);
    expect(MEMBERSHIP).not.toMatch(/^function formatMonthYear\s*\(/m);
  });

  it("editor mock data lives in mockData.ts", () => {
    expect(MEMBERSHIP).toMatch(/from\s*["']\.\/mockData["']/);
    expect(MEMBERSHIP).not.toMatch(/^function getMockData\s*\(/m);
  });

  it("overview cards live in components/overview-cards.tsx", () => {
    expect(MEMBERSHIP).toMatch(
      /from\s*["']\.\/components\/overview-cards["']/
    );
    // None of the extracted card functions are still defined inline.
    for (const name of [
      "MembershipSkeleton",
      "WelcomeHeader",
      "MembershipCard",
      "BalanceCardWithPending",
      "WelcomeCard",
      "TierChangeBanner",
      "StaleDataBanner",
      "StarterTierCard",
      "ProgressCard",
      "MaxTierCard",
      "DualProgressCard",
      "ActivityCard",
      "AllTiersCard",
    ]) {
      expect(
        MEMBERSHIP,
        `${name} should no longer be defined in the orchestrator`
      ).not.toMatch(new RegExp(`^function ${name}\\b`, "m"));
    }
  });
});
