# Cambridge TCG card names and official translations: CTCG-NAMES-v1 (draft)

> Customer-facing methodology page. Source for `/methodology/card-names`.
> Reference implementation: [`packages/sku/src/names.ts`](../../packages/sku/src/names.ts), exported from `@cambridge-tcg/sku`.
> JSON Schema: `https://cambridgetcg.com/spec/v1/CardName.schema.json`.

This standard says how to write down a card's name: which card it belongs to, in which language, how the name is known and where it came from. A SKU ([CTCG-SKU-v1](sku-standard.md)) names one printing; this standard names the card its printings share, in each language.

Version 1.0 is a draft and may change before it is frozen. No Cambridge endpoint returns these records yet.

`/prices` shows the vendor name of each CardRush One Piece row, each TCGplayer row and each Cardmarket row from its singles product list under the source's own title, with its status and source, and the illustrator where the title credits one. The name's language is the one its text is written in (see each rule below), never the row's printing language. No name is shown for a title the rule refuses; for a CardRush title with a language marker anywhere in it, since how CardRush writes the name on such a listing has not been seen; for CardRush's other games, whose titles the rule has not been checked against; for a Cardmarket row that is not from its singles list, such as a booster box; or for a Scryfall row, which has no rule. This is display only: no endpoint, export or download emits name records yet.

---

## One name per card and language

```
<game>-<set>-<number>      the card key
```

- The **card key** is a CTCG-SKU-v1 canonical SKU without its language and variant segments. `op-op01-001-ja`, `op-op01-001-en` and `op-op01-001-en-p1` all have the card key `op-op01-001`.
- A name belongs to a card key and a language.
- A record's `lang` and `script` are the language and script its text is written in, never the printing's or the source row's. An English name read from a listing of a Japanese printing is an English name.
- A printing's name is its card key's name in the printing's language.
- An **official translation** is the official name of the same card key in another language.
- Variant, parallel, reprint, rarity, condition, grade, illustrator credit and art-style markers are never part of a name. A parallel has its base print's name.
- Where a publisher prints a different name on one specific printing, a record may carry that printing's `sku`. It then names that printing only.

---

## A name record

| Field | Required | Meaning |
|---|---|---|
| `spec_version` | yes | Always `ctcg.card-name/1`. |
| `card_key` | yes | `<game>-<set>-<number>`, with a registered game code. |
| `lang` | yes | The language the text is written in, as a CTCG-SKU-v1 language code: lowercase ISO 639-1, such as `ja` or `en`. Legacy aliases such as `jp` are refused. |
| `script` | no | The script the text is written in, as an ISO 15924 code such as `Latn`, for a romanisation. Absent means the language's usual script. |
| `text` | yes | The name, in the text form below. |
| `key` | yes | The match key below. For matching only; never displayed. |
| `status` | yes | `official`, `vendor`, `community` or `machine`. |
| `source` | yes | A source registry id, such as `bandai-en`, `cardrush`, `tcgplayer` or `cardmarket`. |
| `source_url` | no | The https page the name was read from, with a DNS host and no credentials. Spaces and non-ASCII characters must already be percent-encoded; the URL is not repaired. |
| `observed_at` | yes | When the source was read, in RFC 3339, on a real date and clock time. |
| `rule` | yes | The extraction rule and its version, such as `cardrush-title/names-1`, or `verbatim` when the text was taken as printed. An official name's rule is always `verbatim`. |
| `illustrator` | no | An illustrator credit taken from the source's markers. Never part of the name. |
| `sku` | no | One printing's canonical SKU, for a name printed on that printing only. Its card key and language must be the record's. |

An illustrative record (built for this document; no catalogue row or source was read for it):

```json
{
  "spec_version": "ctcg.card-name/1",
  "card_key": "op-op01-001",
  "lang": "en",
  "text": "Roronoa Zoro",
  "key": "roronoazoro",
  "status": "official",
  "source": "bandai-en",
  "observed_at": "2026-10-29T00:00:00Z",
  "rule": "verbatim"
}
```

