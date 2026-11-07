import { describe, expect, it, vi } from 'vitest';
import { parseCardNumber } from '@cambridge-tcg/sku';
import { CARDMARKET_PRICE_GAMES } from '@cambridge-tcg/data-ingest/cardmarket/member-prices';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ query: vi.fn(), transaction: vi.fn() }));
import { validateSetCrosswalk } from './crosswalks';
import { CARDMARKET_EXPANSION_REVIEW, CARDMARKET_ONE_PIECE_EXPANSIONS, CARDMARKET_SET_CROSSWALK_VERSION, cardmarketSetCrosswalkSeed, reviewCardmarketExpansions } from './cardmarket-expansions';

describe('the reviewed Cardmarket One Piece set seed', () => {
  const seed = cardmarketSetCrosswalkSeed();

  it('passes the set writer\'s own validation, row by row, before any transaction', () => {
    expect(seed).toHaveLength(CARDMARKET_ONE_PIECE_EXPANSIONS.length);
    for (const row of seed) expect(() => validateSetCrosswalk(row)).not.toThrow();
  });

  it('keys one live row per expansion, for the game the collector reads', () => {
    expect(CARDMARKET_PRICE_GAMES[CARDMARKET_EXPANSION_REVIEW.gameId]).toBe(CARDMARKET_EXPANSION_REVIEW.game);
    expect(new Set(seed.map(row => row.sourceSetKey)).size).toBe(seed.length);
    expect(seed.every(row => row.source === 'cardmarket' && row.game === 'one-piece' && /^[1-9][0-9]*$/.test(row.sourceSetKey))).toBe(true);
    expect(seed.every(row => row.crosswalkVersion === CARDMARKET_SET_CROSSWALK_VERSION)).toBe(true);
  });

  it('maps only to set codes that Cambridge SKUs use for the printed prefix', () => {
    for (const [id, setCode, numbered, don] of CARDMARKET_ONE_PIECE_EXPANSIONS) {
      const parts = parseCardNumber('op', `${setCode.toUpperCase()}-001`);
      expect(parts, `idExpansion ${id}`).toMatchObject({ set: setCode, confirmed: true });
      expect(Number.isSafeInteger(numbered) && numbered > 0 && Number.isSafeInteger(don) && don >= 0).toBe(true);
    }
    // Promo numbers consolidate under one set; no reviewed expansion is all promos.
    expect(CARDMARKET_ONE_PIECE_EXPANSIONS.some(([, setCode]) => setCode === 'promo')).toBe(false);
  });

  it('carries its evidence: the counts, the reviewed file and what the file does not say', () => {
    const review = CARDMARKET_EXPANSION_REVIEW;
    expect(review.catalogSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(CARDMARKET_ONE_PIECE_EXPANSIONS.length).toBeLessThan(review.expansions);
    for (const row of seed) {
      expect(row.evidence).toContain(`idExpansion:${row.sourceSetKey};`);
      expect(row.evidence).toContain(`${row.setCode.toUpperCase()}-nnn`);
      expect(row.evidence).toContain(`createdAt ${review.catalogCreatedAt} sha256 ${review.catalogSha256}`);
      expect(row.evidence).toContain('names no expansion or language');
    }
    expect(seed.find(row => row.sourceSetKey === '5229')).toMatchObject({ setCode: 'op01', evidence: expect.stringContaining('numbered singles 157, every one OP01-nnn') });
  });
});

describe('the expansion rule', () => {
  const single = (idExpansion: number, name: string) => ({ idProduct: 1, idExpansion, name });

  it('maps an expansion whose every numbered single carries one prefix, DON!! cards aside', () => {
    const reviews = reviewCardmarketExpansions([
      single(1, 'Fixture Leader (OP01-001)'), single(1, 'Fixture Leader (OP01-001)'), single(1, 'Fixture Event (OP01-120)'),
      single(1, 'DON!! (OP01)'), single(2, 'Fixture Deck Card ( ST11-001)'),
    ]);
    expect(reviews.get(1)).toEqual({ setCode: 'op01', numbered: 3, unnumberedDon: 1 });
    // Cardmarket's padded number still names its set.
    expect(reviews.get(2)).toEqual({ setCode: 'st11', numbered: 1, unnumberedDon: 0 });
  });

  it('leaves reprints, promos and unknown shapes unmapped rather than taking the majority', () => {
    const reviews = reviewCardmarketExpansions([
      ...Array.from({ length: 150 }, (_, n) => single(3, `Fixture (OP03-${String(n + 1).padStart(3, '0')})`)), single(3, 'Fixture Reprint (OP01-120)'),
      single(4, 'Fixture (OP05-001)'), single(4, 'Fixture Promo (P-001)'),
      single(5, 'Fixture Leader'), single(5, 'Fixture (ST01-001)'),
      single(6, 'Fixture (XYZW99-001)'),
      single(7, 'Fixture (OP01-001) (OP02-001)'),
      single(8, 'DON!! (Fixture)'),
    ]);
    expect(reviews.get(3)).toEqual({ setCode: null, reason: 'mixed-set-numbers' });
    expect(reviews.get(4)).toEqual({ setCode: null, reason: 'mixed-set-numbers' });
    expect(reviews.get(5)).toEqual({ setCode: null, reason: 'unnumbered-single' });
    expect(reviews.get(6)).toEqual({ setCode: null, reason: 'unrecognised-number' });
    expect(reviews.get(7)).toEqual({ setCode: null, reason: 'unrecognised-number' });
    expect(reviews.get(8)).toEqual({ setCode: null, reason: 'no-numbered-single' });
  });

  it.each([{ idExpansion: 0 }, { idExpansion: '5229' }, { idExpansion: 1.5 }, { name: 42 }])('refuses a row without a valid identity %j', fields => {
    expect(() => reviewCardmarketExpansions([{ ...single(5229, 'Fixture (OP01-001)'), ...fields }])).toThrow(/catalog-identity/);
  });
});
