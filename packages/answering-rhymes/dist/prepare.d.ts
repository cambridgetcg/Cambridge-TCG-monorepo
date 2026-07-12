import { type AnsweringRhymeStatement, type AnsweringRhymeStatementIssue, type AnsweringRhymeStatementWarning, type Sha256ContentHash } from "./contract.js";
import { type AnsweringRhymeSha256DigestProvider } from "./hash.js";
export interface PreparedAnsweringRhymeStatement {
    readonly statement: AnsweringRhymeStatement;
    readonly warnings: readonly AnsweringRhymeStatementWarning[];
    readonly canonicalJson: string;
    readonly canonicalBytes: Uint8Array;
    readonly contentHash: Sha256ContentHash;
    /** Informational only; transport limits apply to the caller's raw JSON bytes. */
    readonly canonicalBytesLength: number;
}
export type AnsweringRhymeStatementPreparation = {
    readonly ok: true;
    readonly value: PreparedAnsweringRhymeStatement;
} | {
    readonly ok: false;
    readonly issues: readonly AnsweringRhymeStatementIssue[];
};
/**
 * Validate, normalize, freeze, canonicalize, and hash a portable statement.
 * No network, evidence fetch, identity check, storage, or telemetry occurs.
 */
export declare function prepareAnsweringRhymeStatement(input: unknown, digestProvider?: AnsweringRhymeSha256DigestProvider): Promise<AnsweringRhymeStatementPreparation>;
//# sourceMappingURL=prepare.d.ts.map