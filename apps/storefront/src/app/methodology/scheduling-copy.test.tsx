import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Copy that says Cambridge collects Cardmarket names what it collects and how
// often (the configured games, daily), and changes with DATA_COLLECT_CARDMARKET.
async function render(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv("DATA_COLLECT_CARDMARKET", flag);
  const pages = await Promise.all([
    import("./member-pricing/page"),
    import("./cross-source-pricing/page"),
    import("./upstream-sources/page"),
  ]);
  const html = pages.map(({ default: Page }) => renderToStaticMarkup(<Page />));
  const budget = await (await (await import("../api/v1/budget/route")).GET()).json();
  return { html, budgetNote: budget.data.recommended_pace.member_data_key.note as string };
}

afterEach(() => vi.unstubAllEnvs());

describe("Cardmarket scheduling copy", () => {
  it("names the One Piece files and the daily rhythm while the flag is on", async () => {
    const { html, budgetNote } = await render("on");
    for (const page of html) {
      expect(page).toContain("Cambridge collects Cardmarket&#x27;s One Piece files daily");
      expect(page).not.toMatch(/on a (daily )?schedule/);
    }
    expect(budgetNote).toContain("Cambridge collects Cardmarket's One Piece files daily for member source prices; other imports are manual");
  });

  it("keeps the manual wording while it is off", async () => {
    const { html, budgetNote } = await render(undefined);
    expect(html[0]).toContain("does not refresh them on a schedule: Cardmarket imports are manual");
    expect(html[1]).toContain("manual member import only");
    expect(html[2]).toContain("imports are manual (see the Cardmarket entry at /api/v1/sources) and no scheduled refresh exists.");
    for (const page of html) expect(page).not.toContain("Cambridge collects Cardmarket");
    expect(budgetNote).toContain("Cambridge does not refresh member source prices on a schedule (imports are manual)");
  });

  it("no longer calls TCGplayer's welcome a respectful absence", async () => {
    const { html } = await render(undefined);
    expect(html[2]).not.toContain("no written approval for multi-source use");
    expect(html[2]).toContain("collectors read only while scheduled");
  });
});
