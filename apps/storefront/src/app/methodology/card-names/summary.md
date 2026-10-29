# Card names and official translations — TLDR

CTCG-NAMES-v1 (draft) gives one name per card key, `<game>-<set>-<number>` (a CTCG-SKU-v1 SKU without language and variant), and language. Each record says whether the name is official (the rights holder publishes it), vendor (a shop's title after marker removal), community or machine, with its source, time read and the versioned rule that produced it. Text is kept in NFC as printed; names match by a key (NFKC, lowercase, no whitespace or middle dots). An official record outranks every other; agreement never promotes a status; a missing name is reported as missing, never guessed. Vendor rules for CardRush, TCGplayer and Cardmarket titles remove conditions, rarity and variant markers or refuse with a reason. A name never establishes a SKU mapping, makes no trademark claim, and grants no right to republish a source's text.

Specification text is CC0. Schema: [/spec/v1/CardName.schema.json](/spec/v1/CardName.schema.json). Reference implementation: `packages/sku/src/names.ts`.

Full page: [/methodology/card-names](/methodology/card-names). Related: [/methodology/sku-standard](/methodology/sku-standard).
