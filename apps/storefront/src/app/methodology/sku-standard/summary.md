# SKU standard — TLDR

Cambridge TCG's SKU form is `<game>-<set>-<number>-<lang>[-<variant>]`, lowercase and hyphen-separated. The parser checks a registered game code and language's two-letter shape, not ISO membership. Strict canonical status requires parsing plus unchanged normalization; language aliases and known legacy forms may receive a separate suggestion. No missing identity is guessed.

The [identifier validator and builder](/standards/validator) runs in page memory without submitting input. API callers may use public `POST /api/v1/identifiers/validate` with exactly `{ "identifier": "..." }` (256 UTF-16 code units; 1,024-byte UTF-8 JSON body). Structure is not proof of catalog existence, card identity, authenticity, or deck legality. Registry language/status annotations and variant tokens are not printing evidence.

Specification text retains its scoped CC0 dedication. Implementation rights: repository LICENSE and applicable more-specific notices. Submitted identifiers are not granted CC0 rights by the validator.

Full page: [/methodology/sku-standard](/methodology/sku-standard). Related: [/methodology/universal-representation](/methodology/universal-representation).
