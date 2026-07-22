import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PVE_AVAILABILITY } from "./pve-availability";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("PVE public boundary", () => {
  it("has one explicit read-only availability state", () => {
    expect(PVE_AVAILABILITY).toEqual({
      mode: "read_only",
      mutations_enabled: false,
      rewards_enabled: false,
      reason:
        "Durable PVE battles and rewards are paused while server-side rules validation is completed.",
      practice:
        "Practice battles run locally in your browser — nothing durable is recorded and nothing is paid.",
    });
  });

  it("does not advertise a live PVE battle or reward path", () => {
    const publicSurfaces = [
      "src/app/play/adventure/page.tsx",
      "src/app/play/adventure/[levelId]/page.tsx",
      "src/app/play/casual/page.tsx",
      "src/app/welcome/page.tsx",
      "src/app/llms.txt/route.ts",
      "src/app/privacy/page.tsx",
      "src/app/methodology/play-module/page.tsx",
      "src/app/methodology/starter-decks/page.tsx",
      "src/lib/email/handlers/streak-at-risk.ts",
      "src/lib/play/resources.ts",
      "src/lib/play/tutorial-sections.ts",
    ].map(source).join("\n");

    expect(publicSurfaces).toContain("battles and rewards are paused");
    expect(publicSurfaces).not.toMatch(/Win phygital cards in Adventure Mode/i);
    expect(publicSurfaces).not.toMatch(/Clear Adventure Mode levels to earn/i);
    expect(publicSurfaces).not.toMatch(/One adventure clear counts as a visit/i);
    expect(publicSurfaces).not.toMatch(/Single-player PvE against AI opponents/i);
    expect(publicSurfaces).not.toMatch(/One click to a PvE match/i);
  });
});
