import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, PRISM_TELEGRAM_MAX_REQUEST_BYTES } from "./route";
import {
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_NON_CLAIMS,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  PRISM_SIGNALS_TELEGRAM_COMMANDS,
  PRISM_TELEGRAM_PREVIEW_START,
} from "@/lib/prism-signals/presentation";

vi.mock("server-only", () => ({}));

const SECRET = "test_prism_webhook_secret_placeholder";
const originalMode = process.env.PRISM_SIGNALS_MODE;
const originalUsername = process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME;
const originalSecret = process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET;
const originalPosture = process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE;

function request(
  body: unknown,
  options: { secret?: string; contentLength?: string } = {},
): Request {
  const encoded = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-telegram-bot-api-secret-token": options.secret ?? SECRET,
  });
  if (options.contentLength) headers.set("content-length", options.contentLength);
  return new Request("https://preview.example/api/prism-signals/telegram", {
    method: "POST",
    headers,
    body: encoded,
  });
}

function privateMessage(text: string) {
  return {
    update_id: 42,
    message: {
      message_id: 7,
      from: { id: 1234, is_bot: false, first_name: "Preview" },
      chat: { id: 1234, type: "private" },
      date: 1_788_000_000,
      text,
    },
  };
}

beforeEach(() => {
  process.env.PRISM_SIGNALS_MODE = "fixture-test";
  process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME = "PrismSignalsPreviewBot";
  process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE =
    "clean-nonpayment-privacy-wired-v1";
});

afterEach(() => {
  if (originalMode === undefined) delete process.env.PRISM_SIGNALS_MODE;
  else process.env.PRISM_SIGNALS_MODE = originalMode;
  if (originalUsername === undefined) {
    delete process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME;
  } else {
    process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME = originalUsername;
  }
  if (originalSecret === undefined) {
    delete process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET;
  } else {
    process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET = originalSecret;
  }
  if (originalPosture === undefined) {
    delete process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE;
  } else {
    process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE = originalPosture;
  }
});

describe("PRISM Signals Telegram preview webhook", () => {
  it("fails before parsing when preview configuration is absent", async () => {
    delete process.env.PRISM_SIGNALS_MODE;
    const response = await POST(request("not-json"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PRISM_TELEGRAM_PREVIEW_DISABLED" },
    });
  });

  it("requires the explicit clean non-payment bot posture", async () => {
    delete process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE;
    const response = await POST(request(privateMessage("/demo")));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PRISM_TELEGRAM_PREVIEW_DISABLED" },
    });
  });

  it("rejects a missing or incorrect Telegram secret", async () => {
    for (const supplied of ["wrong_secret_0123456789_ABCDEFG", ""]) {
      const response = await POST(request(privateMessage("/demo"), { secret: supplied }));
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain(SECRET);
    }
  });

  it("rejects declared and streamed bodies above 32 KiB", async () => {
    const declared = await POST(
      request({}, { contentLength: String(PRISM_TELEGRAM_MAX_REQUEST_BYTES + 1) }),
    );
    expect(declared.status).toBe(413);

    const streamed = await POST(request("x".repeat(PRISM_TELEGRAM_MAX_REQUEST_BYTES + 1)));
    expect(streamed.status).toBe(413);
  });

  it("rejects malformed JSON and malformed updates", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request({ update_id: "42" }))).status).toBe(400);
  });

  it("returns a protected synthetic demo with no private economics", async () => {
    const response = await POST(request(privateMessage("/demo")));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      method: "sendMessage",
      chat_id: 1234,
      protect_content: true,
    });
    expect(body.text).toContain("SYNTHETIC PREVIEW");
    expect(body.text).toContain("Liquidity: Unknown");
    expect(body.text).not.toMatch(
      /fair.value|gross.exit|asking_price_minor|source_url|seller_id|guaranteed arbitrage/i,
    );
    for (const risk of PRISM_SIGNALS_SYNTHETIC_CARD.risks) {
      expect(body.text).toContain(risk);
    }
    for (const nonClaim of PRISM_SIGNALS_NON_CLAIMS) {
      expect(body.text).toContain(nonClaim);
    }
    expect(body.text).toContain(PRISM_SIGNALS_LINKS.product.url);
    expect(body.text).toContain(PRISM_SIGNALS_LINKS.methodology.url);
  });

  it("round-trips the exact Telegram deep-link start parameter", async () => {
    const response = await POST(
      request(privateMessage(`/start ${PRISM_TELEGRAM_PREVIEW_START}`)),
    );
    const body = await response.json();
    expect(body.text).toContain("◇ PRISM SIGNALS · SYNTHETIC PREVIEW");
    expect(body.text).not.toContain("Use /demo");
  });

  it.each(["/terms", "/privacy", "/support", "/paysupport"])(
    "supports the required %s command",
    async (command) => {
      const response = await POST(request(privateMessage(command)));
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.text).toMatch(/cambridgetcg\.com|No payment/i);
    },
  );

  it("declares exactly the implemented text command allowlist", () => {
    expect(PRISM_SIGNALS_TELEGRAM_COMMANDS).toEqual([
      "/demo",
      "/terms",
      "/privacy",
      "/support",
      "/paysupport",
    ]);
  });

  it.each([
    "hello",
    "/unknown",
    "/buy",
    "/subscribe",
    "/start",
    "/start wrong_parameter",
    `/start ${PRISM_TELEGRAM_PREVIEW_START} extra_parameter`,
    "/demo extra_parameter",
  ])("silently ignores non-allowlisted private text %j", async (text) => {
    const response = await POST(request(privateMessage(text)));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("rejects pre-checkout inline without granting access", async () => {
    const response = await POST(
      request({
        update_id: 43,
        pre_checkout_query: {
          id: "pcq_preview_1",
          from: { id: 1234 },
          currency: "XTR",
          total_amount: 100,
          invoice_payload: "prism-signals",
        },
      }),
    );
    expect(await response.json()).toEqual({
      method: "answerPreCheckoutQuery",
      pre_checkout_query_id: "pcq_preview_1",
      ok: false,
      error_message:
        "PRISM Signals payments are not enabled in this synthetic preview. No charge or access grant was created.",
    });
  });

  it("does not fulfil an unexpected payment update", async () => {
    const update = privateMessage("");
    (update.message as Record<string, unknown>).successful_payment = {
      currency: "XTR",
      total_amount: 100,
    };
    const response = await POST(request(update));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(body.error.code).toBe("PRISM_PAYMENT_UPDATE_UNSUPPORTED");
    expect(JSON.stringify(body)).not.toContain("active");
  });

  it("also refuses to acknowledge a refund update", async () => {
    const update = privateMessage("");
    (update.message as Record<string, unknown>).refunded_payment = {
      currency: "XTR",
      total_amount: 100,
    };
    const response = await POST(request(update));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "PRISM_PAYMENT_UPDATE_UNSUPPORTED",
    );
  });

  it("ignores non-private and unsupported updates", async () => {
    const group = privateMessage("/demo");
    group.message.chat.type = "group";
    expect((await POST(request(group))).status).toBe(204);
    expect((await POST(request({ update_id: 44, callback_query: {} }))).status).toBe(204);
  });
});
