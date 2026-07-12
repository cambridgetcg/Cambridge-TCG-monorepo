/**
 * Portable replies to an Answering Rhyme.
 *
 * The statement is deliberately neutral: Cambridge and Artbitrage can both
 * validate and hash the same document without either system owning it. This
 * module owns only the neutral wire statement and its deterministic
 * normalization. Provider-specific receipts, network calls, storage, identity,
 * and authority decisions deliberately live outside this package.
 */
export declare const ANSWERING_RHYME_STATEMENT_SCHEMA: "answering-rhyme.statement/1";
export declare const ANSWERING_RHYME_CANONICALIZATION: "answering-rhyme.canonical-json/1";
export declare const ANSWERING_RHYME_STATEMENT_KINDS: readonly ["bless", "contextualize", "correct", "withdraw"];
export type AnsweringRhymeStatementKind = (typeof ANSWERING_RHYME_STATEMENT_KINDS)[number];
export declare const ANSWERING_RHYME_CLAIMED_ROLES: readonly ["viewer", "relation-curator", "card-rights-holder", "artwork-rights-holder", "source-institution", "other"];
export type AnsweringRhymeClaimedRole = (typeof ANSWERING_RHYME_CLAIMED_ROLES)[number];
export declare const ANSWERING_RHYME_STATEMENT_LIMITS: {
    readonly request_bytes: 16384;
    readonly relation_key_chars: 256;
    readonly target_revision_chars: 100;
    readonly body_chars: 2000;
    readonly language_chars: 35;
    readonly author_label_chars: 160;
    readonly url_chars: 1000;
    readonly urls_per_list: 12;
};
export type Sha256ContentHash = `sha256:${string}`;
declare const NORMALIZED_ANSWERING_RHYME_STATEMENT: unique symbol;
export interface AnsweringRhymeStatement {
    /** Runtime/type brand added only by this contract's validator. */
    readonly [NORMALIZED_ANSWERING_RHYME_STATEMENT]: true;
    readonly schema: typeof ANSWERING_RHYME_STATEMENT_SCHEMA;
    readonly canonicalization: typeof ANSWERING_RHYME_CANONICALIZATION;
    readonly relation_key: string;
    /** Opaque revision of the relation this statement actually answered. */
    readonly target_revision: string;
    readonly kind: AnsweringRhymeStatementKind;
    readonly body: string;
    /** BCP 47-ish language tag; `und` means intentionally undeclared. */
    readonly language: string;
    readonly declared_by: {
        readonly label: string;
        /** A self-declared role, not an authenticated identity or authority. */
        readonly claimed_role: AnsweringRhymeClaimedRole;
        readonly canonical_url: string | null;
    };
    /** Required so two witnesses hash the same statement independently. */
    readonly declared_at: string;
    /** Optional prior portable statement. A relation-level withdrawal may omit it. */
    readonly in_response_to: Sha256ContentHash | null;
    readonly evidence_urls: readonly string[];
    /** Pointers a future, separate authority verifier may inspect. */
    readonly authority_evidence_urls: readonly string[];
}
export type AnsweringRhymeStatementIssueCode = "required" | "wrong_type" | "unknown_field" | "unsupported_value" | "too_long" | "too_many" | "control_character" | "invalid_format";
export interface AnsweringRhymeStatementIssue {
    path: string;
    code: AnsweringRhymeStatementIssueCode;
    message: string;
}
export interface AnsweringRhymeStatementWarning {
    path: string;
    code: "evidence_missing" | "authority_is_self_declared";
    message: string;
}
export type AnsweringRhymeStatementValidation = {
    ok: true;
    value: AnsweringRhymeStatement;
    warnings: readonly AnsweringRhymeStatementWarning[];
} | {
    ok: false;
    issues: readonly AnsweringRhymeStatementIssue[];
};
export declare function isNormalizedAnsweringRhymeStatement(value: unknown): value is AnsweringRhymeStatement;
/**
 * Strictly validate and normalize a portable statement.
 *
 * Optional values become explicit (`und`, `null`, or `[]`) before hashing.
 * Unknown fields fail rather than disappearing from a witness receipt.
 */
export declare function validateAnsweringRhymeStatement(input: unknown): AnsweringRhymeStatementValidation;
export {};
//# sourceMappingURL=contract.d.ts.map