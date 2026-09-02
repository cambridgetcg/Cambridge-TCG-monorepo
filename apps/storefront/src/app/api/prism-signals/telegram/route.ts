import { timingSafeEqual } from "node:crypto";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import { prismSignalsTelegramWebhookSecret } from "@/lib/prism-signals/runtime.server";
import { planPrismTelegramPreviewV1 } from "@/lib/prism-signals/telegram";

export const runtime = "nodejs";

export const PRISM_TELEGRAM_MAX_REQUEST_BYTES = 32 * 1024;

const NO_STORE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function secretMatches(expected: string, supplied: string | null): boolean {
  if (supplied === null) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function POST(request: Request): Promise<Response> {
  const secret = prismSignalsTelegramWebhookSecret();
  if (secret === null) {
    return json(
      {
        error: {
          code: "PRISM_TELEGRAM_PREVIEW_DISABLED",
          message: "The PRISM Telegram preview is not configured.",
        },
      },
      503,
    );
  }

  if (
    !secretMatches(
      secret,
      request.headers.get("x-telegram-bot-api-secret-token"),
    )
  ) {
    return json(
      {
        error: {
          code: "INVALID_TELEGRAM_SECRET",
          message: "The Telegram webhook secret did not verify.",
        },
      },
      401,
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      Number.isFinite(parsedLength) &&
      parsedLength > PRISM_TELEGRAM_MAX_REQUEST_BYTES
    ) {
      return json(
        {
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "The Telegram update exceeds 32 KiB.",
          },
        },
        413,
      );
    }
  }

  const body = await readBoundedUtf8Body(
    request,
    PRISM_TELEGRAM_MAX_REQUEST_BYTES,
    "PRISM Telegram update",
  );
  if (!body.ok) {
    return json(
      {
        error: {
          code: body.kind === "too_large" ? "REQUEST_TOO_LARGE" : "INVALID_UPDATE",
          message:
            body.kind === "too_large"
              ? "The Telegram update exceeds 32 KiB."
              : "A valid UTF-8 Telegram update is required.",
        },
      },
      body.kind === "too_large" ? 413 : 400,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body.text) as unknown;
  } catch {
    return json(
      {
        error: {
          code: "INVALID_UPDATE",
          message: "A valid JSON Telegram update is required.",
        },
      },
      400,
    );
  }

  const plan = planPrismTelegramPreviewV1(raw);
  if (!plan.ok) {
    return json({ error: { code: plan.code, message: plan.message } }, 400);
  }
  if (plan.reply.kind === "reject_payment_update") {
    return Response.json(
      {
        error: {
          code: "PRISM_PAYMENT_UPDATE_UNSUPPORTED",
          message:
            "The non-payment preview cannot acknowledge or fulfil a Telegram payment-bearing update.",
        },
      },
      {
        status: 503,
        headers: { ...NO_STORE_HEADERS, "Retry-After": "60" },
      },
    );
  }
  if (plan.reply.kind === "empty") {
    return new Response(null, { status: 204, headers: NO_STORE_HEADERS });
  }
  return json(plan.reply.body);
}
