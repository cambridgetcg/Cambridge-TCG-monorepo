import { validateAnsweringRhymeStatement, } from "./contract.js";
import { canonicalAnsweringRhymeStatement, canonicalAnsweringRhymeStatementBytes, } from "./canonical.js";
import { answeringRhymeStatementContentHash, } from "./hash.js";
/**
 * Validate, normalize, freeze, canonicalize, and hash a portable statement.
 * No network, evidence fetch, identity check, storage, or telemetry occurs.
 */
export async function prepareAnsweringRhymeStatement(input, digestProvider) {
    const validation = validateAnsweringRhymeStatement(input);
    if (!validation.ok)
        return validation;
    const statement = validation.value;
    const warnings = Object.freeze(validation.warnings.map((warning) => Object.freeze({ ...warning })));
    const canonicalJson = canonicalAnsweringRhymeStatement(statement);
    const canonicalBytes = canonicalAnsweringRhymeStatementBytes(statement);
    return {
        ok: true,
        value: {
            statement,
            warnings,
            canonicalJson,
            canonicalBytes,
            contentHash: await answeringRhymeStatementContentHash(statement, digestProvider),
            canonicalBytesLength: canonicalBytes.byteLength,
        },
    };
}
//# sourceMappingURL=prepare.js.map