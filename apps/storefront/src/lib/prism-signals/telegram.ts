/**
 * Pure Telegram preview planner for PRISM Signals.
 *
 * This module never reads environment variables, calls Telegram, persists an
 * update, or grants an entitlement. The route verifies transport authority;
 * this planner copies only the minimum safe fields needed to form a direct
 * Bot API webhook response.
 */

import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  PRISM_TELEGRAM_PREVIEW_START,
} from "./presentation";

export { PRISM_TELEGRAM_PREVIEW_START } from "./presentation";

export type PrismTelegramBotApiReply =
  | {
      readonly kind: "send_message";
      readonly body: {
        readonly method: "sendMessage";
        readonly chat_id: number;
        readonly text: string;
        readonly protect_content: true;
        readonly link_preview_options: { readonly is_disabled: true };
      };
    }
  | {
      readonly kind: "answer_pre_checkout";
      readonly body: {
        readonly method: "answerPreCheckoutQuery";
        readonly pre_checkout_query_id: string;
        readonly ok: false;
        readonly error_message: string;
      };
    }
  | {
      readonly kind: "reject_payment_update";
      readonly event: "successful_payment" | "refunded_payment";
    }
  | { readonly kind: "empty" };

export type PrismTelegramPlan =
  | { readonly ok: true; readonly update_id: number; readonly reply: PrismTelegramBotApiReply }
  | {
      readonly ok: false;
      readonly code: "INVALID_UPDATE";
      readonly message: string;
    };

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeTelegramInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function sendMessage(chatId: number, text: string): PrismTelegramBotApiReply {
  return Object.freeze({
    kind: "send_message",
    body: Object.freeze({
      method: "sendMessage",
      chat_id: chatId,
      text,
      protect_content: true,
      link_preview_options: Object.freeze({ is_disabled: true }),
    }),
  });
}

export const PRISM_SIGNALS_TELEGRAM_DEMO_TEXT = [
  "◇ PRISM SIGNALS · SYNTHETIC PREVIEW",
  `${PRISM_SIGNALS_BRAND.name} ${PRISM_SIGNALS_BRAND.byline}`,
  PRISM_SIGNALS_BRAND.tagline,
  "",
  `${PRISM_SIGNALS_SYNTHETIC_CARD.classification.toUpperCase()} — illustration only`,
  ...PRISM_SIGNALS_SYNTHETIC_CARD.bands.map(
    (band) => `${band.label}: ${band.value}`,
  ),
  "",
  "RISKS",
  ...PRISM_SIGNALS_SYNTHETIC_CARD.risks.map((risk) => `• ${risk}`),
  "",
  "NON-CLAIMS",
  ...PRISM_SIGNALS_SYNTHETIC_CARD.nonClaims.map((claim) => `• ${claim}`),
  "",
  PRISM_SIGNALS_PREVIEW_NOTICE,
  `Full reading: ${PRISM_SIGNALS_LINKS.product.url}`,
  `Method: ${PRISM_SIGNALS_LINKS.methodology.url}`,
].join("\n");

const TERMS = [
  `${PRISM_SIGNALS_BRAND.name} preview terms`,
  PRISM_SIGNALS_LINKS.terms.url,
  "",
  "This preview is synthetic decision-support UI, not live market data, guaranteed arbitrage, investment advice, or authority to trade.",
].join("\n");

const SUPPORT = [
  `${PRISM_SIGNALS_BRAND.name} preview support`,
  PRISM_SIGNALS_LINKS.support.url,
  "",
  "No payment is accepted in this preview. Telegram cannot resolve purchases for the merchant; contact Cambridge TCG directly.",
].join("\n");

const PRIVACY = [
  `${PRISM_SIGNALS_BRAND.name} Telegram preview privacy`,
  PRISM_SIGNALS_LINKS.privacy.url,
  "",
  "Telegram and Cambridge TCG's Vercel-hosted route process the bounded bot update needed to reply. The preview creates no application record, account link, entitlement, or payment record; provider infrastructure logs and Telegram's own records can still exist.",
].join("\n");

function commandParts(text: string): {
  readonly command: string;
  readonly parameter: string | null;
} {
  const [first = "", ...parameters] = text.trim().split(/\s+/);
  return Object.freeze({
    command: first.toLowerCase().replace(/@[a-z0-9_]+$/i, ""),
    parameter: parameters.length === 0 ? null : parameters.join(" "),
  });
}

export function planPrismTelegramPreviewV1(raw: unknown): PrismTelegramPlan {
  const update = record(raw);
  const updateId = safeTelegramInteger(update?.update_id);
  if (!update || updateId === null) {
    return Object.freeze({
      ok: false,
      code: "INVALID_UPDATE",
      message: "A Telegram update with a safe update_id is required.",
    });
  }

  const preCheckout = record(update.pre_checkout_query);
  if (preCheckout) {
    const id = preCheckout.id;
    if (typeof id !== "string" || id.length < 1 || id.length > 128) {
      return Object.freeze({
        ok: false,
        code: "INVALID_UPDATE",
        message: "The pre-checkout query id is invalid.",
      });
    }
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({
        kind: "answer_pre_checkout",
        body: Object.freeze({
          method: "answerPreCheckoutQuery",
          pre_checkout_query_id: id,
          ok: false,
          error_message:
            "PRISM Signals payments are not enabled in this synthetic preview. No charge or access grant was created.",
        }),
      }),
    });
  }

  const message = record(update.message);
  if (record(message?.successful_payment)) {
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({
        kind: "reject_payment_update" as const,
        event: "successful_payment" as const,
      }),
    });
  }
  if (record(message?.refunded_payment)) {
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({
        kind: "reject_payment_update" as const,
        event: "refunded_payment" as const,
      }),
    });
  }

  const chat = record(message?.chat);
  const chatId = safeTelegramInteger(chat?.id);
  if (!message || !chat || chatId === null) {
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({ kind: "empty" as const }),
    });
  }
  if (chat.type !== "private") {
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({ kind: "empty" as const }),
    });
  }

  const text = typeof message.text === "string" ? message.text.slice(0, 4096) : "";
  const { command, parameter } = commandParts(text);
  const replyText =
    command === "/start"
      ? parameter === PRISM_TELEGRAM_PREVIEW_START
        ? PRISM_SIGNALS_TELEGRAM_DEMO_TEXT
        : null
      : parameter !== null
        ? null
        : command === "/demo"
          ? PRISM_SIGNALS_TELEGRAM_DEMO_TEXT
          : command === "/terms"
            ? TERMS
            : command === "/privacy"
              ? PRIVACY
              : command === "/support" || command === "/paysupport"
                ? SUPPORT
                : null;

  if (replyText === null) {
    return Object.freeze({
      ok: true,
      update_id: updateId,
      reply: Object.freeze({ kind: "empty" as const }),
    });
  }

  return Object.freeze({
    ok: true,
    update_id: updateId,
    reply: sendMessage(chatId, replyText),
  });
}
