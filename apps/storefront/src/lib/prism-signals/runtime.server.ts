import "server-only";
import { isProductFlowContractError } from "@cambridge-tcg/product-flow";
import {
  createPrismSignalsPreviewOffer,
  prismSignalsTelegramPreviewHref,
} from "./product";

type PrismSignalsRuntimeEnv = {
  readonly PRISM_SIGNALS_MODE?: string;
  readonly PRISM_SIGNALS_TELEGRAM_BOT_USERNAME?: string;
  readonly PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET?: string;
  readonly PRISM_SIGNALS_TELEGRAM_BOT_POSTURE?: string;
};

export const PRISM_SIGNALS_FIXTURE_MODE = "fixture-test";
export const PRISM_SIGNALS_CLEAN_BOT_POSTURE =
  "clean-nonpayment-privacy-wired-v1";
const WEBHOOK_SECRET = /^[A-Za-z0-9_-]{32,256}$/;

function sourceEnvironment(env?: PrismSignalsRuntimeEnv): PrismSignalsRuntimeEnv {
  return env ?? {
    PRISM_SIGNALS_MODE: process.env.PRISM_SIGNALS_MODE,
    PRISM_SIGNALS_TELEGRAM_BOT_USERNAME:
      process.env.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME,
    PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET:
      process.env.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET,
    PRISM_SIGNALS_TELEGRAM_BOT_POSTURE:
      process.env.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE,
  };
}

function validTelegramConfiguration(env?: PrismSignalsRuntimeEnv): {
  readonly offer: ReturnType<typeof createPrismSignalsPreviewOffer>;
  readonly secret: string;
} | null {
  const source = sourceEnvironment(env);
  const mode = source.PRISM_SIGNALS_MODE?.trim();
  const username = source.PRISM_SIGNALS_TELEGRAM_BOT_USERNAME?.trim();
  const secret = source.PRISM_SIGNALS_TELEGRAM_WEBHOOK_SECRET?.trim();
  const posture = source.PRISM_SIGNALS_TELEGRAM_BOT_POSTURE?.trim();
  if (
    mode !== PRISM_SIGNALS_FIXTURE_MODE ||
    !username ||
    !secret ||
    !WEBHOOK_SECRET.test(secret) ||
    posture !== PRISM_SIGNALS_CLEAN_BOT_POSTURE
  ) {
    return null;
  }

  try {
    return Object.freeze({
      offer: createPrismSignalsPreviewOffer({ telegram_bot_username: username }),
      secret,
    });
  } catch (error) {
    if (!isProductFlowContractError(error)) throw error;
    return null;
  }
}

/** The route consumes this value server-side; it must never enter a response. */
export function prismSignalsTelegramWebhookSecret(
  env?: PrismSignalsRuntimeEnv,
): string | null {
  return validTelegramConfiguration(env)?.secret ?? null;
}

/** Fail closed to the web-only offer when Telegram test configuration drifts. */
export function prismSignalsRuntime(
  env?: PrismSignalsRuntimeEnv,
) {
  const telegram = validTelegramConfiguration(env);
  if (!telegram) {
    const offer = createPrismSignalsPreviewOffer();
    return Object.freeze({ offer, telegram_href: null });
  }
  return Object.freeze({
    offer: telegram.offer,
    telegram_href: prismSignalsTelegramPreviewHref(telegram.offer),
  });
}
