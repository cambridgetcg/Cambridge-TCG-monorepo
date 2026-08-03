import { describe, expect, it, vi } from "vitest";
import { resolveCashloomPaymentPreparationMode } from "./preparation-mode";

vi.mock("server-only", () => ({}));

describe("CashLoom preparation rollout mode", () => {
  it("fails closed unless record_only is configured exactly", () => {
    expect(resolveCashloomPaymentPreparationMode(undefined)).toBe("disabled");
    expect(resolveCashloomPaymentPreparationMode("disabled")).toBe("disabled");
    expect(resolveCashloomPaymentPreparationMode("enabled")).toBe("disabled");
    expect(resolveCashloomPaymentPreparationMode(" record_only ")).toBe("record_only");
  });
});
