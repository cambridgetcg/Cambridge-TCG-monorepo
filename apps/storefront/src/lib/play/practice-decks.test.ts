import { afterEach, describe, expect, it, vi } from "vitest";
import { createCardNumberImageReference } from "@/lib/cards/card-number-image-reference";
import { startPracticeSetup, resolveMulligans } from "@/lib/game/practice";
import { initializeGame } from "@/lib/game/engine-setup";
import { getStarterDeck } from "./starter-decks";
import { buildPracticeDeck, DETAILS_FETCH_TIMEOUT_MS, DETAILS_MAX_RESPONSE_BYTES, fetchStarterCardDetails, projectStarterCardDetails, projectStarterImage } from "./practice-decks";

const starterId = "st-01-red-luffy";
const cardNumber = "ST01-001";
const imageUrl = "https://ctcg-card-images.s3.us-east-1.amazonaws.com/official/OP-ST01-001-EN-P1.png";
const reference = createCardNumberImageReference("op", cardNumber, "OP-ST01-001-EN-P1")!;
const leader = {
  card_number: cardNumber, image_url: imageUrl, image_attribution: "Publisher credit", image_reference: reference,
  effect_text: "Example effect", text_attribution: "Text credit", artist: "Catalog artist",
};
const detail = { leader, cards: [] };
const empty = () => projectStarterCardDetails(null);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared starter media projection", () => {
  it("preserves reference, attribution, text and artist through full deck, game setup and saved JSON", () => {
    const details = projectStarterCardDetails(detail);
    const built = buildPracticeDeck(starterId, details)!;
    const declared = getStarterDeck(starterId)!;
    expect(built.deck).toHaveLength(1 + declared.card_list.reduce((sum, card) => sum + card.quantity, 0));
    const expected = { imageUrl, imageAttribution: "Publisher credit", imageReference: reference, textEn: "Example effect", textAttribution: "Text credit", artist: "Catalog artist", power: 5000 };
    expect(built.deck[0]).toMatchObject(expected);
    const setup = startPracticeSetup("You", built.deck, "Opponent", built.deck, 0.5, true);
    const saved = JSON.parse(JSON.stringify(resolveMulligans(setup, false).game));
    expect(saved.state.player1.leader).toMatchObject(expected);
    expect(saved.state.player1.leader.imageReference.relationship).toBe("reference");
    expect(initializeGame("p1", "You", built.deck, "p2", "Them", built.deck).player1.leader?.imageReference).toEqual(reference);
  });

  it("withholds incomplete official metadata without dropping cards or independent text", () => {
    const details = projectStarterCardDetails({ leader: { ...leader, image_attribution: " " }, cards: [] });
    expect(details.images[cardNumber]).toBeNull();
    expect(details.imageReferences?.[cardNumber]).toBeNull();
    expect(details.texts[cardNumber]).toEqual({ text: "Example effect", attribution: "Text credit" });
    expect(buildPracticeDeck(starterId, details)!.deck).toHaveLength(51);
    expect(buildPracticeDeck(starterId, { images: { [cardNumber]: imageUrl }, texts: {}, artists: {} })!.deck[0].imageUrl).toBeNull();
  });

  it("keeps only the approved bare catalogue fallback and never downgrades claimed official metadata", () => {
    const legacy = "https://jp-op-photos.s3.us-east-1.amazonaws.com/cards/leader.png";
    expect(projectStarterImage(cardNumber, legacy, null, null)).toEqual({ url: legacy, attribution: null, reference: null });
    expect(projectStarterImage(cardNumber, legacy, "Publisher credit", reference)).toBeNull();
    expect(projectStarterImage(cardNumber, imageUrl, null, reference)).toBeNull();
    expect(projectStarterImage(cardNumber, imageUrl, "Publisher credit", { ...reference, relationship: "exact" })).toBeNull();
    expect(projectStarterImage("ST01-002", imageUrl, "Publisher credit", reference)).toBeNull();
    expect(projectStarterImage(cardNumber, "javascript:alert(1)", null, null)).toBeNull();
  });

  it.each([null, [], { cards: {} }, { cards: Array(129).fill(null) }])("accepts malformed resolved data without throwing: %j", (value) => {
    expect(projectStarterCardDetails(value)).toEqual(empty());
  });

  it("ignores malformed card entries and never constructs unattributed text", () => {
    const details = projectStarterCardDetails({ leader: null, cards: [null, false, { card_number: "__proto__", effect_text: "bad", text_attribution: "bad" }, { card_number: "ST01-002", effect_text: "Example", text_attribution: " " }] });
    expect(details.texts).toEqual({});
    expect(Object.keys(details.images)).toEqual(["ST01-002"]);
  });
});

describe("bounded starter detail fetch", () => {
  it("projects the same wire body as the server and clears the deadline on success", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: detail }));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchStarterCardDetails(starterId)).toEqual(projectStarterCardDetails(detail));
    expect(fetch).toHaveBeenCalledWith(`/api/v1/play/starters/${starterId}`, expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a pending response body after successful headers and cancels it", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }))));
    const pending = fetchStarterCardDetails(starterId);
    await vi.advanceTimersByTimeAsync(DETAILS_FETCH_TIMEOUT_MS);
    expect(await pending).toEqual(empty());
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds fetch itself even when a transport ignores abort", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetch);
    const pending = fetchStarterCardDetails(starterId);
    await vi.advanceTimersByTimeAsync(DETAILS_FETCH_TIMEOUT_MS);
    expect(await pending).toEqual(empty());
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([new Response("not-json"), Response.json({ data: { leader, cards: {} } }), new Response("offline", { status: 503 })])("falls back for malformed or failed responses", async (response) => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await fetchStarterCardDetails(starterId)).toEqual(empty());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back offline and cancels oversized bodies without trusting content length", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response("x".repeat(DETAILS_MAX_RESPONSE_BYTES + 1)));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchStarterCardDetails(starterId)).toEqual(empty());
    expect(await fetchStarterCardDetails(starterId)).toEqual(empty());
    expect(vi.getTimerCount()).toBe(0);
  });
});
