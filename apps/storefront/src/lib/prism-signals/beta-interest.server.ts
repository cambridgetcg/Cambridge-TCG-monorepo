import "server-only";
import { query } from "@/lib/db";
import {
  PRISM_SIGNALS_BETA_CHANNELS,
  PRISM_SIGNALS_BETA_CONSENT_VERSION,
  PRISM_SIGNALS_BETA_RETENTION_DAYS,
  PRISM_SIGNALS_BETA_SCHEMA,
  PRISM_SIGNALS_PRODUCT_ID,
  parsePrismSignalsBetaInterestInput,
  type PrismSignalsBetaChannel,
  type PrismSignalsBetaInterestDto,
  type PrismSignalsBetaInterestInput,
} from "./beta-interest";
import { prismSignalsBetaIntakeEnabled } from "./beta-interest-config.server";

export { prismSignalsBetaIntakeEnabled } from "./beta-interest-config.server";

interface BetaInterestRow {
  product_id: string;
  channel_preferences: unknown;
  consent_version: string;
  requested_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
}

function assertPrismSignalsBetaIntakeEnabled(): void {
  if (!prismSignalsBetaIntakeEnabled()) {
    throw new Error("PRISM Signals beta intake is not enabled.");
  }
}

function isoTimestamp(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new Error(`Invalid ${field} returned by PRISM beta storage.`);
  }
  return date.toISOString();
}

function betaInterestDto(row: BetaInterestRow): PrismSignalsBetaInterestDto {
  if (
    row.product_id !== PRISM_SIGNALS_PRODUCT_ID ||
    row.consent_version !== PRISM_SIGNALS_BETA_CONSENT_VERSION ||
    !Array.isArray(row.channel_preferences)
  ) {
    throw new Error("PRISM beta storage returned an invalid row.");
  }

  const channels = row.channel_preferences;
  if (
    channels.length < 1 ||
    channels.length > PRISM_SIGNALS_BETA_CHANNELS.length ||
    channels.some((channel) => channel !== "web" && channel !== "telegram") ||
    new Set(channels).size !== channels.length
  ) {
    throw new Error("PRISM beta storage returned invalid channel preferences.");
  }
  const canonicalChannels = PRISM_SIGNALS_BETA_CHANNELS.filter((channel) =>
    channels.includes(channel),
  ) as readonly PrismSignalsBetaChannel[];

  return Object.freeze({
    schema: PRISM_SIGNALS_BETA_SCHEMA,
    product_id: PRISM_SIGNALS_PRODUCT_ID,
    channel_preferences: Object.freeze([...canonicalChannels]),
    consent_version: PRISM_SIGNALS_BETA_CONSENT_VERSION,
    requested_at: isoTimestamp(row.requested_at, "requested_at"),
    updated_at: isoTimestamp(row.updated_at, "updated_at"),
    expires_at: isoTimestamp(row.expires_at, "expires_at"),
  });
}

const PURGE_INACTIVE = `
  DELETE FROM product_beta_interests
   WHERE product_id = $1
     AND (expires_at <= NOW() OR consent_version <> $2)
`;

export async function purgeInactiveProductBetaInterests(): Promise<number> {
  const result = await query(PURGE_INACTIVE, [
    PRISM_SIGNALS_PRODUCT_ID,
    PRISM_SIGNALS_BETA_CONSENT_VERSION,
  ]);
  return result.rowCount ?? 0;
}

export async function getPrismSignalsBetaInterest(
  userId: string,
): Promise<PrismSignalsBetaInterestDto | null> {
  const result = await query(
    `SELECT product_id, channel_preferences, consent_version,
            requested_at, updated_at, expires_at
       FROM product_beta_interests
      WHERE user_id = $1
        AND product_id = $2
        AND consent_version = $3
        AND expires_at > NOW()`,
    [
      userId,
      PRISM_SIGNALS_PRODUCT_ID,
      PRISM_SIGNALS_BETA_CONSENT_VERSION,
    ],
  );
  const row = result.rows[0] as BetaInterestRow | undefined;
  return row ? betaInterestDto(row) : null;
}

export async function upsertPrismSignalsBetaInterest(
  userId: string,
  input: PrismSignalsBetaInterestInput,
): Promise<PrismSignalsBetaInterestDto> {
  assertPrismSignalsBetaIntakeEnabled();
  // Re-parse at the DAL boundary so every caller stores the canonical
  // web-then-Telegram order, not merely the HTTP route.
  const canonical = parsePrismSignalsBetaInterestInput(input);
  const result = await query(
    `INSERT INTO product_beta_interests (
       user_id,
       product_id,
       channel_preferences,
       consent_version,
       requested_at,
       updated_at,
       expires_at
     ) VALUES (
       $1,
       $2,
       $3::TEXT[],
       $4,
       NOW(),
       NOW(),
       NOW() + ($5 * INTERVAL '1 day')
     )
     ON CONFLICT (user_id, product_id) DO UPDATE SET
       channel_preferences = EXCLUDED.channel_preferences,
       consent_version = EXCLUDED.consent_version,
       requested_at = CASE
         WHEN product_beta_interests.expires_at <= NOW()
           OR product_beta_interests.consent_version <> EXCLUDED.consent_version
         THEN NOW()
         ELSE product_beta_interests.requested_at
       END,
       updated_at = NOW(),
       expires_at = NOW() + ($5 * INTERVAL '1 day')
     RETURNING product_id, channel_preferences, consent_version,
               requested_at, updated_at, expires_at`,
    [
      userId,
      PRISM_SIGNALS_PRODUCT_ID,
      [...canonical.channel_preferences],
      PRISM_SIGNALS_BETA_CONSENT_VERSION,
      PRISM_SIGNALS_BETA_RETENTION_DAYS,
    ],
  );
  const row = result.rows[0] as BetaInterestRow | undefined;
  if (!row) throw new Error("PRISM beta storage did not return the saved row.");
  return betaInterestDto(row);
}

export async function deletePrismSignalsBetaInterest(
  userId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM product_beta_interests
      WHERE user_id = $1 AND product_id = $2`,
    [userId, PRISM_SIGNALS_PRODUCT_ID],
  );
  return (result.rowCount ?? 0) > 0;
}
