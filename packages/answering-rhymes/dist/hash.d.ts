import type { AnsweringRhymeStatement, Sha256ContentHash } from "./contract.js";
export declare class AnsweringRhymeCryptoUnavailableError extends Error {
    constructor();
}
export declare class AnsweringRhymeInvalidDigestError extends Error {
    readonly receivedBytes: number | null;
    constructor(receivedBytes: number | null);
}
/**
 * The one Web Crypto capability this package needs.
 *
 * Keeping this interface package-owned prevents the public declarations from
 * forcing Node-only TypeScript consumers to include the complete DOM library.
 * `globalThis.crypto.subtle` and Node's `webcrypto.subtle` both satisfy it.
 */
export interface AnsweringRhymeSha256DigestProvider {
    digest(algorithm: "SHA-256", data: ArrayBuffer): Promise<ArrayBuffer>;
}
export declare function answeringRhymeStatementContentHash(statement: AnsweringRhymeStatement, digestProvider?: AnsweringRhymeSha256DigestProvider): Promise<Sha256ContentHash>;
/** Hash equality only; this does not verify identity, authority, or issuer. */
export declare function checkAnsweringRhymeStatementHash(statement: AnsweringRhymeStatement, expected: Sha256ContentHash, digestProvider?: AnsweringRhymeSha256DigestProvider): Promise<boolean>;
//# sourceMappingURL=hash.d.ts.map