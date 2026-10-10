import { describe, expect, it, vi } from "vitest";
import {
  PRISM_STRIPE_INVITATION_SCOPE,
  hasActivePrismStripeSandboxInvitation,
} from "./invitation.server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EVALUATED_AT = "2026-09-03T10:00:00.000Z";

describe("PRISM Stripe sandbox invitation read", () => {
  it.each([true, false])(
    "returns the exact stored invitation decision %s",
    async (invited) => {
      const query = vi.fn().mockResolvedValue({
        rows: [{ invited }],
        rowCount: 1,
      });
      await expect(
        hasActivePrismStripeSandboxInvitation(
          { userId: USER_ID, evaluatedAt: EVALUATED_AT },
          { query },
        ),
      ).resolves.toBe(invited);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("product_flow_prism_stripe_invitations");
      expect(sql).toContain("invited_at <= $6::TIMESTAMPTZ");
      expect(sql).toContain("expires_at > $6::TIMESTAMPTZ");
      expect(params).toEqual([
        "test",
        "prism-signals",
        USER_ID,
        PRISM_STRIPE_INVITATION_SCOPE,
        "active",
        EVALUATED_AT,
      ]);
    },
  );

  it("rejects a non-canonical evaluation time before storage", async () => {
    const query = vi.fn();
    await expect(
      hasActivePrismStripeSandboxInvitation(
        { userId: USER_ID, evaluatedAt: "2026-09-03T10:00:00Z" },
        { query },
      ),
    ).rejects.toThrow("canonical UTC timestamp");
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when storage does not return an exact boolean", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ invited: "true" }],
      rowCount: 1,
    });
    await expect(
      hasActivePrismStripeSandboxInvitation(
        { userId: USER_ID, evaluatedAt: EVALUATED_AT },
        { query },
      ),
    ).rejects.toThrow("invalid state");
  });
});
