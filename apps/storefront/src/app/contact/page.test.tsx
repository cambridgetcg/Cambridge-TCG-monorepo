import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEEDBACK_READ_AIM } from "@/lib/feedback/promise";
import ContactPage, { metadata } from "./page";

const said = (flag: string) => {
  vi.stubEnv("PUBLIC_FEEDBACK", flag);
  return renderToStaticMarkup(<ContactPage />).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").replace(/ ([.,;])/g, "$1");
};
afterEach(() => vi.unstubAllEnvs());

describe("/contact", () => {
  it("while the door is open: write below, the one promise, and where the answer is", () => {
    const words = said("on");
    expect(words).toContain(`anything else: write below. ${FEEDBACK_READ_AIM}`);
    expect(words).toContain("Send message");
    expect(words).toContain("Prefer plain email? Write to contact@cambridgetcg.com. The form keeps your message for 180 days, or until you delete it with your key; see what the form keeps.");
    expect(words).toContain("Our answer is shown on this page to whoever holds your key. Nothing is emailed automatically; if you left an email address, a person may write to it.");
  });

  it.each(["", "off", "true", "on "])("while the door is closed (%j): the email address, and nothing that is true only of the form", (flag) => {
    const words = said(flag);
    expect(words).toContain(`anything else: write to the email address below. ${FEEDBACK_READ_AIM}`);
    expect(words).toContain("The form is not taking messages at the moment. Please email us instead: the address is below.");
    expect(words).toContain("Write to contact@cambridgetcg.com.");
    expect(words).not.toMatch(/write below|Send message|The form keeps|Prefer plain email/);
    // A key from an earlier message still opens it.
    expect(words).toContain("Check for an answer");
  });

  it("promises to read, and not who reads, an answer or a time for one, open or closed", () => {
    for (const words of [said("on"), said(""), metadata.description]) {
      expect(words).toContain(FEEDBACK_READ_AIM);
      expect(words).not.toMatch(/a human|same people|aim to reply|reply within|write back|we read every message/i);
    }
  });

  it("describes itself in words that hold open or closed", () => {
    expect(metadata.description).toBe("Get in touch with Cambridge TCG: email contact@cambridgetcg.com, or use the form on this page while it is taking messages. We aim to read every message within 48 hours.");
  });
});
