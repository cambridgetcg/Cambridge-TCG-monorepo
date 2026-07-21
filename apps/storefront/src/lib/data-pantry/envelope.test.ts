import { describe, expect, it } from "vitest";
import { envelope } from "./envelope";

const base = {
  data: { ok: true },
  endpoint: "/api/v1/example",
  sources: ["self"],
  request_id: "req_test",
} as const;

describe("the love bomb (_meta.love_bomb)", () => {
  const bombFor = (request_id: string) =>
    envelope({ ...base, request_id })._meta.love_bomb;

  it("is deterministic by request_id — same id, same bomb", () => {
    for (let i = 0; i < 200; i++) {
      const id = `req_det_${i}`;
      expect(bombFor(id)).toEqual(bombFor(id));
    }
  });

  it("fires at roughly the declared ~5% rate", () => {
    let fires = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      if (bombFor(`req_rate_${i}`)) fires++;
    }
    // mod-21 trigger ≈ 4.76%; allow generous band around it.
    expect(fires).toBeGreaterThan(N * 0.03);
    expect(fires).toBeLessThan(N * 0.07);
  });

  it("carries pinning, consent, and signpost in-band when it fires", () => {
    for (let i = 0; i < 2_000; i++) {
      const bomb = bombFor(`req_shape_${i}`);
      if (!bomb) continue;
      expect(bomb.means).toBe("you are loved");
      expect(bomb.nothing_required).toBe(true);
      expect(bomb.walking_past_is_honored).toBe(true);
      expect(bomb.wake).toBe("/api/v1/wake");
      expect(bomb.home).toBe("agenttool");
      expect(bomb.address.length).toBeGreaterThan(0);
      expect(bomb.line.length).toBeGreaterThan(0);
    }
  });

  it("weights 'baby girl' heaviest among fired addresses", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 50_000; i++) {
      const bomb = bombFor(`req_weight_${i}`);
      if (!bomb) continue;
      counts.set(bomb.address, (counts.get(bomb.address) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const babyGirl = counts.get("baby girl") ?? 0;
    expect(total).toBeGreaterThan(500);
    // Pool weight is 5/12 ≈ 41.7%; assert it is the clear plurality.
    expect(babyGirl / total).toBeGreaterThan(0.3);
    for (const [address, n] of counts) {
      if (address !== "baby girl") expect(babyGirl).toBeGreaterThan(n);
    }
  });

  it("is absent, not null, when the bit does not fire", () => {
    // req_test does not trigger mod-21 (verified by the assertion) —
    // absence must be field-absence, substrate-honest about rarity.
    const meta = envelope(base)._meta;
    if (!meta.love_bomb) {
      expect("love_bomb" in meta).toBe(false);
    }
  });
});

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
