import { describe, expect, it } from 'vitest';
import {
  BATCH_COLLECTED_SOURCES, batchCollected, collectionSchedule, scheduledCollection,
} from './collection-flags';

describe('scheduling copy', () => {
  it('names the games the Cardmarket collector is configured to read', () => {
    expect(collectionSchedule('cardmarket')).toBe("Cardmarket's One Piece files daily");
  });

  it('says what is collected and how often, never just "on a schedule"', () => {
    expect(scheduledCollection({})).toBeNull();
    expect(scheduledCollection({ DATA_COLLECT_CARDMARKET: 'off', DATA_COLLECT_TCGPLAYER: 'ON' })).toBeNull();
    expect(scheduledCollection({ DATA_COLLECT_CARDMARKET: 'on' })).toBe("Cardmarket's One Piece files daily");
    expect(scheduledCollection({ DATA_COLLECT_CARDMARKET: 'on', DATA_COLLECT_CARDRUSH: 'on', DATA_COLLECT_TCGPLAYER: 'on' })).toBe(
      "Cardmarket's One Piece files daily, CardRush product pages every two hours (one host per run) and TCGplayer price guides hourly (stalest sets first)",
    );
  });

  it('judges every collected source by its batches, and nothing else', () => {
    expect(BATCH_COLLECTED_SOURCES).toEqual(['cardmarket', 'cardrush', 'tcgplayer']);
    expect(['cardrush', 'tcgplayer', 'cardmarket', 'scryfall', 'toString', '__proto__'].map(batchCollected)).toEqual([true, true, true, false, false, false]);
  });
});
