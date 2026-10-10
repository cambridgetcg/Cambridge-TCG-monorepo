import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("server-only", () => ({}));

const ORIGINAL = {
  mode: process.env.PRISM_SIGNALS_MODE,
  username: process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME,
  secret: process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET,
  posture: process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE,
};

afterEach(() => {
  for (const [key, value] of [
    ["PRISM_SIGNALS_MODE", ORIGINAL.mode],
    ["PRISM_SIGNALS_TELEGRAM_BOT_USERNAME", ORIGINAL.username],
    ["PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET", ORIGINAL.secret],
    ["PRISM_SIGNALS_TELEGRAM_BOT_POSTURE", ORIGINAL.posture],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("PRISM Signals offer endpoint", () => {
  it("publishes the exact web-only preview contract by default", async () => {
    delete process.env.PRISM_SIGNALS_MODE;
    delete process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME;
    delete process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET;
    const response = await GET();
    const offer = await response.json();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(offer).toMatchObject({
      schema: "cambridgetcg.product-offer/1",
      id: "prism-signals",
      status: "preview",
      environment: "test",
      delivery: {
        web: { availability: "test", url: "/prism-signals" },
        telegram: { availability: "off" },
      },
      rights: { decision: "not_evaluated" },
    });
    expect(offer.rails.every((rail: { availability: string }) => rail.availability === "off")).toBe(true);
  });

  it("reveals only public bot identity when all test gates are configured", async () => {
    process.env.PRISM_SIGNALS_MODE = "fixture-test";
    process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME = "PrismSignalsPreviewBot";
    process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET =
      "preview_secret_0123456789_ABCDEFG";
    process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE =
      "clean-nonpayment-privacy-wired-v1";
    const response = await GET();
    const offer = await response.json();
    expect(offer.delivery.telegram).toEqual({
      availability: "test",
      bot_username: "PrismSignalsPreviewBot",
      start_parameter: "demo_prism_v1",
    });
    expect(JSON.stringify(offer)).not.toContain("preview_secret");
    expect(offer.rails.find((rail: { rail: string }) => rail.rail === "telegram_stars").availability).toBe("off");
  });

  it("fails closed when Telegram identity or secret configuration drifts", async () => {
    process.env.PRISM_SIGNALS_MODE = "fixture-test";
    process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME = "not-a-bot";
    process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET = "short";
    const offer = await (await GET()).json();
    expect(offer.delivery.telegram).toEqual({ availability: "off" });
  });
});
