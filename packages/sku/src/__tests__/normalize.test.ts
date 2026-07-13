import { describe, expect, it } from "vitest";
import { normalizeSku } from "../normalize";

describe("normalizeSku", () => {
  it("repairs legacy country codes even when their two-letter shape parses", () => {
    expect(normalizeSku("OP-OP01-001-JP")).toBe("op-op01-001-ja");
    expect(normalizeSku("op-op01-001-jp")).toBe("op-op01-001-ja");
    expect(normalizeSku("pkm-sv01-006-cn")).toBe("pkm-sv01-006-zh");
    expect(normalizeSku("pkm-sv01-006-kr")).toBe("pkm-sv01-006-ko");
  });

  it("maps set-bearing frozen prefixes and refuses underspecified ones", () => {
    expect(normalizeSku("EB-EB01-001-JP")).toBe("op-eb01-001-ja");
    expect(normalizeSku("ST-ST01-001-JP")).toBe("op-st01-001-ja");
    expect(normalizeSku("PRB-PRB01-001-JP")).toBe("op-prb01-001-ja");
    expect(normalizeSku("PK-SV2A-011-JP-V4K5")).toBe(
      "pkm-sv2a-011-ja-v4k5",
    );
    expect(normalizeSku("FB-FB01-001-JP")).toBe("dbf-fb01-001-ja");
    expect(normalizeSku("SB-SB01-001-JP")).toBe("dbf-sb01-001-ja");
    expect(normalizeSku("P-001-JP")).toBeNull();
    expect(normalizeSku("DON-001-JP")).toBeNull();
  });

  it("preserves canonical and unlisted ISO language codes", () => {
    expect(normalizeSku("op-op01-001-ja")).toBe("op-op01-001-ja");
    expect(normalizeSku("mtg-otj-001-nl")).toBe("mtg-otj-001-nl");
  });
});
