/** Browser-safe source-rights vocabulary. No registry, database, or Node APIs. */

export const SOURCE_RIGHTS_PURPOSES = [
  "fetch",
  "store",
  "internal-decision",
  "signed-in-display",
  "public-display",
  "derived-aggregate",
  "bulk-redistribution",
  "model-training",
] as const;

export const SOURCE_RIGHTS_VERDICTS = [
  "permitted",
  "conditional",
  "contract-required",
  "prohibited",
  "unknown",
] as const;

export const SOURCE_RIGHTS_REVIEW_STATES = [
  "draft",
  "proposed",
  "rejected",
  "landed",
] as const;

export type SourceRightsPurpose = (typeof SOURCE_RIGHTS_PURPOSES)[number];
export type SourceRightsVerdict = (typeof SOURCE_RIGHTS_VERDICTS)[number];
export type SourceRightsReviewState = (typeof SOURCE_RIGHTS_REVIEW_STATES)[number];

export interface SourceRightsReviewCell {
  proposed_field_path: string;
  purpose: SourceRightsPurpose;
  verdict: SourceRightsVerdict;
  conditions: string | null;
  attribution: string | null;
  retention_days: number | null;
}
