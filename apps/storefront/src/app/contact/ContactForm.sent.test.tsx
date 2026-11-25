// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_FORM_READ_AIM } from "@/lib/feedback/promise";
import ContactForm from "./ContactForm";

// What the sender sees once the door has taken the message: the key, where
// the answer is, and a way to read it or delete the message there and then.

const KEY = `fbk_${"k".repeat(43)}`;
const REFERENCE = `fb_${"0".repeat(24)}`;
const answering = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => (ok ? { data } : { error: { message: "no" } }) } as Response);
const fetchMock = vi.fn<typeof fetch>();
const confirmMock = vi.fn<typeof window.confirm>();
const DELETED = "Deleted here: the message, any email address you left and any answer.";

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent!.replace(/\s+/g, " ");
const button = (label: string) => [...container.querySelectorAll("button")].find((element) => element.textContent === label)!;
const click = (label: string) => act(async () => button(label).click());
async function send() {
  const box = container.querySelector<HTMLTextAreaElement>("#contact-message")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Is the set list complete?");
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Send message");
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal("confirm", confirmMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<ContactForm open />));
  fetchMock.mockReturnValueOnce(answering({ feedback_id: REFERENCE, holder_key: KEY }));
  await send();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("the contact form when a message is not taken", () => {
  it("says so above Send, in an alert, and keeps what was written", async () => {
    await act(async () => root.render(<ContactForm key="again" open />));
    fetchMock.mockReturnValueOnce(answering(null, false));
    await send();
    expect(container.querySelector("[role=alert]")!.textContent).toBe("Not sentno");
    expect(container.querySelector("[role=alert]")!.nextElementSibling!.textContent).toBe("Send message");
    expect(container.querySelector<HTMLTextAreaElement>("#contact-message")!.value).toBe("Is the set list complete?");
  });
});

describe("the contact form once a message is sent", () => {
  it("shows the key once, why to copy it, and where the answer will be", () => {
    expect(text()).toContain("Message received.");
    expect(text()).toContain(`Your reference is ${REFERENCE}`);
    expect(text()).toContain(`${CONTACT_FORM_READ_AIM} An answer, if one is written, is shown on this page to whoever holds your key. No answer is emailed automatically; if you left an email address, a person may write to it.`);
    expect(text()).toContain(`Your key is ${KEY}. Copy it now: with it you can read an answer here and delete the message yourself. We keep only a fingerprint of it, so we cannot show it again. We delete the message 180 days after it arrives.`);
    expect(text()).not.toMatch(/We read every message|aim to reply|write back|you need it|[Oo]ur answer/);
  });

  it("moves to the receipt, which holds the key, and selects the key whole", () => {
    const receipt = container.querySelector("section")!;
    expect(document.activeElement).toBe(receipt);
    expect(receipt.textContent).toContain(KEY);
    // Named by its first words, and clear of the pinned header when scrolled to.
    expect(document.getElementById(receipt.getAttribute("aria-labelledby")!)!.textContent).toBe("Message received.");
    expect(receipt.className).toMatch(/\bscroll-mt-24\b/);
    expect([...container.querySelectorAll("code")].find((code) => code.textContent === KEY)!.className).toMatch(/\bselect-all\b/);
  });

  it("lets the sender check for an answer there and then, with the key just shown", async () => {
    expect(button("Check for an answer").disabled).toBe(false);
    fetchMock.mockReturnValueOnce(answering({ "@kind": "feedback-status", status: "answered", answer: { text: "Yes, it is.", answered_at: "2026-11-24T10:00:00Z" } }));
    await click("Check for an answer");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/feedback", { method: "GET", headers: { authorization: `Bearer ${KEY}` }, cache: "no-store" });
    expect(text()).toContain("Our answerYes, it is.");
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it.each([
    ["received", "No answer yet (status: received)."], ["read", "No answer yet (status: read)."],
    ["closed", "This message was closed without an answer here."],
  ])("says of a %s message with no answer: %s", async (status, words) => {
    fetchMock.mockReturnValueOnce(answering({ "@kind": "feedback-status", status, answer: null }));
    await click("Check for an answer");
    expect(text()).toContain(words);
  });

  it("asks before it deletes, and then the receipt and its key are gone", async () => {
    confirmMock.mockReturnValueOnce(false);
    await click("Delete my message");
    expect(confirmMock).toHaveBeenLastCalledWith("Delete this message now? Its key will open nothing.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text()).toContain(KEY);

    fetchMock.mockReturnValueOnce(answering({ erased: true }));
    button("Delete my message").focus();
    await click("Delete my message");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/feedback", { method: "DELETE", headers: { authorization: `Bearer ${KEY}` }, cache: "no-store" });
    expect(text()).toBe(DELETED);
    expect(document.activeElement).toBe(container.querySelector("section"));
  });

  it("keeps the receipt when the deletion fails", async () => {
    fetchMock.mockReturnValueOnce(answering(null, false));
    await click("Delete my message");
    expect(text()).toContain("Not doneno");
    expect(text()).toContain(KEY);
  });

  it("checks nothing and asks nothing of a key that is not one from this form", async () => {
    await act(async () => root.render(<ContactForm key="again" open={false} />));
    const box = container.querySelector<HTMLInputElement>("#contact-key")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box, REFERENCE);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Delete my message");
    expect(text()).toContain("That is your reference, for quoting in an email.");
    expect(confirmMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the key nowhere else and keeps it nowhere", () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ kind: "general", message: "Is the set list complete?", topic: "general" });
    expect([localStorage.length, sessionStorage.length, document.cookie]).toEqual([0, 0, ""]);
  });
});
