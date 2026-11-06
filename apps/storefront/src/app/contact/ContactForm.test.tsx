import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTACT_TOPICS, validateFeedback } from "@/lib/feedback/door";
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
    const markup = renderToStaticMarkup(<ContactForm />);
    expect(markup).toContain("Send message");
    expect(markup).toContain("Sent a message before?");
    expect(markup).toContain("Check for an answer");
    expect(markup).toContain("Delete my message");
    expect(markup).toMatch(/maxlength="4000"/i);
  });
});
