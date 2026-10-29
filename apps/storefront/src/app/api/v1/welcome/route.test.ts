import { describe, expect, it } from "vitest";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { GET } from "./route";

describe("/api/v1/welcome license tiers", () => {
  // The tier notes name the registered sources on each tier, read from the
  // registry: TCGplayer moved from proprietary to internal-only on 2026-10-28.
  it("names each source under the tier the registry gives it", async () => {
    const tiers = (await (await GET()).json()).data.license_tiers;
    for (const meta of listSourceMeta()) {
      if (meta.license === "proprietary") expect(tiers.proprietary).toContain(meta.name);
      if (meta.license === "internal-only") expect(tiers["internal-only"]).toContain(meta.name);
    }
    expect(tiers.proprietary).not.toContain("TCGplayer");
    expect(tiers["internal-only"]).toMatch(/CardRush \(JP\), TCGplayer, and Vinted \(UK\) currently use this tier\.$/);
    expect(tiers.proprietary).toMatch(/^Source policy or retained rights govern use\. Scryfall, .+, and .+ currently use this conservative tier\.$/);
  });
});
