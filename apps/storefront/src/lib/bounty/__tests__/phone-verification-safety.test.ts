import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/db", () => ({ query: mocks.query }));

import { getEligibility } from "@/lib/bounty/db";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("bounty phone-verification safety", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("does not trust a legacy self-certified phone row", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ paid: true }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{
          first_order_paid: true,
          phone_verified: true,
          phone_number: "+44000000000",
        }],
        rowCount: 1,
      });

    const eligibility = await getEligibility("account-1");

    expect(eligibility).toEqual({
      user_id: "account-1",
      phone_verified: false,
      phone_verification_available: false,
      first_order_paid: true,
      eligible: false,
      reasons: ["phone_verification_unavailable"],
    });
    expect(String(mocks.query.mock.calls[1]?.[0])).toContain("SELECT first_order_paid");
    expect(String(mocks.query.mock.calls[1]?.[0])).not.toContain("phone_verified");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("closes every automated value-release path without accepting new numbers", () => {
    const verifyRoute = source("src/app/api/bounty/verify-phone/route.ts");
    expect(verifyRoute).toContain('code: "phone_verification_unavailable"');
    expect(verifyRoute).toContain("status: 503");
    expect(verifyRoute).not.toContain("markPhoneVerified");
    expect(verifyRoute).not.toContain("request.json");

    const resolver = source("src/lib/bounty/resolver.ts");
    const eligibilityGate = resolver.slice(
      resolver.indexOf("// 1) Eligibility"),
      resolver.indexOf("// 2) Tier config"),
    );
    expect(eligibilityGate).toContain("getEligibility");
    expect(eligibilityGate).toContain("BOUNTY_PHONE_VERIFICATION_MESSAGE");
    expect(eligibilityGate).not.toContain("consumePullToken");

    for (const path of [
      "src/app/api/bounty/vault/[id]/request-redeem/route.ts",
      "src/app/api/bounty/vault/redeem-bulk/route.ts",
      "src/app/api/bounty/vault/[id]/sell-back/route.ts",
    ]) {
      const route = source(path);
      const gate = route.slice(
        route.indexOf("getEligibility("),
        route.indexOf("getEligibility(") + 600,
      );
      expect(gate).toContain("phone_verification_unavailable");
      expect(gate).toContain("status: 403");
    }

    const page = source("src/app/bounty/page.tsx");
    expect(page).toContain("No submitted number is treated as verified.");
    expect(page).toContain("releaseAvailable={Boolean(eligibility?.eligible)}");
    expect(page).not.toContain("handleVerifyPhone");
    expect(page).not.toContain("Enter your phone number");
  });
});