The schema checks structure only. The text form, the key's derivation and the agreement between `sku` and `card_key` are checked by `cardName()`.

---

## How a name is known

- **official**: the rights holder publishes this text for this language: a publisher card list, or the printed card.
- **vendor**: a shop's or marketplace's own title for the card, after a versioned rule has removed its markers.
- **community**: a name from a third-party list.
- **machine**: a machine translation or transliteration.

Showing a name follows these rules (`chooseCardName()` and `printingName()` implement them):

1. Never present a non-official name as official. Show its status with it.
2. An official record outranks every other for its card key and language. With none, show the best non-official name, in the order vendor, community, machine, with its status visible.
3. Agreement between sources never promotes a status. Three shops printing the same title still give a vendor name.
4. Within the top status, a printing's own record comes before its card key's.
5. If the records of the top status have different keys, the name is in conflict: report the candidates and do not pick one.
6. Records that agree can still differ in form, such as character width. Show the most recently observed one. Between records observed at the same instant, show the first by `source`, then by `text`, in Unicode code point order.
7. A missing name is reported as missing. It is never guessed, and a name in another language is not put in its place.

---

## Text form

A record keeps a name in Unicode NFC, trimmed, with each run of whitespace collapsed to one space (U+0020). Whitespace means what ECMAScript's `\s` matches, which includes the ideographic space U+3000. Nothing else changes: official text keeps the publisher's punctuation (such as ・), letter case and character width.

## Match key

To compare names, compute the key: Unicode NFKC, then remove all whitespace and the middle dots U+30FB (・), U+FF65 (･) and U+00B7 (·), then lowercase without regard to locale. Removing comes before lowercasing so that a Greek final sigma (ς) does not depend on spacing. Two texts name the same thing exactly when their keys are equal. Keys are for matching and are never displayed.

```
モンキー・Ｄ・ルフィ   →  モンキーdルフィ     (full-width Ｄ, U+FF24)
モンキー・D・ルフィ    →  モンキーdルフィ     (half-width D)
```

Their texts stay different; their keys are equal.

---

## Taking names from vendor titles

Shops and marketplaces write variant, rarity and condition markers into their titles. Each rule removes them and returns `{ text, illustrator?, markers[] }`, where `markers` lists what it removed (without brackets, in the order it removed them), or it refuses with a reason. A rule never guesses. A changed rule ships under a new version, so a record's `rule` says exactly how its text was made. Official names need no rule: their `rule` is `verbatim` and only the text form applies, and `cardName()` refuses an official record with any other rule.

### `cardrush-title/names-1`

```
〔condition〕* name (markers)? 【rarity】 {SET-NUM([RELEASE])?}
```

