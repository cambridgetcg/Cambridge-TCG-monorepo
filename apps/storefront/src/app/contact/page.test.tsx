import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTACT_FORM_READ_AIM, FEEDBACK_READ_AIM } from "@/lib/feedback/promise";
import ContactPage, { metadata } from "./page";

const drawn = (flag: string) => {
  vi.stubEnv("PUBLIC_FEEDBACK", flag);
  return renderToStaticMarkup(<ContactPage />);
};
const said = (flag: string) => drawn(flag).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").replace(/ ([.,;])/g, "$1");
const UNDER_18 = "If you are under 18, ask a parent or guardian to write to us.";
afterEach(() => vi.unstubAllEnvs());

describe("/contact", () => {
  it("while the door is open: write below, the aim for the form's messages, and where an answer is", () => {
    const words = said("on");
    expect(CONTACT_FORM_READ_AIM).toBe("We aim to read every message sent with this form within 48 hours.");
    expect(words).toContain(`anything else: write below. ${CONTACT_FORM_READ_AIM} ${UNDER_18}`);
    expect(words).toContain("Send message");
    expect(words).toContain("If you use the form, it keeps your message for 180 days, or until you delete it with your key; see what the form keeps. An answer, if one is written, is shown on this page to whoever holds your key. No answer is emailed automatically; if you left an email address, a person may write to it. Prefer plain email? Write to contact@cambridgetcg.com.");
    // What is said of the form is not said of the email.
    expect(drawn("on")).toMatch(/<\/p><p>Prefer plain email\?/);
  });

  it.each(["", "off", "true", "on "])("while the door is closed (%j): the email address, and nothing that is true only of the form", (flag) => {
    const words = said(flag);
    expect(words).toContain(`anything else: email us. ${UNDER_18} The form is not taking messages at the moment. Please email contact@cambridgetcg.com instead.`);
    expect(words).not.toMatch(/write below|Send message|use the form|Prefer plain email/);
    // Who reads the mailbox, and when, is not known, so nothing is said of it.
    expect(words).not.toMatch(/48|aim to/);
    // A key from an earlier message still opens it.
    expect(words).toContain("Check for an answer");
  });

  it("says of the form's messages that we aim to read them, and nowhere who reads, that an answer comes, or when", () => {
    for (const words of [said("on"), said(""), metadata.description]) {
      expect(words).not.toMatch(/a human|same people|aim to reply|reply within|write back|we read every message|our answer/i);
      expect(words).not.toContain(FEEDBACK_READ_AIM);
    }
    expect(said("on").split("48 hours")).toHaveLength(2);
  });

  it("describes itself in words that hold open or closed", () => {
    expect(metadata.description).toBe("Get in touch with Cambridge TCG: email contact@cambridgetcg.com, or use the form on this page while it is taking messages.");
  });
});
