export const PRISM_SIGNALS_PRODUCT_ID = "prism-signals" as const;
export const PRISM_SIGNALS_BETA_MODE = "closed-beta-v1" as const;
export const PRISM_SIGNALS_BETA_CONSENT_VERSION =
  "prism-signals-beta-contact-2026-09-02" as const;
export const PRISM_SIGNALS_BETA_SCHEMA =
  "cambridgetcg.prism-signals-beta-interest/1" as const;
export const PRISM_SIGNALS_BETA_RETENTION_DAYS = 180 as const;
export const PRISM_SIGNALS_BETA_BODY_MAX_BYTES = 1024 as const;

export const PRISM_SIGNALS_BETA_CHANNELS = ["web", "telegram"] as const;
export type PrismSignalsBetaChannel =
  (typeof PRISM_SIGNALS_BETA_CHANNELS)[number];

export interface PrismSignalsBetaInterestDto {
  readonly schema: typeof PRISM_SIGNALS_BETA_SCHEMA;
  readonly product_id: typeof PRISM_SIGNALS_PRODUCT_ID;
  readonly channel_preferences: readonly PrismSignalsBetaChannel[];
  readonly consent_version: typeof PRISM_SIGNALS_BETA_CONSENT_VERSION;
  readonly requested_at: string;
  readonly updated_at: string;
  readonly expires_at: string;
}

export interface PrismSignalsBetaInterestResponse {
  readonly interest: PrismSignalsBetaInterestDto | null;
}

export interface PrismSignalsBetaDeleteResponse {
  readonly deleted: boolean;
}

export interface PrismSignalsBetaInterestInput {
  readonly channel_preferences: readonly PrismSignalsBetaChannel[];
  readonly contact_consent: true;
}

export type PrismSignalsBetaApiErrorCode =
  | "authentication_required"
  | "beta_unavailable"
  | "invalid_origin"
  | "invalid_request";

export interface PrismSignalsBetaApiErrorResponse {
  readonly error: {
    readonly code: PrismSignalsBetaApiErrorCode;
    readonly message: string;
  };
}

export class PrismSignalsBetaRequestError extends Error {
  readonly code: "invalid_origin" | "invalid_request";
  readonly status: 400 | 403 | 413;

  constructor(
    code: "invalid_origin" | "invalid_request",
    message: string,
    status: 400 | 403 | 413 = code === "invalid_origin" ? 403 : 400,
  ) {
    super(message);
    this.name = "PrismSignalsBetaRequestError";
    this.code = code;
    this.status = status;
  }
}

function exactObject(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "Expected one JSON object.",
    );
  }
  return value as Record<string, unknown>;
}

export function parsePrismSignalsBetaInterestInput(
  value: unknown,
): PrismSignalsBetaInterestInput {
  const record = exactObject(value);
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "channel_preferences" ||
    keys[1] !== "contact_consent"
  ) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "Use only channel_preferences and contact_consent.",
    );
  }

  if (record.contact_consent !== true) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "The specific PRISM beta contact request must be affirmed.",
    );
  }

  const channels = record.channel_preferences;
  if (
    !Array.isArray(channels) ||
    Object.getPrototypeOf(channels) !== Array.prototype ||
    channels.length < 1 ||
    channels.length > PRISM_SIGNALS_BETA_CHANNELS.length
  ) {
    throw new PrismSignalsBetaRequestError(
      "invalid_request",
      "Choose one or two supported channel preferences.",
    );
  }

  const chosen = new Set<PrismSignalsBetaChannel>();
  for (const channel of channels) {
    if (channel !== "web" && channel !== "telegram") {
      throw new PrismSignalsBetaRequestError(
        "invalid_request",
        "Channel preferences may contain only web or telegram.",
      );
    }
    if (chosen.has(channel)) {
      throw new PrismSignalsBetaRequestError(
        "invalid_request",
        "Channel preferences must be unique.",
      );
    }
    chosen.add(channel);
  }

  return Object.freeze({
    channel_preferences: Object.freeze(
      PRISM_SIGNALS_BETA_CHANNELS.filter((channel) => chosen.has(channel)),
    ),
    contact_consent: true,
  });
}
