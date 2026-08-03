export const CASHLOOM_HANDOFF_MODE = "offline_bundle" as const;
export const CASHLOOM_IDENTITY_ASSURANCE = "user-declared-key-pin" as const;
export const CASHLOOM_DISCLOSURE_NOTICE_VERSION =
  "cashloom-key-linkability-v1" as const;

export const CASHLOOM_MERCHANT_KEY_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface CashloomSettlementProfileDto {
  merchant_key_id: string;
  enabled: boolean;
  handoff_mode: typeof CASHLOOM_HANDOFF_MODE;
  identity_assurance: typeof CASHLOOM_IDENTITY_ASSURANCE;
  disclosure_notice_version: typeof CASHLOOM_DISCLOSURE_NOTICE_VERSION;
  disclosure_acknowledged_at: string;
  created_at: string;
  updated_at: string;
}

export interface CashloomProfileWrite {
  merchant_key_id: string;
  enabled: boolean;
  handoff_mode: typeof CASHLOOM_HANDOFF_MODE;
  disclosure_notice_version: typeof CASHLOOM_DISCLOSURE_NOTICE_VERSION;
  disclosure_acknowledged: true;
}

export type CashloomValidation<T> =
  | { ok: true; value: T }
  | { ok: false; field: string; message: string };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): CashloomValidation<true> {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    return {
      ok: false,
      field: "body",
      message: `Request body must contain exactly: ${expected.join(", ")}.`,
    };
  }
  return { ok: true, value: true };
}

const PROFILE_WRITE_KEYS = [
  "merchant_key_id",
  "enabled",
  "handoff_mode",
  "disclosure_notice_version",
  "disclosure_acknowledged",
] as const;

export function parseCashloomProfileWrite(
  value: unknown,
): CashloomValidation<CashloomProfileWrite> {
  if (!isJsonObject(value)) {
    return { ok: false, field: "body", message: "Request body must be a JSON object." };
  }

  const keys = exactKeys(value, PROFILE_WRITE_KEYS);
  if (!keys.ok) return keys;

  if (
    typeof value.merchant_key_id !== "string"
    || !CASHLOOM_MERCHANT_KEY_ID_PATTERN.test(value.merchant_key_id)
  ) {
    return {
      ok: false,
      field: "merchant_key_id",
      message: "merchant_key_id must be lowercase sha256:<64 hex>.",
    };
  }
  if (typeof value.enabled !== "boolean") {
    return { ok: false, field: "enabled", message: "enabled must be a boolean." };
  }
  if (value.handoff_mode !== CASHLOOM_HANDOFF_MODE) {
    return {
      ok: false,
      field: "handoff_mode",
      message: `handoff_mode must be '${CASHLOOM_HANDOFF_MODE}'.`,
    };
  }
  if (value.disclosure_notice_version !== CASHLOOM_DISCLOSURE_NOTICE_VERSION) {
    return {
      ok: false,
      field: "disclosure_notice_version",
      message: `disclosure_notice_version must be '${CASHLOOM_DISCLOSURE_NOTICE_VERSION}'.`,
    };
  }
  if (value.disclosure_acknowledged !== true) {
    return {
      ok: false,
      field: "disclosure_acknowledged",
      message: "The current key-linkability disclosure must be acknowledged on every save.",
    };
  }

  return {
    ok: true,
    value: {
      merchant_key_id: value.merchant_key_id,
      enabled: value.enabled,
      handoff_mode: CASHLOOM_HANDOFF_MODE,
      disclosure_notice_version: CASHLOOM_DISCLOSURE_NOTICE_VERSION,
      disclosure_acknowledged: true,
    },
  };
}

export function parseCashloomPrepareAction(
  value: unknown,
): CashloomValidation<{ action: "prepare" }> {
  if (!isJsonObject(value)) {
    return { ok: false, field: "body", message: "Request body must be a JSON object." };
  }
  const keys = exactKeys(value, ["action"]);
  if (!keys.ok) return keys;
  if (value.action !== "prepare") {
    return { ok: false, field: "action", message: "action must be 'prepare'." };
  }
  return { ok: true, value: { action: "prepare" } };
}

export function parseCashloomTradeId(value: string): CashloomValidation<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { ok: false, field: "id", message: "Trade id must be a UUID." };
  }
  return { ok: true, value: value.toLowerCase() };
}
