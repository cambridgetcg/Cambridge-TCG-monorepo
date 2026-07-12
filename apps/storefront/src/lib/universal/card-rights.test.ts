import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { universalCardContentHash } from "./card";

describe("universal card public identity hash", () => {
  it("depends only on the Cambridge SKU, never imported or price fields", () => {
    const first = universalCardContentHash({
      sku: "op-op01-001-en",
      card_number: "OP01-001",
      set_code: "OP01",
      game: "op",
      variant: "foil",
    });
    const second = universalCardContentHash({
      sku: "op-op01-001-en",
      card_number: "changed",
      set_code: "changed",
      game: "changed",
      variant: null,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
