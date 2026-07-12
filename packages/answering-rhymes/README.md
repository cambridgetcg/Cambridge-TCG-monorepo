# `@cambridge-tcg/answering-rhymes`

A zero-runtime-dependency conformance core for
`answering-rhyme.statement/1`: portable statements that can bless a relation,
add context, propose a correction, or carry withdrawal intent.

Registry status: **source-ready, not yet published to npm**. The package name
appears unregistered, but publication authority has not been established. The
protocol itself is already usable as JSON over HTTP without this package.

## What it does

- strictly validates and normalizes the neutral statement shape;
- emits the statement-scoped canonical JSON and UTF-8 bytes;
- computes SHA-256 with Web Crypto in Node, browsers, and Workers;
- exposes the v1 constants, limits, TypeScript types, JSON Schema, and normative
  golden vectors;
- prepares a frozen, bounded statement without making a network request.

## What it does not do

- authenticate a declarer or verify a claimed role;
- fetch evidence URLs;
- issue or verify Cambridge/Artbitrage receipts;
- detect replay, assert uniqueness, persist, publish, correct, hide, or withdraw
  anything;
- provide a generic RFC 8785 canonical-JSON implementation;
- license any card image, museum image, artwork, brand, or third-party record.

Those absences are protocol boundaries, not future-looking guarantees.

## Use

Inside this repository:

```ts
import {
  prepareAnsweringRhymeStatement,
  validateAnsweringRhymeStatement,
} from "@cambridge-tcg/answering-rhymes";

const validation = validateAnsweringRhymeStatement(input);
if (!validation.ok) {
  console.error(validation.issues);
}

const prepared = await prepareAnsweringRhymeStatement(input);
if (prepared.ok) {
  console.log(prepared.value.statement);
  console.log(prepared.value.canonicalJson);
  console.log(prepared.value.contentHash);
}
```

After a verified first registry publication, the intended install command is:

```sh
npm install @cambridge-tcg/answering-rhymes
```

Do not treat that command as live until the registry reports a published
version.

## Public API

- `validateAnsweringRhymeStatement(input)` — synchronous result with a deeply
  frozen, branded normalized statement + warnings, or structured issues.
- `canonicalAnsweringRhymeStatement(statement)` — canonical JSON for a branded,
  validated v1 statement only; structural lookalikes are rejected at runtime.
- `canonicalAnsweringRhymeStatementBytes(statement)` — its UTF-8 bytes.
- `answeringRhymeStatementContentHash(statement, digestProvider?)` — asynchronous
  `sha256:<hex>` using Web Crypto; it refuses unnormalized objects rather than
  silently hashing different bytes.
- `checkAnsweringRhymeStatementHash(statement, expected, digestProvider?)` — hash
  equality only; it proves no identity, authority, issuer, or time.
- `prepareAnsweringRhymeStatement(input, digestProvider?)` — validates, freezes,
  canonicalizes, reports the canonical byte length, and hashes with no I/O.
  The 16 KiB witness limit applies to raw HTTP request bytes and remains the
  responsibility of the transport sending those bytes. `canonicalBytesLength`
  is therefore diagnostic information, not a promise that a statement is
  ready to cross-post; measure the exact serialized request body against the
  destination witness's limit.

The raw schema and vectors remain usable without JavaScript:

- `@cambridge-tcg/answering-rhymes/schema/statement-v1.json`
- `@cambridge-tcg/answering-rhymes/fixtures/golden-vectors.json`

In JavaScript runtimes with JSON-module support, import those public specifiers
with the runtime's JSON import attribute. Non-JavaScript consumers can read the
corresponding `schema/` and `fixtures/` files from the package tarball.
The normalized schema is also served directly at
`https://cambridgetcg.com/schemas/answering-rhyme.statement.v1.json`, its
declared `$id`.

The JSON Schema describes the **normalized** statement. Accepted input may use
the case, whitespace, timestamp offsets, and optional omissions that the core
normalizes first; unpaired UTF-16 surrogates are rejected before Unicode-scalar
length checks or URL parsing. JSON Schema cannot express NFC normalization, timestamp
re-serialization, URL canonicalization, lexical URL ordering, or the complete
byte contract. The three golden vectors are therefore normative. Their
source-file SHA-256 is
`2a248e3862ff9a68e7394d728ed4889299b73492a2fff903adc0a3d04033fec3`.

## Runtime and version boundary

The package is ESM-only, targets ES2022, supports Node 20+, and uses `URL`,
`TextEncoder`, and Web Crypto in Node, browsers, and Workers. It performs no
import-time I/O. There are no runtime dependencies,
Node built-ins, `Buffer`, telemetry, lifecycle installation scripts, or network
clients. The optional digest interface is package-owned, so Node-only
TypeScript consumers do not need to add the DOM library merely to consume the
public declarations.

Browser hashing through ambient `globalThis.crypto` requires a secure context.
An explicitly injected digest provider is trusted to implement SHA-256; the
core verifies its return type and 32-byte length, not its cryptographic
correctness.
The runtime brand is a local misuse guard, not a signature or security
boundary: it can be forged by code in the same realm and is lost across JSON
serialization or structured cloning. Revalidate deserialized statements before
canonicalizing or hashing them.

Package SemVer and wire schema versions are independent. A patch may not change
the normalized bytes or hash of a valid v1 statement. Any such change requires
a new canonicalization/schema version that can coexist with v1.

## License

The package code, schema, and conformance vectors are offered under CC0-1.0.
Object rights remain separate; nothing here licenses the cultural objects a
statement may mention.
