/**
 * Pure Telegram preview planner for PRISM Signals.
 *
 * This module never reads environment variables, calls Telegram, persists an
 * update, or grants an entitlement. The host verifies transport authority;
 * this planner copies only the minimum safe fields needed to form a direct Bot
 * API webhook response.
 */

import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_PUBLIC_ORIGIN,
  PRISM_SIGNALS_SYNTHETIC_CARD,
  PRISM_TELEGRAM_PREVIEW_START,
  createPrismSignalsLinks,
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
  | {
      readonly ok: true;
      readonly update_id: number;
      readonly reply: PrismTelegramBotApiReply;
    }
  | {
      readonly ok: false;
      readonly code: "INVALID_UPDATE";
      readonly message: string;
    };

export interface PrismSignalsTelegramCopyConfigurationV1 {
  /** A bare HTTPS origin; all Telegram context links are derived from it. */
  readonly origin: string;
  /**
   * Host-owned, single-paragraph privacy wording that truthfully names its
   * controller and relevant processors. URLs belong in the generated link.
   */
  readonly privacy_notice: string;
}

export type PrismTelegramPreviewConfiguration =
  PrismSignalsTelegramCopyConfigurationV1;

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

const CAMBRIDGE_TELEGRAM_PRIVACY_NOTICE =
  "Telegram and Cambridge TCG's Vercel-hosted route process the bounded bot update needed to reply. The preview creates no application record, account link, entitlement, or payment record; provider infrastructure logs and Telegram's own records can still exist.";

function parseTelegramCopyConfigurationV1(
  raw: PrismSignalsTelegramCopyConfigurationV1,
) {
  const configuration = record(raw);
  if (
    !configuration ||
    Object.keys(configuration).sort().join(",") !==
      "origin,privacy_notice"
  ) {
    throw new TypeError(
      "PRISM Signals Telegram copy requires exactly origin and privacy_notice.",
    );
  }

  const { origin, privacy_notice: privacyNotice } = configuration;
  if (
    typeof origin !== "string" ||
    typeof privacyNotice !== "string" ||
    privacyNotice !== privacyNotice.trim() ||
    privacyNotice.length < 40 ||
    privacyNotice.length > 1_000 ||
    /[\u0000-\u001f\u007f\u2028\u2029]/u.test(privacyNotice) ||
    /https?:\/\//i.test(privacyNotice)
  ) {
    throw new TypeError(
      "PRISM Signals privacy_notice must be one URL-free paragraph of 40 to 1000 characters.",
    );
  }

  return Object.freeze({
    links: createPrismSignalsLinks(origin),
    privacyNotice,
  });
}

/**
 * Builds deterministic Telegram copy from one validated origin and host-owned
 * privacy statement. Callers cannot supply individual or mixed-host links.
 */
export function createPrismSignalsTelegramCopyV1(
  configuration: PrismSignalsTelegramCopyConfigurationV1,
) {
  const { links, privacyNotice } =
    parseTelegramCopyConfigurationV1(configuration);
  return Object.freeze({
    demo: [
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
      `Full reading: ${links.product.url}`,
      `Method: ${links.methodology.url}`,
    ].join("\n"),
    terms: [
      `${PRISM_SIGNALS_BRAND.name} preview terms`,
      links.terms.url,
      "",
      "This preview is synthetic decision-support UI, not live market data, guaranteed arbitrage, investment advice, or authority to trade.",
    ].join("\n"),
    support: [
      `${PRISM_SIGNALS_BRAND.name} preview support`,
      links.support.url,
      "",
      "No payment is accepted in this preview. Telegram cannot resolve purchases for the merchant; contact Cambridge TCG directly.",
    ].join("\n"),
    privacy: [
      `${PRISM_SIGNALS_BRAND.name} Telegram preview privacy`,
      links.privacy.url,
      "",
      privacyNotice,
    ].join("\n"),
  });
}

export type PrismSignalsTelegramCopyV1 = ReturnType<
  typeof createPrismSignalsTelegramCopyV1
>;

export const PRISM_SIGNALS_TELEGRAM_COPY =
  createPrismSignalsTelegramCopyV1({
    origin: PRISM_SIGNALS_PUBLIC_ORIGIN,
    privacy_notice: CAMBRIDGE_TELEGRAM_PRIVACY_NOTICE,
  });

/** Compatibility constant for the canonical Cambridge TCG host. */
export const PRISM_SIGNALS_TELEGRAM_DEMO_TEXT =
  PRISM_SIGNALS_TELEGRAM_COPY.demo;

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

export function planPrismTelegramPreviewV1(
  raw: unknown,
  configuration?: PrismTelegramPreviewConfiguration,
): PrismTelegramPlan {
  const copy =
    configuration === undefined
      ? PRISM_SIGNALS_TELEGRAM_COPY
      : createPrismSignalsTelegramCopyV1(configuration);
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

  const text =
    typeof message.text === "string" ? message.text.slice(0, 4096) : "";
  const { command, parameter } = commandParts(text);
  const replyText =
    command === "/start"
      ? parameter === PRISM_TELEGRAM_PREVIEW_START
        ? copy.demo
        : null
      : parameter !== null
        ? null
        : command === "/demo"
          ? copy.demo
          : command === "/terms"
            ? copy.terms
            : command === "/privacy"
              ? copy.privacy
              : command === "/support" || command === "/paysupport"
                ? copy.support
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
