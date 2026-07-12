import {
  type AnsweringRhymeStatement,
  type AnsweringRhymeStatementIssue,
  type AnsweringRhymeStatementWarning,
  type Sha256ContentHash,
  validateAnsweringRhymeStatement,
} from "./contract.js";
import {
  canonicalAnsweringRhymeStatement,
  canonicalAnsweringRhymeStatementBytes,
} from "./canonical.js";
import {
  answeringRhymeStatementContentHash,
  type AnsweringRhymeSha256DigestProvider,
} from "./hash.js";

export interface PreparedAnsweringRhymeStatement {
  readonly statement: AnsweringRhymeStatement;
  readonly warnings: readonly AnsweringRhymeStatementWarning[];
  readonly canonicalJson: string;
  readonly canonicalBytes: Uint8Array;
  readonly contentHash: Sha256ContentHash;
  /** Informational only; transport limits apply to the caller's raw JSON bytes. */
  readonly canonicalBytesLength: number;
}

export type AnsweringRhymeStatementPreparation =
  | { readonly ok: true; readonly value: PreparedAnsweringRhymeStatement }
  | { readonly ok: false; readonly issues: readonly AnsweringRhymeStatementIssue[] };

/**
 * Validate, normalize, freeze, canonicalize, and hash a portable statement.
 * No network, evidence fetch, identity check, storage, or telemetry occurs.
 */
export async function prepareAnsweringRhymeStatement(
  input: unknown,
  digestProvider?: AnsweringRhymeSha256DigestProvider,
): Promise<AnsweringRhymeStatementPreparation> {
  const validation = validateAnsweringRhymeStatement(input);
  if (!validation.ok) return validation;

  const statement = validation.value;
  const warnings = Object.freeze(
    validation.warnings.map((warning) => Object.freeze({ ...warning })),
  );
  const canonicalJson = canonicalAnsweringRhymeStatement(statement);
  const canonicalBytes = canonicalAnsweringRhymeStatementBytes(statement);

  return {
    ok: true,
    value: {
      statement,
      warnings,
      canonicalJson,
      canonicalBytes,
      contentHash: await answeringRhymeStatementContentHash(
        statement,
        digestProvider,
      ),
      canonicalBytesLength: canonicalBytes.byteLength,
    },
  };
}
