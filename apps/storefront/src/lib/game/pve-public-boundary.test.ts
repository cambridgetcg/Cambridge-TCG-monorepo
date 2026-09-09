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

  it("does not advertise a server-recorded PVE battle or reward path", () => {
    const publicSurfaces = [
      "src/app/play/adventure/page.tsx",
      "src/app/play/adventure/[levelId]/page.tsx",
      "src/app/play/casual/page.tsx",
      "src/app/play/welcome/page.tsx",
      "src/app/welcome/page.tsx",
      "src/components/game/PracticeLaunch.tsx",
      "src/components/game/PracticeBoard.tsx",
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

// Static copy checks only: no page imports, browser, account, or game actions.
// "Durable" in PVE_AVAILABILITY remains server-scoped; localStorage survives
// reloads too, so practice copy must name the browser save separately.
const PRACTICE_SURFACES = [
  "src/components/game/PracticeLaunch.tsx",
  "src/components/game/PracticeBoard.tsx",
  "src/app/welcome/page.tsx",
  "src/app/play/welcome/page.tsx",
  "src/app/play/casual/page.tsx",
  "src/app/play/adventure/page.tsx",
  "src/app/play/adventure/[levelId]/page.tsx",
];

function compact(text: string): string {
  return text.replace(/\s+/g, " ");
}

function metadataDescription(path: string): string {
  const text = source(path);
  const metadata = text.slice(text.indexOf("export const metadata"));
  const description = metadata.match(/description:\s*"([^"]+)"/);
  expect(description, `${path} must keep a metadata description`).not.toBeNull();
  return description![1];
}

describe("browser-local practice copy", () => {
  it.each(PRACTICE_SURFACES)("does not deny local saves in %s", (path) => {
    const text = compact(source(path));
    expect(text).not.toMatch(/\brecords? nothing\b|\bnothing (?:is )?recorded\b/i);
    expect(text).not.toMatch(/\bnothing durable\b|\brecords? nothing durable\b/i);
    expect(text).not.toMatch(/Read-only while battles are paused/i);
  });

  it.each([
    "src/components/game/PracticeLaunch.tsx",
    "src/app/welcome/page.tsx",
    "src/app/play/casual/page.tsx",
    "src/app/play/adventure/page.tsx",
  ])("names all three browser-local saves in %s", (path) => {
    const text = compact(source(path));
    expect(text).toMatch(/Battle state, starter choice, and clears can be saved in this browser only/);
  });

  it.each([
    "src/app/play/casual/page.tsx",
    "src/app/play/adventure/[levelId]/page.tsx",
  ])("keeps browser saves and the server pause in %s metadata", (path) => {
    const description = metadataDescription(path);
    expect(description).toMatch(/saves/i);
    expect(description).toMatch(/browser/i);
    expect(description).toMatch(/server-recorded/i);
    expect(description).toMatch(/rewards/i);
    expect(description).toMatch(/paused|No server-recorded results or rewards/i);
  });

  it("offers practice to both beginner and spectator paths without reopening server PVE", () => {
    const welcome = source("src/app/play/welcome/page.tsx");
    const notes = [...welcome.matchAll(/href: "\/play\/adventure", note: "([^"]+)"/g)]
      .map((match) => match[1]);
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(note).toMatch(/browser-local practice/i);
      expect(note).toContain("Saves stay in this browser");
      expect(note).toContain("server-recorded PVE battles and rewards are paused");
    }
  });

  it("keeps the server pause and historical reads explicit on the player and casual paths", () => {
    for (const path of ["src/app/welcome/page.tsx", "src/app/play/casual/page.tsx"]) {
      const text = compact(source(path));
      expect(text).toContain("Server-recorded PVE battles and rewards are paused");
      expect(text).toContain("prior recorded progress remains readable");
    }
    const launch = compact(source("src/components/game/PracticeLaunch.tsx"));
    expect(launch).toContain("no results are recorded on the server");
    expect(launch).toContain("{pausedReason} Rewards stay off");
  });

  it("keeps the adventure ladder's local clears separate from historical server progress", () => {
    const adventure = compact(source("src/app/play/adventure/page.tsx"));
    expect(adventure).toContain("{PVE_AVAILABILITY.reason} Practice battles are open");
    expect(adventure).toContain("not as server-recorded PVE results. Practice pays nothing");
    expect(adventure).toContain("/10 cleared in this browser");
    expect(adventure).toContain("Recorded: cleared ${history.clearCount}× before the pause.");
  });

  it("discloses browser saves on the board, setup, and result screen independently", () => {
    const board = source("src/components/game/PracticeBoard.tsx");
    const playing = compact(board.slice(board.indexOf("{/* Practice framing"), board.indexOf("{/* Board")));
    expect(playing).toContain("saves in this browser only, no server-recorded results, no rewards");
    expect(playing).toContain("other card effects aren&apos;t interpreted yet");

    const setup = compact(board.slice(board.indexOf("function SetupScreen("), board.indexOf("function EndScreen(")));
    expect(setup).toContain("Battle state, starter choice, and clears can be saved in this browser only");
    expect(setup).toContain("No server-recorded results or rewards");
    expect(setup).toContain("no account needed");

    const end = compact(board.slice(board.indexOf("function EndScreen("), board.indexOf("function MulliganPrompt(")));
    expect(end).toContain("Practice clears can be saved in this browser only, not as server-recorded PVE results");
    expect(end).toContain("Rewards stay paused until server-side rules validation is complete");
    // The same result copy appears after a loss: do not claim every result is a clear.
    expect(end).not.toContain("this clear");
  });

  it("retains browser storage and the battle-only reset without mounting server mutations", () => {
    const board = source("src/components/game/PracticeBoard.tsx");
    expect(board).toContain('const SAVE_KEY = "ctcg-practice-battle"');
    expect(board).toContain('const STARTER_CHOICE_KEY = "ctcg-practice-starter"');
    expect(board).toContain('const CLEARS_KEY = "ctcg-practice-clears"');
    expect(board).toContain("localStorage.setItem(SAVE_KEY, JSON.stringify({ levelId, starterId, game }))");
    expect(board).toContain("localStorage.setItem(STARTER_CHOICE_KEY, id)");
    expect(board).toContain("localStorage.setItem(CLEARS_KEY, JSON.stringify(clears))");
    expect(board).toContain("localStorage.getItem(SAVE_KEY)");
    expect(board).toContain("localStorage.removeItem(SAVE_KEY)");
    expect(board).not.toMatch(/localStorage\.removeItem\((?:STARTER_CHOICE_KEY|CLEARS_KEY)\)/);
    expect(board).not.toContain("/api/game/");
    const level = source("src/app/play/adventure/[levelId]/page.tsx");
    expect(level).toContain("<PracticeBoard levelId=");
    expect(level).not.toContain("/api/game/");
  });
});
