import { telegramBotUsername, telegramStartParameter } from "./validation";

/**
 * Constructs a bot start link only. It performs no network request and accepts
 * neither a Bot API token nor a webhook secret.
 */
export function buildTelegramDeepLinkV1(
  botUsernameValue: unknown,
  startParameterValue: unknown,
): string {
  const username = telegramBotUsername(
    botUsernameValue,
    "$.bot_username",
    "telegram_deep_link",
  );
  const parameter = telegramStartParameter(
    startParameterValue,
    "$.start_parameter",
    "telegram_deep_link",
  );
  return `https://t.me/${username}?start=${parameter}`;
}
