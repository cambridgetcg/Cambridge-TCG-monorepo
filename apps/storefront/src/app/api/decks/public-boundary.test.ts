import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchPrices: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ query: mocks.query }));
vi.mock("@/lib/wholesale/client", () => ({ fetchPrices: mocks.fetchPrices }));

import { POST as importDeck } from "./import/route";
import { POST as validateDeck } from "../v1/play/deck/validate/route";

describe("anonymous deck endpoint boundary", () => {
  it("does not expose rarity-derived category validation", async () => {
    const response = await validateDeck();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      validation_complete: false,
      legality: null,
      publication_status: "withheld-untraced-lineage",
    });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
  });

  it("does zero fan-out for many caller-controlled set prefixes", async () => {
    const text = Array.from(
      { length: 400 },
      (_, index) => `1x ZZ${index}-001 Card ${index}`,
    ).join("\n");
    const response = await importDeck(
      new Request("https://example.test/api/decks/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ parsed: false, resolved: false });
    expect(mocks.fetchPrices).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
