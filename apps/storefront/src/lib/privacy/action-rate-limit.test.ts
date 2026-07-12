import { describe, expect, it } from "vitest";
import { hashActionRateLimitSubject } from "./action-rate-hash";

describe("privacy action rate-limit subject hashing", () => {
  const base = {
    secret: "a-safe-test-secret-that-is-longer-than-thirty-two-characters",
    action: "feedback-submit",
    subject: "ip:203.0.113.7",
    windowName: "hour",
    windowStartEpochSeconds: 1_788_739_200,
  };

  it("is deterministic without revealing the raw subject", () => {
    const first = hashActionRateLimitSubject(base);
    const second = hashActionRateLimitSubject(base);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("203.0.113.7");
  });

  it("cannot be linked across actions or exact windows", () => {
    const first = hashActionRateLimitSubject(base);
    const otherAction = hashActionRateLimitSubject({
      ...base,
      action: "collective-create",
    });
    const nextWindow = hashActionRateLimitSubject({
      ...base,
      windowStartEpochSeconds: base.windowStartEpochSeconds + 3600,
    });

    expect(otherAction).not.toBe(first);
    expect(nextWindow).not.toBe(first);
  });
});
