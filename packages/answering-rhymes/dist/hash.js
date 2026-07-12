import { canonicalAnsweringRhymeStatementBytes } from "./canonical.js";
export class AnsweringRhymeCryptoUnavailableError extends Error {
    constructor() {
        super("A Web Crypto SHA-256 digest provider is required. Pass one explicitly in runtimes without globalThis.crypto.subtle.");
        this.name = "AnsweringRhymeCryptoUnavailableError";
    }
}
export class AnsweringRhymeInvalidDigestError extends Error {
    receivedBytes;
    constructor(receivedBytes) {
        super(receivedBytes === null
            ? "The SHA-256 digest provider did not return an ArrayBuffer."
            : `The SHA-256 digest provider returned ${receivedBytes} bytes; expected exactly 32.`);
        this.receivedBytes = receivedBytes;
        this.name = "AnsweringRhymeInvalidDigestError";
    }
}
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;
/** Use the built-in internal-slot check; `instanceof` fails across JS realms. */
function arrayBufferByteLength(value) {
    if (!ARRAY_BUFFER_BYTE_LENGTH)
        return null;
    try {
        return ARRAY_BUFFER_BYTE_LENGTH.call(value);
    }
    catch {
        return null;
    }
}
function availableDigestProvider(injected) {
    if (injected)
        return injected;
    const subtle = globalThis.crypto?.subtle;
    if (!subtle)
        throw new AnsweringRhymeCryptoUnavailableError();
    return subtle;
}
export async function answeringRhymeStatementContentHash(statement, digestProvider) {
    const canonicalBytes = canonicalAnsweringRhymeStatementBytes(statement);
    // Copy into a guaranteed ArrayBuffer so the public provider contract stays
    // portable to TypeScript versions that predate generic typed arrays.
    const digestInput = new ArrayBuffer(canonicalBytes.byteLength);
    new Uint8Array(digestInput).set(canonicalBytes);
    const digest = await availableDigestProvider(digestProvider).digest("SHA-256", digestInput);
    const receivedBytes = arrayBufferByteLength(digest);
    if (receivedBytes !== 32) {
        throw new AnsweringRhymeInvalidDigestError(receivedBytes);
    }
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
}
/** Hash equality only; this does not verify identity, authority, or issuer. */
export async function checkAnsweringRhymeStatementHash(statement, expected, digestProvider) {
    return ((await answeringRhymeStatementContentHash(statement, digestProvider)) ===
        expected.toLowerCase());
}
//# sourceMappingURL=hash.js.map