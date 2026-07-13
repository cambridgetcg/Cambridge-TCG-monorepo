import { describe, expect, it } from "vitest";
import { publicCatalogSort } from "./public-wholesale-fields";

describe("publicCatalogSort", () => {
  it.each(["name_asc", "name_desc", "number_asc"] as const)(
    "keeps structural order %s",
    (sort) => {
      expect(publicCatalogSort(sort)).toBe(sort);
    },
  );

  it.each([undefined, "price_asc", "price_desc", "unknown"])(
    "does not derive public row selection from %s",
    (sort) => {
      expect(publicCatalogSort(sort)).toBe("number_asc");
    },
  );
});
