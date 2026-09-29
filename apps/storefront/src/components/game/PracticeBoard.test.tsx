// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ImageProps } from "next/image";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import { resolveMulligans, startPracticeSetup, type PracticeGame } from "@/lib/game/practice";
import type { GameCard } from "@/lib/game/types";
import { buildPracticeDeck } from "@/lib/play/practice-decks";
import { PracticeBoard } from "./PracticeBoard";

vi.mock("next/image", () => ({
  default: ({ src, alt, onError }: ImageProps) => createElement("img", { src: String(src), alt, onError }),
}));

const saveKey = "ctcg-practice-battle";
const starterId = "st-15-red-newgate";
const credit = "© Fixture image rights holder";
const textCredit = "© Fixture text rights holder";
function setupGame() {
  const { deck } = buildPracticeDeck(starterId)!;
  return startPracticeSetup("You", deck, "Test opponent", deck, 0.3, true);
}
function readyGame() { return resolveMulligans(setupGame(), false).game; }
function addArtwork(card: GameCard, attribution = credit) {
  card.imageUrl = `https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/${card.cardNumber}.png`;
  card.imageAttribution = attribution;
  card.imageReference = createCardNumberImageReference("op", card.cardNumber, `OP-${card.cardNumber}-EN-R1`);
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline fixture")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function resume(game: PracticeGame) {
  localStorage.setItem(saveKey, JSON.stringify({ levelId: 1, starterId, game }));
  await act(async () => root.render(<PracticeBoard levelId={1} />));
}
function button(label: string, parent: ParentNode = container) {
  const match = [...parent.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label);
  expect(match, `Button ${label}`).toBeDefined();
  return match!;
}

describe("practice board credits and saved games", () => {
  it("shows row credits, inspects complete reference and text credits, and closes with Escape", async () => {
    const game = readyGame();
    const leader = game.state.player1.leader!;
    addArtwork(leader);
    addArtwork(game.state.player1.hand[0]!);
    addArtwork(game.state.player2.hand[0]!, "Hidden opponent image credit");
    leader.textEn = "Fixture printed effect.";
    leader.textAttribution = textCredit;
    leader.artist = "Fixture catalog artist";
    await resume(game);

    expect(container.textContent?.split(credit)).toHaveLength(2);
    expect(container.innerHTML).not.toContain("Hidden opponent image credit");
    const yourZone = container.querySelector('section[aria-label="You — your turn"]')!;
    const inspect = yourZone.querySelector<HTMLButtonElement>(`button[aria-label="${leader.name}"]`)!;
    expect(document.getElementById(inspect.getAttribute("aria-describedby")!)?.textContent).toContain(credit);
    inspect.focus();
    await act(async () => inspect.click());

    const dialog = container.querySelector<HTMLDivElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain(credit);
    expect(dialog.textContent).toContain(leader.imageReference!.depicted_sku);
    expect(dialog.textContent).toContain("printing not verified");
    expect(dialog.textContent).toContain("Fixture printed effect.");
    expect(dialog.textContent).toContain(textCredit);
    expect(dialog.textContent).toContain("Catalog illustrator credit: Fixture catalog artist");
    expect(dialog.textContent).toContain("Not verified for this reference image.");
    expect(document.activeElement).toBe(dialog);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(inspect);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("makes a face-up opponent card inspectable without offering gameplay actions", async () => {
    const game = readyGame();
    const leader = game.state.player2.leader!;
    addArtwork(leader);
    await resume(game);
    const opponentZone = container.querySelector("section")!;
    await act(async () => opponentZone.querySelector<HTMLButtonElement>(`button[aria-label="${leader.name}"]`)!.click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Opponent’s card — view only.");
    expect(dialog.textContent).toContain(credit);
    expect(dialog.textContent).not.toContain("Attack their leader");
    expect(dialog.textContent).not.toContain("Attach DON!!");
    expect(opponentZone.querySelectorAll('button[aria-label="Face-down card"]')).toHaveLength(5);
    expect([...opponentZone.querySelectorAll<HTMLButtonElement>('button[aria-label="Face-down card"]')].every((item) => item.disabled && !item.querySelector("img") && !item.hasAttribute("aria-describedby"))).toBe(true);
    await act(async () => (dialog.parentElement as HTMLElement).click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it.each([null, 42])("resumes an old bare-image save with %j text credit, text faces and intact game state", async (savedCredit) => {
    const game = readyGame();
    const leader = game.state.player1.leader!;
    leader.imageUrl = "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/legacy.png";
    leader.textEn = "Uncredited legacy text";
    leader.textAttribution = savedCredit as unknown as GameCard["textAttribution"];
    const before = JSON.parse(JSON.stringify(game));
    await resume(game);
    expect(container.querySelector("img")).toBeNull();
    expect(button("End Turn").disabled).toBe(false);
    const yourZone = container.querySelector('section[aria-label="You — your turn"]')!;
    const inspect = yourZone.querySelector<HTMLButtonElement>(`button[aria-label="${leader.name}"]`)!;
    expect(inspect.textContent).toContain(leader.name);
    await act(async () => inspect.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).not.toContain("Uncredited legacy text");
    expect(JSON.parse(localStorage.getItem(saveKey)!).game).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("credits the opening hand without revealing the opponent's hand", async () => {
    const game = setupGame();
    game.state.player1.hand.forEach((card) => addArtwork(card));
    game.state.player2.hand.forEach((card) => addArtwork(card, "Hidden opening hand credit"));
    await resume(game);
    expect(container.textContent).toContain("Your opening hand");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.textContent?.split(credit)).toHaveLength(2);
    expect(container.innerHTML).not.toContain("Hidden opening hand credit");
    expect(button("Keep hand").disabled).toBe(false);
  });

  it.each([["st-15-red-newgate", 2], ["st-01-red-luffy", 1]] as const)("starts the full %s deck offline with %i enrichment requests", async (chosenStarter, requests) => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    localStorage.setItem("ctcg-practice-starter", chosenStarter);
    await act(async () => root.render(<PracticeBoard levelId={1} />));
    await act(async () => button("Start battle").click());
    await act(async () => button("Go first").click());
    expect(container.textContent).toContain("Your opening hand");
    expect(container.querySelectorAll("button[aria-label]")).toHaveLength(5);
    expect(container.querySelector("img")).toBeNull();
    const saved: { game: PracticeGame } = JSON.parse(localStorage.getItem(saveKey)!);
    const player = saved.game.state.player1;
    expect(player.hand).toHaveLength(5);
    expect(player.deck.length + player.hand.length).toBe(50);
    expect(player.leader?.name).toBeTruthy();
    expect(button("Keep hand").disabled).toBe(false);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).startsWith("/api/v1/play/starters/"))).toBe(true);
  });
});
