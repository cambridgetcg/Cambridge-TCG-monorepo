import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const ports = vi.hoisted(() => ({ query: vi.fn(), cardmarket: vi.fn(), scryfall: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: ports.query }));
vi.mock('@cambridge-tcg/data-ingest/cardmarket/member-prices', () => ({ acquireCardmarketMemberPrices: ports.cardmarket }));
vi.mock('@cambridge-tcg/data-ingest/scryfall/member-prices', () => ({ acquireScryfallMemberPrices: ports.scryfall }));
vi.mock('./member-price-writer', () => ({ writeMemberPriceBatch: ports.write }));
import { ingestMemberPriceSource } from './member-price-ingest';
beforeEach(() => { Object.values(ports).forEach(mock => mock.mockReset()); });
it('refuses revoked/unreviewed acquisition before any upstream call or write', async () => {
  ports.query.mockResolvedValue({rows:[]});
  await expect(ingestMemberPriceSource({source:'cardmarket',gameId:18})).rejects.toThrow(/acquisition-revoked/);
  expect(ports.cardmarket).not.toHaveBeenCalled(); expect(ports.scryfall).not.toHaveBeenCalled(); expect(ports.write).not.toHaveBeenCalled();
});
it('does not persist a partial acquisition when a later upstream file fails', async () => {
  ports.query.mockResolvedValue({rows:[{source:'cardmarket'}]}); ports.cardmarket.mockRejectedValue(new Error('catalog failed'));
  await expect(ingestMemberPriceSource({source:'cardmarket',gameId:18})).rejects.toThrow('catalog failed'); expect(ports.write).not.toHaveBeenCalled();
});
it('connects approved finite Scryfall display acquisition to native writer, reporting quarantine', async () => {
  const parsed = {observations:[],quarantine:[{sourceProductId:null,reason:'fixture'}],sourceRows:1,missingPrices:3};
  ports.query.mockResolvedValue({rows:[{source:'scryfall'}]}); ports.scryfall.mockResolvedValue(parsed); ports.write.mockResolvedValue({batchId:'4',inserted:0,duplicate:false});
  const result = await ingestMemberPriceSource({source:'scryfall'});
  expect(ports.write).toHaveBeenCalledWith('scryfall',parsed); expect(result).toMatchObject({status:'completed-with-quarantine',quarantined:1,missingPriceFields:3,batchId:'4'});
});