1. Put the decoded title in text form.
2. Remove the leading 〔…〕 groups: conditions such as 〔状態C〕 and grades such as 〔PSA10鑑定済〕.
3. Remove the language markers 英語版, 韓国語版, 中国語版, 簡体字版 and 繁体字版 where they stand in `( )` or `【 】`, as the CardRush collector does.
4. Keep the text before the first 【 or {. The rest is the rarity and the card number. A title with neither is refused (`not_a_card_title`).
5. If the name ends with one half-width `(…)` group, split it at `/`. When every token is a known marker or `illust:<credit>`, remove the group; the credit becomes `illustrator`. An unknown token is refused (`unrecognised_marker`), and so is a second credit (`conflicting_illustrators`).
6. Any other bracket that is left (`( ) （ ） [ ] ［ ］ 【 】 { } 〔 〕`) is refused (`unexpected_bracket`). A language marker or パラレル left in the name outside those brackets is refused (`marker_in_name`): the collector reads language markers, and the classifier パラレル, anywhere in a title. An empty name is refused (`empty_name`).

Known markers: パラレル, 漫画絵, 和柄, 漫画背景, 漫画, マンガ, アルト, オルタネート, and the language markers above.

A language marker says which printing a listing is for, not which language its name is written in, so a record's `lang` comes from the text and the marker stays in `markers`. The names in the One Piece titles captured on 2026-10-28 are written in Japanese (`lang: "ja"`). None of those titles carried a language marker, so how CardRush writes the name on a listing marked 英語版 has not been seen.

### `tcgplayer-product/names-1`

1. Put the product name in text form.
2. Working from the end, remove a collector number written ` - 069/073` and parenthesised groups, one at a time. A group must be a card number such as `(001)`, or a known variant marker: Parallel, Alternate Art, Box Topper, Manga. Any other group is refused (`unrecognised_marker`).
3. Any other bracket that is left, or an empty name, is refused.

The product names in the captured price guides are written in English, also on the Pokemon Japan line, whose rows are Japanese printings: `Boss's Orders - 069/073` is one of them and gives an English name, `lang: "en"`.

### `cardmarket-product/names-1`

Remove one trailing collector number, an upper-case set code and a number such as `(OP01-001)` or `(P-001)`. Keep the rest verbatim. The rule knows no variant markers, so any bracket left in the rest, such as `(Parallel)` or `(Pre-Release)`, is refused (`unexpected_bracket`), and so is an empty name. The product-list names in the collector's test fixtures are English, `lang: "en"`.

### Examples

The titles are identifiers from the collectors' test fixtures.

| Source title | Name | Illustrator | Markers removed |
|---|---|---|---|
| CardRush `〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}` | お玉 | sowsow | 状態C |
| CardRush `ロロノア・ゾロ(パラレル/漫画絵)【L/P】{OP01-001}` | ロロノア・ゾロ | — | パラレル, 漫画絵 |
| CardRush `〔状態A-〕ナミ(パラレル/和柄/illust:S-KINOKO)【SP】{OP01-016[OP05]}` | ナミ | S-KINOKO | 状態A-, パラレル, 和柄 |
| CardRush `〔PSA10鑑定済〕モンキー・Ｄ・ルフィ(パラレル/illust:Hachi Takashi)【R/P】{OP16-034}` | モンキー・Ｄ・ルフィ | Hachi Takashi | PSA10鑑定済, パラレル |
| TCGplayer `Roronoa Zoro (001) (Parallel)` | Roronoa Zoro | — | Parallel |
| TCGplayer `DON!! Card (Manga) (Alternate Art)` | DON!! Card | — | Alternate Art, Manga |
| TCGplayer `Boss's Orders - 069/073` | Boss's Orders | — | — |
| Cardmarket `Roronoa Zoro (OP01-001)` | Roronoa Zoro | — | — |
| CardRush `ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}` | refused: `unrecognised_marker` (SP仕様) | | |
| Cardmarket `Roronoa Zoro (Parallel)` | refused: `unexpected_bracket` (Roronoa Zoro (Parallel)) | | |

`packages/sku/src/__tests__/names.test.ts` checks these results against the reference implementation; the `/methodology/card-names` page computes them from it.

---

## What this standard is not

- **Not a SKU mapping.** A name never establishes which printing or source product a record is. A name match is not evidence; the price crosswalks follow the same rule (migration `0140_price_source_crosswalks.sql`).
- **Not a translation service.** It records names that exist and says how each is known. It produces no translations.
- **No trademark claim.** Card and character names belong to their owners. Recording a name claims nothing about it.
- **Not a data licence.** The specification text is dedicated under CC0 ([STANDARDS-LICENSE.md](../STANDARDS-LICENSE.md)). A name taken from a source keeps that source's terms; this standard grants no right to collect, store or republish it.

---

## Change history

*v1.0 — 2026-10-29. Draft. First publication, in answer to Yu's request that day: "We can set standard for the official translation too, for card names and format, just like SKU." The card key, the record's fields, the statuses and their order, the text form, the match key and the three vendor rules were designed by the agents who drafted this version, not chosen by Yu. Any of them may change before v1 is frozen; a changed vendor rule gets a new rule version.*
