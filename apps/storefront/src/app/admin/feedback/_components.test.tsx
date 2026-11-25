// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ answerFeedback: vi.fn(), markFeedback: vi.fn(), deleteFeedback: vi.fn() }));
vi.mock("./_actions", () => actions);

import { FeedbackActions, Said } from "./_components";

const ID = "fb_0123456789abcdef01234567";
let container: HTMLDivElement;
let root: Root;
const show = (messages: { id?: string; status: string; answer?: string }[]) => act(async () => root.render(
  <Said>{messages.map(({ id = ID, status, answer = "" }) => <FeedbackActions key={id} id={id} status={status} answer={answer} />)}</Said>,
));
const buttons = () => [...container.querySelectorAll("button")].map((button) => `${button.textContent}${button.disabled ? " (off)" : ""}`);
const press = (label: string) => act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());
const said = () => container.querySelector("[role=status]")!.textContent;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (const action of Object.values(actions)) action.mockReset().mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("what an operator does with one message", () => {
  it("keeps every button in its place, so that a second click on one meets no other", async () => {
    for (const [status, shown] of [
      ["received", ["Save answer (off)", "Mark read", "Close", "Delete"]],
      ["read", ["Save answer (off)", "Mark read (off)", "Close", "Delete"]],
      ["answered", ["Save answer (off)", "Mark read (off)", "Close", "Delete"]],
      ["closed", ["Save answer (off)", "Mark read (off)", "Close (off)", "Delete"]],
    ] as const) {
      await show([{ status }]);
      expect(buttons(), status).toEqual(shown);
    }
  });

  it("says what was done, and goes on saying it when the message has left the list", async () => {
    await show([{ status: "received", answer: "Yes." }]);
    expect(said()).toBe("");
    await press("Save answer");
    expect(actions.answerFeedback).toHaveBeenCalledWith({ id: ID, answer: "Yes." });
    expect(said()).toBe(`Saved the answer to ${ID}.`);
    await show([]);
    expect(said()).toBe(`Saved the answer to ${ID}.`);

    await show([{ status: "received" }]);
    await press("Mark read");
    expect(said()).toBe(`Marked ${ID} read.`);
    await press("Close");
    expect(said()).toBe(`Closed ${ID}.`);
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await press("Delete");
    expect(actions.deleteFeedback).not.toHaveBeenCalled();
    await press("Delete");
    expect(said()).toBe(`Deleted ${ID}.`);
  });

  it("says beside the message when it did not work, and no longer what the last one did", async () => {
    await show([{ status: "received" }]);
    await press("Close");
    actions.markFeedback.mockResolvedValueOnce({ ok: false, error: "No unread message has that id." });
    await press("Mark read");
    expect(container.querySelector("[role=alert]")!.textContent).toBe("No unread message has that id.");
    expect(said()).toBe("");
  });

  it("names each message's controls by its id", async () => {
    await show([{ status: "received" }, { id: "fb_ffffffffffffffffffffffff", status: "read" }]);
    expect([...container.querySelectorAll("[role=group]")].map((group) => group.getAttribute("aria-label"))).toEqual([ID, "fb_ffffffffffffffffffffffff"]);
  });
});
