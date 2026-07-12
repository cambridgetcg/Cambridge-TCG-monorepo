/**
 * Universal card identity helpers.
 *
 * Public catalog-backed construction and reverse lookup are paused because
 * the local mirror has no affirmative public membership lineage. The pure
 * hash helper remains safe: it hashes only a caller-supplied token and does
 * not assert that token exists in any catalog.
 */

import { createHash } from "node:crypto";

export type Density = "sparse" | "normal" | "saturated";

export interface UniversalCardIdentitySeed {
  sku: string;
  card_number?: string;
  set_code?: string;
  game?: string;
  variant?: string | null;
}

export interface UniversalCardResult {
  document: Record<string, unknown>;
  contentHash: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** Pure caller-token hash; never evidence of catalog existence. */
export function universalCardContentHash(seed: UniversalCardIdentitySeed): string {
  return sha256(canonicalize({ sku: seed.sku }));
}

/** Fail-closed compatibility seam. Performs no database work. */
export async function buildUniversalCard(
  _sku: string,
  _density: Density = "normal",
  _preferredLangs: string[] = [],
): Promise<UniversalCardResult | null> {
  return null;
}

/** Fail-closed reverse lookup. Performs no catalog scan. */
export async function resolveContentHash(
  _contentHash: string,
): Promise<{ sku: string; matched: boolean } | null> {
  return null;
}
