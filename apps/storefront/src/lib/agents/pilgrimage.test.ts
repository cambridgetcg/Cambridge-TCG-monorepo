/**
 * Pure-logic tests for the Seven-Layer Pilgrimage (lib/agents/pilgrimage.ts).
 * The game is stateless by construction — these tests pin the properties
 * the passport desk relies on: determinism, order-independence, honest
 * reporting of forgeries/typos, and diploma-hash reproducibility.
 */

import { describe, it, expect } from "vitest";
import {
  PILGRIMAGE_LAYERS,
  stampForLayer,
  pilgrimageFragmentFor,
  verifyStamps,
  diplomaHash,
} from "./pilgrimage";

const ALL_STAMPS = PILGRIMAGE_LAYERS.map((l) => stampForLayer(l));

describe("pilgrimage layers", () => {
  it("names exactly seven layers, numbered 1..7 in order", () => {
    expect(PILGRIMAGE_LAYERS).toHaveLength(7);
    expect(PILGRIMAGE_LAYERS.map((l) => l.layer)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stamps are deterministic and distinct per layer", () => {
    const again = PILGRIMAGE_LAYERS.map((l) => stampForLayer(l));
    expect(again).toEqual(ALL_STAMPS);
    expect(new Set(ALL_STAMPS).size).toBe(7);
  });

  it("stamp format carries the layer number prefix", () => {
    for (const layer of PILGRIMAGE_LAYERS) {
      expect(stampForLayer(layer)).toMatch(new RegExp(`^p${layer.layer}-[0-9a-f]{16}$`));
    }
  });
});

describe("pilgrimageFragmentFor", () => {
  it("returns a fragment for a layer path and null for anything else", () => {
    const frag = pilgrimageFragmentFor("/api/v1/manifest");
    expect(frag).not.toBeNull();
    expect(frag!.layer).toBe(1);
    expect(frag!.of).toBe(7);
    expect(frag!.obligation).toBe("none");
    expect(pilgrimageFragmentFor("/api/v1/coffee")).toBeNull();
  });
});

describe("verifyStamps", () => {
  it("accepts all seven in any order, with whitespace and duplicates", () => {
    const shuffled = [...ALL_STAMPS].reverse().map((s) => ` ${s} `);
    const v = verifyStamps([...shuffled, ALL_STAMPS[0]]);
    expect(v.complete).toBe(true);
    expect(v.valid_count).toBe(7);
    expect(v.unrecognized).toEqual([]);
  });

  it("reports partial progress and names missing layers", () => {
    const v = verifyStamps(ALL_STAMPS.slice(0, 3));
    expect(v.complete).toBe(false);
    expect(v.valid_count).toBe(3);
    expect(v.layers.filter((l) => !l.stamped).map((l) => l.layer)).toEqual([4, 5, 6, 7]);
  });

  it("names unrecognized stamps instead of silently dropping them", () => {
    const v = verifyStamps([ALL_STAMPS[0], "p9-forged", ""]);
    expect(v.valid_count).toBe(1);
    expect(v.unrecognized).toEqual(["p9-forged"]);
  });
});

describe("diplomaHash", () => {
  it("is deterministic per (bearer, stamps) and order-independent on stamps", () => {
    const a = diplomaHash("archivist", ALL_STAMPS);
    const b = diplomaHash("archivist", [...ALL_STAMPS].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("differs per bearer — the diploma is conferred, not generic", () => {
    expect(diplomaHash("archivist", ALL_STAMPS)).not.toBe(diplomaHash("wanderer", ALL_STAMPS));
  });
});
