import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRISM_SIGNALS_LINKS } from "./presentation";

const privacy = readFileSync(
  new URL("../../app/privacy/page.tsx", import.meta.url),
  "utf8",
);
const terms = readFileSync(
  new URL("../../app/prism-signals/terms/page.tsx", import.meta.url),
  "utf8",
);
const landing = readFileSync(
  new URL("../../app/prism-signals/page.tsx", import.meta.url),
  "utf8",
);
const runtime = readFileSync(new URL("./runtime.server.ts", import.meta.url), "utf8");

describe("PRISM Telegram privacy enablement contract", () => {
  it("names processed update fields, recipients, logs, and no application record", () => {
    for (const phrase of [
      "profile or display-name fields",
      "private-chat or pre-checkout id",
      "Vercel",
      "Telegram",
      "no application",
      "privacy policy",
    ]) {
      expect(privacy).toContain(phrase);
    }
  });

  it("puts the privacy notice before an enabled Telegram handoff", () => {
    expect(landing).toContain("telegramHref ?");
    expect(landing).toContain("href={PRISM_SIGNALS_LINKS.privacy.path}");
    expect(PRISM_SIGNALS_LINKS.privacy.path).toBe(
      "/privacy#prism-signals-telegram",
    );
    expect(landing).toContain("provider access and");
    expect(terms).toContain("detailed Telegram preview privacy notice");
  });

  it("requires the clean, invoice-free, privacy-wired operator posture", () => {
    expect(runtime).toContain("clean-nonpayment-privacy-wired-v1");
    expect(runtime).toContain("PRISM_SIGNALS_TELEGRAM_BOT_POSTURE");
  });
});
