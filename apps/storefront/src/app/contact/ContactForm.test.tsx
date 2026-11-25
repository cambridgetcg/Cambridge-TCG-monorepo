import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTACT_TOPICS, HOLDER_KEY_PATTERN, validateFeedback } from "@/lib/feedback/door";
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

  it("says before sending where an answer is, that nothing is sent to the address, and what to leave out", () => {
    const words = renderToStaticMarkup(<ContactForm open />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(words).toContain("Optional. Nothing is sent to it automatically, but a person may write to it. Any answer is shown here, with the key you get.");
    expect(words).toContain("Please leave out passwords, card payment details and anything else private that we do not need.");
    expect(words).not.toMatch(/write back|reply within|[Oo]ur answer/);
  });

  it("ties each field to its hint, so that the hint is heard with it", () => {
    for (const [open, fields] of [[true, ["contact-name", "contact-email", "contact-message", "contact-key"]], [false, ["contact-key"]]] as const) {
      const markup = renderToStaticMarkup(<ContactForm open={open} />);
      expect([...markup.matchAll(/aria-describedby="([^"]*)"/g)].map((match) => match[1])).toEqual(fields.map((id) => `${id}-hint`));
      for (const id of fields) expect(markup.match(new RegExp(`id="${id}-hint"`, "g")), id).toHaveLength(1);
    }
  });

  it("has a place for a refusal above Send, there before there is one", () => {
    expect(renderToStaticMarkup(<ContactForm open />)).toMatch(/<div role="alert"><\/div><button type="submit"[^>]*>Send message<\/button>/);
  });

  it("offers no form while the door is closed, and still opens an earlier message", () => {
    const markup = renderToStaticMarkup(<ContactForm open={false} />);
    expect(markup).not.toContain("Send message");
    expect(markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).toContain("The form is not taking messages at the moment. Please email contact@cambridgetcg.com instead.");
    expect(markup).toContain('href="mailto:contact@cambridgetcg.com"');
    expect(markup).toContain("Check for an answer");
  });

  it("shows a status only for a reply about the message, and checks a key's shape first", () => {
    expect(source).toContain('json.data?.["@kind"] !== "feedback-status"');
    const pattern = /const HOLDER_KEY = (\/.+\/);/.exec(source)?.[1];
    expect(pattern).toBe(String(HOLDER_KEY_PATTERN));
  });
});
