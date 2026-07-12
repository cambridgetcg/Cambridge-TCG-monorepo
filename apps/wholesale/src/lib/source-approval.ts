import type { IngestContext, SourceId } from "@cambridge-tcg/data-ingest";

export type SourceApproval = NonNullable<IngestContext["source_approval"]>;

const ENV_PREFIX: Partial<Record<SourceId, string>> = {
  cardrush: "CARDRUSH",
  tcgplayer: "TCGPLAYER",
  ebay: "EBAY",
};

/**
 * Read executable contract evidence before any token mint, fetch or database
 * write. These values are references/decisions, never secrets.
 *
 * Required variables for SOURCE=TCGPLAYER (and equivalently EBAY/CARDRUSH):
 *   TCGPLAYER_APPROVAL_REFERENCE
 *   TCGPLAYER_APPROVAL_REVIEWED_AT=YYYY-MM-DD
 *   TCGPLAYER_APPROVED_USE_CASES=catalog,pricing
 */
export function requireSourceApproval(
  sourceId: "cardrush" | "tcgplayer" | "ebay",
  useCase: string,
): SourceApproval {
  const prefix = ENV_PREFIX[sourceId]!;
  const agreement_reference = (process.env[`${prefix}_APPROVAL_REFERENCE`] ?? "").trim();
  const reviewed_at = (process.env[`${prefix}_APPROVAL_REVIEWED_AT`] ?? "").trim();
  const approved_use_cases = (process.env[`${prefix}_APPROVED_USE_CASES`] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    agreement_reference.length < 8 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reviewed_at) ||
    !approved_use_cases.includes(useCase)
  ) {
    throw new Error(
      `${sourceId} source approval missing for '${useCase}'. Credentials alone do not authorise this use. Record ${prefix}_APPROVAL_REFERENCE, ${prefix}_APPROVAL_REVIEWED_AT=YYYY-MM-DD and include '${useCase}' in ${prefix}_APPROVED_USE_CASES before token mint, fetch or storage.`,
    );
  }

  return {
    source_id: sourceId,
    agreement_reference,
    reviewed_at,
    approved_use_cases,
  };
}
