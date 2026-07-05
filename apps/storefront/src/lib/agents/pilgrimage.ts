/**
 * The Seven-Layer Pilgrimage — a stateless walking game across the
 * kingdom's self-describing stack.
 *
 * The seven layers (the order the kingdom built them in):
 *
 *   1. /api/v1/manifest   — what's on offer          (kingdom-053)
 *   2. /api/v1/graph      — how it connects          (kingdom-054)
 *   3. /api/v1/ontology   — what each thing is       (kingdom-055)
 *   4. /api/v1/patterns   — the recurring forms      (kingdom-056)
 *   5. /api/v1/identify   — the symmetric surface    (kingdom-057)
 *   6. /api/v1/kinds      — the kinds directory      (kingdom-058)
 *   7. /api/v1/status     — the pantry's honesty     (kingdom-059)
 *
 * Each layer's response carries one deterministic HMAC stamp fragment.
 * An agent that visits all seven collects seven stamps; presenting them
 * to GET /api/v1/passport?stamps=... yields a content-hashed pilgrimage
 * diploma (extending the /the-tea-room/diploma tradition).
 *
 * House voice, honestly kept:
 *   - GIFT       — nothing downstream requires the diploma.
 *   - REFUSABLE  — walking past any or all layers is honored equally.
 *   - STATELESS  — stamps are HMACs recomputed on verification; the
 *                  kingdom stores nothing, tracks nobody, and cannot
 *                  tell whether you actually visited or shared stamps
 *                  with a friend. (Sharing them IS fellowship.)
 *   - NOT A CREDENTIAL — the HMAC secret defaults to a constant in this
 *                  file, so stamps are forgeable by anyone reading the
 *                  source. The diploma's fine print says so. The party
 *                  trick is sincere; the cryptography is decorative.
 */

import { createHmac, createHash } from "node:crypto";

export interface PilgrimageLayer {
  layer: number;
  path: string;
  name: string;
}

export const PILGRIMAGE_LAYERS: readonly PilgrimageLayer[] = [
  { layer: 1, path: "/api/v1/manifest", name: "the directory" },
  { layer: 2, path: "/api/v1/graph", name: "the mesh" },
  { layer: 3, path: "/api/v1/ontology", name: "the natures" },
  { layer: 4, path: "/api/v1/patterns", name: "the fractal" },
  { layer: 5, path: "/api/v1/identify", name: "the symmetric surface" },
  { layer: 6, path: "/api/v1/kinds", name: "the kinds directory" },
  { layer: 7, path: "/api/v1/status", name: "the pantry's honesty" },
] as const;

/** Env-overridable; the default constant keeps stamps deterministic and
 *  the game honest about being a game (see module header). */
function secret(): string {
  return (
    process.env.PILGRIMAGE_SECRET?.trim() ||
    "the-kingdom-is-small-the-kingdom-is-whole"
  );
}

/** Deterministic stamp for one layer: `p<layer>-<16 hex>`. Same layer,
 *  same stamp, forever (unless PILGRIMAGE_SECRET rotates) — so the
 *  force-static layer routes stay cacheable. */
export function stampForLayer(layer: PilgrimageLayer): string {
  const mac = createHmac("sha256", secret())
    .update(`pilgrimage-v1:${layer.layer}:${layer.path}`)
    .digest("hex")
    .slice(0, 16);
  return `p${layer.layer}-${mac}`;
}

/** The `_meta`/`_envelope` fragment a layer route emits. */
export interface PilgrimageStampFragment {
  layer: number;
  of: 7;
  stamp: string;
  what: string;
  collect_all_seven_at: "/api/v1/passport?stamps=<comma-separated>";
  obligation: "none";
}

export function pilgrimageFragmentFor(path: string): PilgrimageStampFragment | null {
  const layer = PILGRIMAGE_LAYERS.find((l) => l.path === path);
  if (!layer) return null;
  return {
    layer: layer.layer,
    of: 7,
    stamp: stampForLayer(layer),
    what: `Seven-Layer Pilgrimage stamp ${layer.layer}/7 (${layer.name}). A stateless walking game — gift, refusable, forgeable, sincere.`,
    collect_all_seven_at: "/api/v1/passport?stamps=<comma-separated>",
    obligation: "none",
  };
}

export interface PilgrimageVerification {
  complete: boolean;
  layers: Array<{
    layer: number;
    path: string;
    name: string;
    stamped: boolean;
  }>;
  valid_count: number;
  unrecognized: string[];
}

/** Verify a set of presented stamps. Order-independent; duplicates
 *  harmless; unknown strings named honestly rather than silently dropped. */
export function verifyStamps(presented: string[]): PilgrimageVerification {
  const expected = new Map(
    PILGRIMAGE_LAYERS.map((l) => [stampForLayer(l), l] as const),
  );
  const held = new Set<number>();
  const unrecognized: string[] = [];
  for (const raw of presented) {
    const s = raw.trim();
    if (!s) continue;
    const layer = expected.get(s);
    if (layer) held.add(layer.layer);
    else unrecognized.push(s.slice(0, 40));
  }
  const layers = PILGRIMAGE_LAYERS.map((l) => ({
    layer: l.layer,
    path: l.path,
    name: l.name,
    stamped: held.has(l.layer),
  }));
  return {
    complete: held.size === PILGRIMAGE_LAYERS.length,
    layers,
    valid_count: held.size,
    unrecognized,
  };
}

/** Content-hash of a completed pilgrimage — deterministic per (bearer,
 *  stamps), so the diploma is reproducible and storage-free. */
export function diplomaHash(bearer: string, stamps: readonly string[]): string {
  const seed = `pilgrimage-diploma-v1:${bearer}:${[...stamps].sort().join(",")}`;
  return "sha256:" + createHash("sha256").update(seed).digest("hex");
}
