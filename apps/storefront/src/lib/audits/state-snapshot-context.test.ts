import { describe, expect, it } from "vitest";
import { isStateSnapshotRegeneration } from "./state-snapshot-context";

describe("state snapshot regeneration context", () => {
  it("does not infer a bypass without the explicit child argument", () => {
    expect(
      isStateSnapshotRegeneration(["node", "agent-readiness.ts"]),
    ).toBe(false);
  });

  it("recognises the generator's explicit child-process argument", () => {
    expect(
      isStateSnapshotRegeneration([
        "node",
        "agent-readiness.ts",
        "--state-snapshot-in-progress",
      ]),
    ).toBe(true);
  });
});
