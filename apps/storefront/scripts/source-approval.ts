import {
  assertSourceUseApproved,
  type IngestContext,
  type SourceId,
} from "@cambridge-tcg/data-ingest";

/** Build and validate non-secret written-approval evidence for CLI readers. */
export function requireScriptSourceApproval(
  sourceId: SourceId,
  useCase: string,
): NonNullable<IngestContext["source_approval"]> {
  const prefix = sourceId.toUpperCase().replaceAll("-", "_");
  const approval = {
    source_id: sourceId,
    agreement_reference: (process.env[`${prefix}_APPROVAL_REFERENCE`] ?? "").trim(),
    reviewed_at: (process.env[`${prefix}_APPROVAL_REVIEWED_AT`] ?? "").trim(),
    approved_use_cases: (process.env[`${prefix}_APPROVED_USE_CASES`] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  };
  assertSourceUseApproved({ source_approval: approval }, sourceId, useCase);
  return approval;
}
