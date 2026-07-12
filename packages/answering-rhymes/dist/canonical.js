import { isNormalizedAnsweringRhymeStatement, } from "./contract.js";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * The bounded canonical JSON subset used by answering-rhyme.statement/1.
 *
 * This is deliberately not exported as a general-purpose RFC 8785 encoder.
 * The statement has fixed ASCII keys and JSON-only normalized values; arrays
 * retain their normalized order while object keys sort lexically at every
 * depth.
 */
function canonicalJson(value) {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
        return JSON.stringify(value);
    }
    if (typeof value === "string")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
            .join(",")}}`;
    }
    throw new TypeError("Answering Rhyme canonical JSON only accepts normalized JSON values.");
}
export function canonicalAnsweringRhymeStatement(statement) {
    if (!isNormalizedAnsweringRhymeStatement(statement)) {
        throw new TypeError("Canonicalization requires the normalized value returned by validateAnsweringRhymeStatement() or prepareAnsweringRhymeStatement().");
    }
    return canonicalJson(statement);
}
export function canonicalAnsweringRhymeStatementBytes(statement) {
    return new TextEncoder().encode(canonicalAnsweringRhymeStatement(statement));
}
//# sourceMappingURL=canonical.js.map