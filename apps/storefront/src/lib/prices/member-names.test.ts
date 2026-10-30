import { describe, expect, it, vi } from 'vitest';
import type { MemberPriceItem } from './member-feed-types';

vi.mock('server-only', () => ({}));
import { memberCardName } from './member-names';

// Titles are the source fixtures' identifiers, as packages/sku/src/__tests__/names.test.ts uses them. No prices are read.
// The catalogue URLs are the Cardmarket collector's product lists (cardmarket/member-prices.ts).
const SINGLES = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json';
const NONSINGLES = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_18.json';
const row = (source: MemberPriceItem['source'], productName: string | null, language: string | null = null, extra: Partial<MemberPriceItem> = {}) => (
  { source, productName, language, game: 'one-piece', catalogSourceUrl: source === 'cardmarket' ? SINGLES : null, ...extra });

describe('/prices vendor names', () => {
  it.each([
    ['〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}', { text: 'お玉', key: 'お玉', illustrator: 'sowsow', markers: ['状態C'] }],
    ['ロロノア・ゾロ(パラレル/漫画絵)【L/P】{OP01-001}', { text: 'ロロノア・ゾロ', key: 'ロロノアゾロ', markers: ['パラレル', '漫画絵'] }],
    ['〔状態A-〕ナミ(パラレル/和柄/illust:S-KINOKO)【SP】{OP01-016[OP05]}', { text: 'ナミ', key: 'ナミ', illustrator: 'S-KINOKO', markers: ['状態A-', 'パラレル', '和柄'] }],
    ['〔PSA10鑑定済〕モンキー・Ｄ・ルフィ(パラレル/illust:Hachi Takashi)【R/P】{OP16-034}', { text: 'モンキー・Ｄ・ルフィ', key: 'モンキーdルフィ', illustrator: 'Hachi Takashi', markers: ['PSA10鑑定済', 'パラレル'] }],
  ])('names the CardRush title %s in Japanese by cardrush-title/names-1', (title, expected) => {
    expect(memberCardName(row('cardrush', title, 'ja'))).toEqual({ ...expected, lang: 'ja', status: 'vendor', source: 'cardrush', rule: 'cardrush-title/names-1' });
  });

  it.each([
    ['Roronoa Zoro (001) (Parallel)', 'Roronoa Zoro', 'roronoazoro', ['Parallel']],
    ['DON!! Card (Manga) (Alternate Art)', 'DON!! Card', 'don!!card', ['Alternate Art', 'Manga']],
    ['Alvida (Box Topper)', 'Alvida', 'alvida', ['Box Topper']],
  ])('names the TCGplayer product %s in English by tcgplayer-product/names-1', (title, text, key, markers) => {
    expect(memberCardName(row('tcgplayer', title, 'en'))).toEqual({ text, key, lang: 'en', status: 'vendor', source: 'tcgplayer', rule: 'tcgplayer-product/names-1', markers });
  });

  it("gives the name the language its text is written in, never the row's printing language", () => {
    // A Pokemon Japan line row is a Japanese printing; its product name is English.
    expect(memberCardName(row('tcgplayer', "Boss's Orders - 069/073", 'ja'))).toMatchObject({ text: "Boss's Orders", lang: 'en' });
    // A Cardmarket aggregate has no row language at all; its product-list name is English.
    expect(memberCardName(row('cardmarket', 'Roronoa Zoro (OP01-001)'))).toEqual({
      text: 'Roronoa Zoro', key: 'roronoazoro', lang: 'en', status: 'vendor', source: 'cardmarket', rule: 'cardmarket-product/names-1', markers: [],
    });
  });

  it.each([
    ['cardrush', 'ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}', 'unrecognised_marker'],
    ['cardrush', 'お玉(illust:sowsow/illust:Anderson)【UC】{OP01-006}', 'conflicting_illustrators'],
    ['cardrush', 'ロロノア・ゾロ(パラレル)', 'not_a_card_title'],
    ['cardrush', 'ナミ パラレル【SP】{OP01-016}', 'marker_in_name'],
    ['tcgplayer', 'Roronoa Zoro (Signed)', 'unrecognised_marker'],
    ['tcgplayer', 'Roronoa Zoro (001) (Parallel) [Foil]', 'unexpected_bracket'],
    ['cardmarket', 'Roronoa Zoro (Parallel)', 'unexpected_bracket'],
    ['cardmarket', '(OP01-001)', 'empty_name'],
  ] as const)('refuses the %s title %s with the rule\'s own reason', (source, title, reason) => {
    expect(memberCardName(row(source, title))).toEqual({ reason });
  });

  it('refuses a row with no title, and a Scryfall row, which has no rule', () => {
    for (const source of ['cardrush', 'tcgplayer', 'cardmarket'] as const) expect(memberCardName(row(source, null))).toEqual({ reason: 'empty_title' });
    expect(memberCardName(row('scryfall', 'Black Lotus', 'en'))).toEqual({ reason: 'no_rule' });
  });

  it.each([
    'ナミ(英語版)【SR】{OP01-016}', 'ナミ【英語版】【SR】{OP01-016}',
    // The collector reads a language marker anywhere in a title (title.includes), not only where names-1 removes one.
    'ナミ【SR/英語版】{OP01-016}', 'Nami【SR/英語版】{OP01-016}', 'Nami【SR】{OP01-016} 英語版', 'ナミ【SR】{OP01-016}英語版', 'ナミ【SR】{OP01-016}(韓国語版)',
  ])("refuses the CardRush title %s, which has a language marker: how CardRush writes the name there has not been seen", (title) => {
    expect(memberCardName(row('cardrush', title, 'en'))).toEqual({ reason: 'language_unseen' });
  });

  it.each(['pokemon', 'dragon-ball', 'digimon', 'vanguard', 'battle-spirits'])("refuses a CardRush %s row: names-1 has been checked against One Piece titles only", (game) => {
    expect(memberCardName(row('cardrush', '〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}', 'ja', { game }))).toEqual({ reason: 'grammar_unreviewed' });
  });

  it("names only a Cardmarket row from the singles product list, never a sealed product or a row with no catalogue", () => {
    expect(memberCardName(row('cardmarket', 'Fixture Booster Box', null, { catalogSourceUrl: NONSINGLES }))).toEqual({ reason: 'not_a_single' });
    expect(memberCardName(row('cardmarket', 'Roronoa Zoro (OP01-001)', null, { catalogSourceUrl: NONSINGLES }))).toEqual({ reason: 'not_a_single' });
    expect(memberCardName(row('cardmarket', 'Roronoa Zoro (OP01-001)', null, { catalogSourceUrl: null }))).toEqual({ reason: 'not_a_single' });
    expect(memberCardName(row('cardmarket', 'Roronoa Zoro (OP01-001)', null, { catalogSourceUrl: `${SINGLES}.bak` }))).toEqual({ reason: 'not_a_single' });
    expect(memberCardName(row('cardmarket', 'Fixture Leader (OP01-001)'))).toMatchObject({ text: 'Fixture Leader', rule: 'cardmarket-product/names-1' });
  });
});
