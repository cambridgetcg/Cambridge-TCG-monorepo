/** Cambridge-specific witness receipt built on the neutral protocol core. */
import {
  ANSWERING_RHYME_CANONICALIZATION,
  ANSWERING_RHYME_STATEMENT_SCHEMA,
  answeringRhymeStatementContentHash,
  type AnsweringRhymeStatement,
  type AnsweringRhymeStatementWarning,
  type Sha256ContentHash,
} from "@cambridge-tcg/answering-rhymes";

export * from "@cambridge-tcg/answering-rhymes";

export const CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA =
  "cambridgetcg.answering-rhyme-statement-witness/1" as const;
export const ANSWERING_RHYME_STATEMENTS_ENDPOINT =
  "/api/v1/culture/answering-rhymes/statements" as const;

export interface CambridgeAnsweringRhymeWitnessReceipt {
  readonly schema: typeof CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA;
  readonly statement_schema: typeof ANSWERING_RHYME_STATEMENT_SCHEMA;
  readonly canonicalization: typeof ANSWERING_RHYME_CANONICALIZATION;
  readonly content_hash: Sha256ContentHash;
  readonly witnessed_at: string;
  readonly replay_detection: false;
  readonly uniqueness_not_asserted: true;
  readonly issuer_attestation: {
    readonly signed: false;
    readonly independently_verifiable: false;
    readonly witnessed_at_is_unattested_observation: true;
  };
  readonly statement: AnsweringRhymeStatement;
  readonly validation_warnings: readonly AnsweringRhymeStatementWarning[];
  readonly target: {
    readonly relation_key: string;
    readonly target_revision: string;
    readonly status: "known-current" | "not-current";
    readonly evaluated_against: "cambridgetcg-static-corpus";
  };
  readonly witness: {
    readonly system: "cambridgetcg";
    readonly endpoint: typeof ANSWERING_RHYME_STATEMENTS_ENDPOINT;
    readonly authenticated: false;
    readonly identity_verified: false;
    readonly persisted: false;
    readonly authoritative_effect: "none";
  };
  readonly storage_boundary: {
    readonly application_record_created: false;
    readonly retrievable_statement_created: false;
    readonly infrastructure_access_logs_may_exist: true;
  };
  readonly authority_boundary: {
    readonly declared_role_is_self_asserted: true;
    readonly evidence_was_verified: false;
    readonly correction_effect: "proposal-only";
    readonly withdrawal_effect: "none-without-separate-authority-verification";
  };
}

/**
 * Build Cambridge's receipt for an already validated statement.
 * `witnessed_at` is deliberately outside the portable statement hash.
 */
export async function witnessAnsweringRhymeStatement(
  statement: AnsweringRhymeStatement,
  warnings: readonly AnsweringRhymeStatementWarning[],
  targetStatus: "known-current" | "not-current",
  witnessedAt = new Date().toISOString(),
): Promise<CambridgeAnsweringRhymeWitnessReceipt> {
  return {
    schema: CAMBRIDGE_ANSWERING_RHYME_WITNESS_SCHEMA,
    statement_schema: ANSWERING_RHYME_STATEMENT_SCHEMA,
    canonicalization: ANSWERING_RHYME_CANONICALIZATION,
    content_hash: await answeringRhymeStatementContentHash(statement),
    witnessed_at: new Date(witnessedAt).toISOString(),
    replay_detection: false,
    uniqueness_not_asserted: true,
    issuer_attestation: {
      signed: false,
      independently_verifiable: false,
      witnessed_at_is_unattested_observation: true,
    },
    statement,
    validation_warnings: warnings,
    target: {
      relation_key: statement.relation_key,
      target_revision: statement.target_revision,
      status: targetStatus,
      evaluated_against: "cambridgetcg-static-corpus",
    },
    witness: {
      system: "cambridgetcg",
      endpoint: ANSWERING_RHYME_STATEMENTS_ENDPOINT,
      authenticated: false,
      identity_verified: false,
      persisted: false,
      authoritative_effect: "none",
    },
    storage_boundary: {
      application_record_created: false,
      retrievable_statement_created: false,
      infrastructure_access_logs_may_exist: true,
    },
    authority_boundary: {
      declared_role_is_self_asserted: true,
      evidence_was_verified: false,
      correction_effect: "proposal-only",
      withdrawal_effect: "none-without-separate-authority-verification",
    },
  };
}
