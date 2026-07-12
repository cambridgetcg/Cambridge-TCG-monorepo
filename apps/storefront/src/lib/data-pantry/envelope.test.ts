import { describe, expect, it } from "vitest";
import { envelope } from "./envelope";

const base = {
  data: { ok: true },
  endpoint: "/api/v1/example",
  sources: ["self"],
  request_id: "req_test",
} as const;

describe("response envelope rights", () => {
  it("does not infer reuse permission when source rights are absent", () => {
    expect(envelope(base)._meta.license).toBe("NOASSERTION");
  });

  it("uses CC0 only when every declared source is CC0", () => {
    expect(
      envelope({ ...base, source_license: ["cc0"] })._meta.license,
    ).toBe("CC0-1.0");
    expect(
      envelope({
        ...base,
        sources: ["self", "upstream"],
        source_license: ["cc0", "internal-only"],
      })._meta.license,
    ).toBe("NOASSERTION");
  });

  it("preserves an endpoint's explicit response license", () => {
    expect(
      envelope({ ...base, license: "CC-BY-4.0" })._meta.license,
    ).toBe("CC-BY-4.0");
  });

  it("does not let an explicit CC0 claim override restrictive source rights", () => {
    expect(
      envelope({
        ...base,
        license: "CC0-1.0",
        source_license: ["internal-only"],
      })._meta.license,
    ).toBe("NOASSERTION");
  });
});
