import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), createLot: vi.fn(), listLots: vi.fn(), getLot: vi.fn(), cancelLot: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/market/lots", () => ({ createLot: mocks.createLot, listLots: mocks.listLots, getLot: mocks.getLot, cancelLot: mocks.cancelLot }));

import { GET as listLots, POST as createLot } from "./route";
import { GET as getLot } from "./[id]/route";

describe("public lot boundary", () => {
  it("pauses list, detail, and intake before auth, body, or database work", async () => {
    const responses = await Promise.all([listLots(), createLot(), getLot()]);
    for (const response of responses) expect(response.status).toBe(503);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.createLot).not.toHaveBeenCalled();
    expect(mocks.listLots).not.toHaveBeenCalled();
    expect(mocks.getLot).not.toHaveBeenCalled();
  });
});
