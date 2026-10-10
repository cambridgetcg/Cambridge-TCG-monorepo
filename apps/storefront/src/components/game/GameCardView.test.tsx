// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ImageProps } from "next/image";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import type { GameCard } from "@/lib/game/types";
import { CardImageCredits, CardImageDetail, GameCardView } from "./GameCardView";

vi.mock("next/image", () => ({
  default: ({ src, alt, onError }: ImageProps) => createElement("img", { src: String(src), alt, onError }),
}));

const credit = "© Fixture rights holder — image credit";
const officialUrl = "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/ST15-001.png";
const catalogUrl = "https://jp-op-photos.s3.us-east-1.amazonaws.com/cards/ST15-001.jpg";
const reference = createCardNumberImageReference("op", "ST15-001", "OP-ST15-001-EN-R1")!;
function card(overrides: Partial<GameCard> = {}): GameCard {
  return {
    id: "fixture-card", sku: "ST15-001", name: "Practice character", cardNumber: "ST15-001",
    imageUrl: officialUrl, imageAttribution: credit, imageReference: reference,
    rarity: null, category: "character", cost: 2, power: 4000, color: "red",
    isRested: false, attachedDon: 0, zone: "hand", position: 0, faceDown: false, ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(content: ReactNode) { await act(async () => root.render(content)); }

describe("practice card artwork presentation", () => {
  it("shows an English reference with a visible copyright caption and honest alt text", async () => {
    await render(<GameCardView card={card()} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(officialUrl);
    expect(container.querySelector("img")?.getAttribute("alt")).toContain("printing not verified");
    expect(container.textContent).toContain("English reference image · printing not verified");
    expect(container.textContent).toContain(credit);
    expect(container.querySelector("details, [hidden]" )).toBeNull();
  });

  it.each([
    ["old bare official URL", { imageAttribution: undefined, imageReference: undefined }],
    ["missing attribution", { imageAttribution: null }],
    ["blank attribution", { imageAttribution: "   " }],
    ["missing reference", { imageReference: null }],
    ["another card number", { cardNumber: "ST15-002" }],
    ["malformed reference", { imageReference: { ...reference, depicted_canonical_sku: "op-st15-002-en-r1" } }],
    ["unapproved image host", { imageUrl: "https://example.invalid/card.png" }],
    ["catalog URL with an official claim", { imageUrl: catalogUrl }],
  ] satisfies [string, Partial<GameCard>][]) ("uses a readable text face for %s", async (_name, changes) => {
    await render(<GameCardView card={card(changes)} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Practice character");
    expect(container.textContent).toContain("4k");
    expect(container.textContent).not.toContain(credit);
    expect(container.textContent).not.toContain("Catalog");
    expect(container.textContent).not.toContain("EN ref.");
  });

  it("preserves approved catalog artwork as explicitly unverified", async () => {
    await render(<GameCardView card={card({ imageUrl: catalogUrl, imageAttribution: null, imageReference: null })} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(catalogUrl);
    expect(container.textContent).toContain("Catalog image · source and printing unverified");
    expect(container.querySelector("img")?.getAttribute("alt")).toContain("source and printing unverified");
    expect(container.textContent).not.toContain("English reference");
    expect(container.textContent).not.toContain(credit);
  });

  it("shows no hidden card image, name, reference, credit or attached-DON metadata", async () => {
    const hidden = card({ faceDown: true, attachedDon: 3 });
    await render(<><GameCardView card={hidden} /><CardImageDetail card={hidden} /><CardImageCredits cards={[hidden]} /></>);
    expect(container.querySelector("img, figure, [aria-label='Card image credits']")).toBeNull();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Face-down card");
    expect(container.innerHTML).not.toContain("Practice character");
    expect(container.innerHTML).not.toContain("ST15-001");
    expect(container.textContent).not.toContain(credit);
    expect(container.textContent).not.toContain("+3");
  });

  it("shares a visible row caption without duplicating credit on each tile or exposing hidden credits", async () => {
    const first = card();
    const second = card({ id: "copy" });
    const hidden = card({ id: "hidden", faceDown: true, imageAttribution: "Hidden artwork credit" });
    await render(<>
      <GameCardView card={first} creditLegendId="row-credit" />
      <GameCardView card={second} creditLegendId="row-credit" />
      <CardImageCredits id="row-credit" cards={[first, second, hidden]} />
    </>);
    expect(container.querySelectorAll('[aria-describedby="row-credit"]')).toHaveLength(2);
    expect(container.textContent?.split(credit)).toHaveLength(2);
    expect(container.querySelector("#row-credit")?.textContent).toContain(credit);
    expect(container.textContent).not.toContain("Hidden artwork credit");
  });

  it("shows the selected reprint identifier and copyright together", async () => {
    await render(<CardImageDetail card={card()} />);
    const caption = container.querySelector("figcaption");
    expect(caption?.textContent).toContain("For card number ST15-001");
    expect(caption?.textContent).toContain("OP-ST15-001-EN-R1");
    expect(caption?.textContent).toContain(credit);
    expect(caption?.textContent).toContain("printing not verified");
  });

  it("keeps the card readable when image loading fails offline", async () => {
    await render(<GameCardView card={card()} />);
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Practice character");
    expect(container.textContent).toContain("4k");
  });

  it.each(["reference", "catalog"] as const)("replaces a failed %s detail image with a readable notice and preserves its context", async (kind) => {
    const selected = kind === "reference" ? card() : card({ imageUrl: catalogUrl, imageAttribution: null, imageReference: null });
    await render(<CardImageDetail card={selected} />);
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(kind === "reference" ? "Reference image unavailable." : "Image unavailable.");
    const caption = container.querySelector("figcaption")!;
    if (kind === "reference") {
      expect(caption.textContent).toContain(credit);
      expect(caption.textContent).toContain("OP-ST15-001-EN-R1");
      expect(caption.textContent).toContain("printing not verified");
    } else {
      expect(caption.textContent).toContain("Catalog image · source and printing unverified");
    }
  });
});
