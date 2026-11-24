import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchCardDetailed: vi.fn() }));
vi.mock("@/lib/wholesale/client", () => ({ fetchCardDetailed: mocks.fetchCardDetailed, fetchCard: vi.fn(), fetchPrices: vi.fn(), cardAltText: () => "" }));
vi.mock("@/lib/market/unified", () => ({ getUnifiedMarketView: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import ProductPage from "./page";

const open = (sku: string) => ProductPage({ params: Promise.resolve({ sku }) }).then(() => null, (error: Error & { digest?: string }) => error.digest ?? error.message);

beforeEach(() => { mocks.fetchCardDetailed.mockReset(); });

describe("/product/[sku]", () => {
  it("sends a plain SKU to the one address its card has", async () => {
    mocks.fetchCardDetailed.mockResolvedValue({ source: "wholesale-db", absence: null, card: { sku: "OP-OP01-001-JP-V11L1" } });
    expect(await open("op-op01-001-ja")).toContain(";/product/OP-OP01-001-JP-V11L1;307;");
  });

  it("is a 404 for a missing card and an error, not a 404, when the catalogue cannot be read", async () => {
    mocks.fetchCardDetailed.mockResolvedValue({ source: "wholesale-db", card: null, absence: { reason: "none_plain", listings: [] } });
    expect(await open("op-op01-077-ja")).toContain("404");
    mocks.fetchCardDetailed.mockResolvedValue({ source: "unavailable", card: null, absence: null });
    expect(await open("op-op01-077-ja")).toBe("Card catalogue temporarily unavailable");
  });
});
