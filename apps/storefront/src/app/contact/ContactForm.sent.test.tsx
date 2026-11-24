// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_READ_AIM } from "@/lib/feedback/promise";
import ContactForm from "./ContactForm";

// What the sender sees once the door has taken the message: the key, where
// the answer is, and a way to read it or delete the message there and then.

const KEY = `fbk_${"k".repeat(43)}`;
const REFERENCE = `fb_${"0".repeat(24)}`;
const answering = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => (ok ? { data } : { error: { message: "no" } }) } as Response);
const fetchMock = vi.fn<typeof fetch>();

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

describe("the contact form once a message is sent", () => {
  it("shows the key once, why to copy it, and where the answer will be", () => {
    expect(text()).toContain("Message received.");
    expect(text()).toContain(`Your reference is ${REFERENCE}`);
    expect(text()).toContain(`${FEEDBACK_READ_AIM} Our answer is shown on this page to whoever holds your key. Nothing is emailed automatically; if you left an email address, a person may write to it.`);
    expect(text()).toContain(`Your key is ${KEY}. Copy it now: you need it to read our answer or delete the message, and we keep only a fingerprint of it, so we cannot show it again.`);
    expect(text()).not.toMatch(/We read every message|aim to reply|write back/);
  });

  it("lets the sender check for an answer there and then, with the key just shown", async () => {
    expect(button("Check for an answer").disabled).toBe(false);
    fetchMock.mockReturnValueOnce(answering({ "@kind": "feedback-status", status: "answered", answer: { text: "Yes, it is.", answered_at: "2026-11-24T10:00:00Z" } }));
    await click("Check for an answer");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/feedback", { method: "GET", headers: { authorization: `Bearer ${KEY}` }, cache: "no-store" });
    expect(text()).toContain("Our answerYes, it is.");
  });

  it("lets the sender delete the message there and then", async () => {
    expect(button("Delete my message").disabled).toBe(false);
    fetchMock.mockReturnValueOnce(answering({ erased: true }));
    await click("Delete my message");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/feedback", { method: "DELETE", headers: { authorization: `Bearer ${KEY}` }, cache: "no-store" });
    expect(text()).toContain("Deleted: the message, any email address you left and our answer are gone.");
    expect(button("Check for an answer").disabled).toBe(true);
  });

  it("sends the key nowhere else and keeps it nowhere", () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ kind: "general", message: "Is the set list complete?", topic: "general" });
    expect([localStorage.length, sessionStorage.length, document.cookie]).toEqual([0, 0, ""]);
  });
});
