import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTACT_TOPICS, HOLDER_KEY_PATTERN, validateFeedback } from "@/lib/feedback/door";
import { FEEDBACK_READ_AIM } from "@/lib/feedback/promise";
import ContactForm from "./ContactForm";

const source = readFileSync(new URL("./ContactForm.tsx", import.meta.url), "utf8");

describe("the /contact form, the human half of the feedback door", () => {
  it("offers only topics the door accepts, and sends a body the door keeps", () => {
    const topics = [...source.matchAll(/\{ value: "([a-z-]+)", label:/g)].map((match) => match[1]);
    expect(topics).toEqual([...CONTACT_TOPICS]);
    for (const topic of topics) {
      expect(validateFeedback({ kind: "general", message: "Where is my parcel?", topic, reply_name: "Ada", reply_to: "ada@example.com" }).ok).toBe(true);
    }
    expect(source).toContain('kind: "general"');
    expect(source).toContain("reply_name: name.trim() || undefined");
    expect(source).toContain("reply_to: email.trim() || undefined");
  });

  it("keeps the holder key in memory only and sends it as a header", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(source).toContain("authorization: `Bearer ${holderKey}`");
  });

  it("renders the form and the way back to an earlier message", () => {
    const markup = renderToStaticMarkup(<ContactForm open />);
    expect(markup).toContain("Send message");
    expect(markup).toContain("Sent a message before?");
    expect(markup).toContain("Check for an answer");
    expect(markup).toContain("Delete my message");
    expect(markup).toMatch(/maxlength="4000"/i);
  });

  it("says before sending where the answer is, that nothing is emailed, and what to leave out", () => {
    const words = renderToStaticMarkup(<ContactForm open />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(words).toContain("Optional. Nothing is sent to it automatically, but a person may write to it. Our answer is shown here, with the key you get.");
    expect(words).toContain("Please leave out passwords, card payment details and anything else private that we do not need. If you are under 18, ask a parent or guardian to write to us.");
    expect(words).not.toMatch(/write back|reply within/i);
  });

  it("says the same after sending, and why to copy the key", () => {
    // The receipt is drawn only in the browser, so its words are read from the source, on one line.
    const line = source.replace(/\s+/g, " ");
    expect(line).toContain("{FEEDBACK_READ_AIM} Our answer is shown on this page to whoever holds your key. Nothing is emailed automatically; if you left an email address, a person may write to it.");
    expect(line).toContain("Copy it now: you need it to read our answer or delete the message, and we keep only a fingerprint of it, so we cannot show it again.");
    expect(FEEDBACK_READ_AIM).toBe("We aim to read every message within 48 hours.");
    expect(line).not.toMatch(/We read every message|aim to reply/);
  });

  it("offers no form while the door is closed, and still opens an earlier message", () => {
    const markup = renderToStaticMarkup(<ContactForm open={false} />);
    expect(markup).not.toContain("Send message");
    expect(markup).toContain("not taking messages");
    expect(markup).toContain("Check for an answer");
  });

  it("shows a status only for a reply about the message, and checks a key's shape first", () => {
    expect(source).toContain('json.data?.["@kind"] !== "feedback-status"');
    const pattern = /const HOLDER_KEY = (\/.+\/);/.exec(source)?.[1];
    expect(pattern).toBe(String(HOLDER_KEY_PATTERN));
  });
});
