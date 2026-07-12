import {
  getSource,
  type LicenseTier,
  type SourceId,
  type SourceMeta,
  type SourceRightsSafeDefault,
} from "@cambridge-tcg/data-ingest";

/**
 * The public API must make its decision from the reviewed source registry,
 * never from a historical database row. Old rows can retain a stale
 * `source_redistribute=true` value after a rights review tightens.
 */
export interface PublicSourceDecision {
  source: string;
  source_license_tier: LicenseTier;
  safe_default: SourceRightsSafeDefault;
  exact_values_public: boolean;
  reviewed_at: string | null;
  rights_url: string;
  reason: string;
}

const UNKNOWN_DECISION: Omit<PublicSourceDecision, "source" | "rights_url"> = {
  source_license_tier: "internal-only",
  safe_default: "internal-only",
  exact_values_public: false,
  reviewed_at: null,
  reason:
    "No current reviewed source record permits public exact-value display. The source fails closed until its code, data, image and redistribution rights are recorded.",
};

/**
 * Exact public values require every affirmative registry signal. A source
 * with conditional display terms, an application-specific contract, a
 * no-fetch decision, or an unknown verdict is not admitted by this helper.
 */
export function sourceAllowsPublicExactValues(meta: SourceMeta): boolean {
  return (
    meta.redistribute === true &&
    meta.rights.redistribution.verdict === "permitted" &&
    meta.rights.safe_default === "redistribute"
  );
}

export function publicSourceDecision(source: string): PublicSourceDecision {
  const registered = getSource(source as SourceId);
  if (!registered) {
    return {
      source,
      rights_url: `/api/v1/sources/${encodeURIComponent(source)}`,
      ...UNKNOWN_DECISION,
    };
  }

  const { meta } = registered;
  const exactValuesPublic = sourceAllowsPublicExactValues(meta);
  return {
    source,
    source_license_tier: meta.license,
    safe_default: meta.rights.safe_default,
    exact_values_public: exactValuesPublic,
    reviewed_at: meta.rights.reviewed_at,
    rights_url: `/api/v1/sources/${encodeURIComponent(source)}`,
    reason: exactValuesPublic
      ? "The current reviewed source record permits redistribution of exact data values."
      : `Exact values and aggregates are omitted: the current reviewed source record has safe_default='${meta.rights.safe_default}' and redistribution verdict='${meta.rights.redistribution.verdict}'.`,
  };
}

export interface PublicSourceGap extends PublicSourceDecision {
  status: "withheld-by-source-rights";
  exact_values_included: false;
  aggregates_included: false;
}

export function publicSourceGap(source: string): PublicSourceGap {
  const decision = publicSourceDecision(source);
  return {
    ...decision,
    status: "withheld-by-source-rights",
    exact_values_included: false,
    aggregates_included: false,
  };
}
