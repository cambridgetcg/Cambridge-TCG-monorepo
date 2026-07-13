import { normalizeSku } from "@cambridge-tcg/sku";
import { parseCurrency } from "@/lib/fx/rates";
import {
  OBSERVATION_CONDITIONS,
  OBSERVATION_KINDS,
  OBSERVATION_SHARING_MODES,
  type CreateCollectorObservationInput,
  type ObservationCondition,
  type ObservationKind,
  type ObservationSharingMode,
  type PatchCollectorObservationInput,
  type ValidationResult,
} from "./types";

const CREATE_FIELDS = new Set([
  "submission_key",
  "sku",
  "observation_kind",
  "condition",
  "price_amount",
  "price_currency",
  "observed_on",
  "first_party_attested",
  "sharing_mode",
  "evidence_sha256",
  "cc0_acknowledged",
]);

const PATCH_FIELDS = new Set([
  "revision",
  "first_party_attested",
  "sku",
  "observation_kind",
  "condition",
  "price_amount",
  "price_currency",
  "observed_on",
  "sharing_mode",
  "evidence_sha256",
  "cc0_acknowledged",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
// NUMERIC(14,2): at most twelve integer digits and two fractional digits.
const DECIMAL = /^(?:0|[1-9][0-9]{0,11})(?:\.([0-9]{1,2}))?$/;
const LEGACY_LANGUAGE: Readonly<Record<string, string>> = {
  jp: "ja",
  cn: "zh",
  kr: "ko",
};

function fail<T>(field: string, message: string): ValidationResult<T> {
  return { ok: false, field, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields<T>(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): ValidationResult<T> | null {
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  return unknown
    ? fail(unknown, `Unknown field '${unknown}'. Receipts, URLs, notes, and identities are not accepted.`)
    : null;
}

export function canonicalizeCollectorObservationSku(raw: string): string | null {
  const normalized = normalizeSku(raw.trim());
  if (!normalized) return null;
  const parts = normalized.split("-");
  if (parts[3] && LEGACY_LANGUAGE[parts[3]]) {
    parts[3] = LEGACY_LANGUAGE[parts[3]]!;
  }
  return parts.join("-");
}

export function parseCollectorObservationSku(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || raw.length > 120) {
    return fail("sku", "sku must be a canonical Cambridge TCG SKU of at most 120 characters.");
  }
  const sku = canonicalizeCollectorObservationSku(raw);
  return sku
    ? { ok: true, value: sku }
    : fail("sku", "sku must use canonical form such as 'op-op01-001-ja'.");
}

function parseKind(raw: unknown): ValidationResult<ObservationKind> {
  return typeof raw === "string" && (OBSERVATION_KINDS as readonly string[]).includes(raw)
    ? { ok: true, value: raw as ObservationKind }
    : fail(
        "observation_kind",
        "observation_kind must be purchase, completed_sale, or asking_price.",
      );
}

function parseCondition(raw: unknown): ValidationResult<ObservationCondition | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return fail("condition", "condition must be M, NM, LP, MP, HP, DMG, or null.");
  }
  const condition = raw.trim().toUpperCase();
  return (OBSERVATION_CONDITIONS as readonly string[]).includes(condition)
    ? { ok: true, value: condition as ObservationCondition }
    : fail("condition", "condition must be M, NM, LP, MP, HP, DMG, or null.");
}

/** Parse and normalize an exact decimal without ever converting through number. */
export function parseExactPrice(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return fail("price_amount", "price_amount must be an exact decimal string, not a number.");
  }
  const match = raw.match(DECIMAL);
  if (!match) {
    return fail(
      "price_amount",
      "price_amount must be a positive decimal string with at most 12 integer and 2 fractional digits.",
    );
  }
  const [integer, fraction = ""] = raw.split(".");
  const normalized = `${integer}.${fraction.padEnd(2, "0")}`;
  const positive = integer !== "0" || /[1-9]/.test(fraction);
  return positive
    ? { ok: true, value: normalized }
    : fail("price_amount", "price_amount must be greater than zero.");
}

function parseSupportedCurrency(raw: unknown) {
  if (typeof raw !== "string") {
    return fail<NonNullable<ReturnType<typeof parseCurrency>>>(
      "price_currency",
      "price_currency must be one of GBP, USD, EUR, JPY, HKD, or CHF.",
    );
  }
  const currency = parseCurrency(raw.trim());
  return currency
    ? ({ ok: true, value: currency } as const)
    : fail<NonNullable<ReturnType<typeof parseCurrency>>>(
        "price_currency",
        "price_currency must be one of GBP, USD, EUR, JPY, HKD, or CHF.",
      );
}

function parseSharing(raw: unknown): ValidationResult<ObservationSharingMode> {
  return typeof raw === "string" &&
    (OBSERVATION_SHARING_MODES as readonly string[]).includes(raw)
    ? { ok: true, value: raw as ObservationSharingMode }
    : fail(
        "sharing_mode",
        "sharing_mode must be private, anonymous_aggregate, or cc0.",
      );
}

function parseEvidenceHash(raw: unknown): ValidationResult<string | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string" || !SHA256.test(raw)) {
    return fail("evidence_sha256", "evidence_sha256 must be 64 hexadecimal characters or null.");
  }
  return { ok: true, value: raw.toLowerCase() };
}

function isoToday(today: Date): string {
  return today.toISOString().slice(0, 10);
}

export function parseObservedOn(raw: unknown, today = new Date()): ValidationResult<string> {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return fail("observed_on", "observed_on must be a real calendar date in YYYY-MM-DD form.");
  }
  const [year, month, day] = raw.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return fail("observed_on", "observed_on must be a real calendar date in YYYY-MM-DD form.");
  }
  return raw <= isoToday(today)
    ? { ok: true, value: raw }
    : fail("observed_on", "observed_on cannot be in the future.");
}

function parseRevision(raw: unknown): ValidationResult<number> {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
    ? { ok: true, value: raw }
    : fail("revision", "revision must be a positive integer read from the current observation.");
}

function validateCc0Acknowledgement<T>(
  sharingMode: ObservationSharingMode | undefined,
  acknowledgement: unknown,
): ValidationResult<T> | null {
  if (sharingMode === "cc0" && acknowledgement !== true) {
    return fail(
      "cc0_acknowledged",
      "cc0_acknowledged must be true when sharing_mode is cc0.",
    );
  }
  if (sharingMode !== "cc0" && acknowledgement === true) {
    return fail(
      "cc0_acknowledged",
      "cc0_acknowledged is accepted only together with sharing_mode='cc0'.",
    );
  }
  return null;
}

export function parseCreateCollectorObservation(
  raw: unknown,
  today = new Date(),
): ValidationResult<CreateCollectorObservationInput> {
  if (!isRecord(raw)) return fail("body", "Request body must be a JSON object.");
  const unknown = rejectUnknownFields<CreateCollectorObservationInput>(raw, CREATE_FIELDS);
  if (unknown) return unknown;

  if (typeof raw.submission_key !== "string" || !UUID.test(raw.submission_key)) {
    return fail("submission_key", "submission_key must be a UUID generated before submission.");
  }
  if (raw.first_party_attested !== true) {
    return fail(
      "first_party_attested",
      "first_party_attested must be true: this intake accepts only your own purchase, completed sale, or asking price.",
    );
  }

  const sku = parseCollectorObservationSku(raw.sku);
  if (!sku.ok) return sku;
  const kind = parseKind(raw.observation_kind);
  if (!kind.ok) return kind;
  const condition = parseCondition(raw.condition);
  if (!condition.ok) return condition;
  const price = parseExactPrice(raw.price_amount);
  if (!price.ok) return price;
  const currency = parseSupportedCurrency(raw.price_currency);
  if (!currency.ok) return currency;
  const observedOn = parseObservedOn(raw.observed_on, today);
  if (!observedOn.ok) return observedOn;
  const sharing = raw.sharing_mode === undefined
    ? ({ ok: true, value: "private" } as const)
    : parseSharing(raw.sharing_mode);
  if (!sharing.ok) return sharing;
  const cc0 = validateCc0Acknowledgement<CreateCollectorObservationInput>(
    sharing.value,
    raw.cc0_acknowledged,
  );
  if (cc0) return cc0;
  const evidence = parseEvidenceHash(raw.evidence_sha256);
  if (!evidence.ok) return evidence;

  return {
    ok: true,
    value: {
      submission_key: raw.submission_key.toLowerCase(),
      sku: sku.value,
      observation_kind: kind.value,
      condition: condition.value,
      price_amount: price.value,
      price_currency: currency.value,
      observed_on: observedOn.value,
      first_party_attested: true,
      sharing_mode: sharing.value,
      evidence_sha256: evidence.value,
      cc0_acknowledged: sharing.value === "cc0",
    },
  };
}

export function parsePatchCollectorObservation(
  raw: unknown,
  today = new Date(),
): ValidationResult<PatchCollectorObservationInput> {
  if (!isRecord(raw)) return fail("body", "Request body must be a JSON object.");
  const unknown = rejectUnknownFields<PatchCollectorObservationInput>(raw, PATCH_FIELDS);
  if (unknown) return unknown;

  const revision = parseRevision(raw.revision);
  if (!revision.ok) return revision;
  if (
    Object.prototype.hasOwnProperty.call(raw, "first_party_attested") &&
    raw.first_party_attested !== true
  ) {
    return fail(
      "first_party_attested",
      "first_party_attested may only be the unchanged value true.",
    );
  }

  const has = (field: string) => Object.prototype.hasOwnProperty.call(raw, field);
  const mutable = [
    "sku",
    "observation_kind",
    "condition",
    "price_amount",
    "price_currency",
    "observed_on",
    "sharing_mode",
    "evidence_sha256",
  ];
  if (!mutable.some(has)) return fail("body", "At least one observation field must be updated.");

  const out: PatchCollectorObservationInput = { revision: revision.value };

  if (has("sku")) {
    const value = parseCollectorObservationSku(raw.sku);
    if (!value.ok) return value;
    out.sku = value.value;
  }
  if (has("observation_kind")) {
    const value = parseKind(raw.observation_kind);
    if (!value.ok) return value;
    out.observation_kind = value.value;
  }
  if (has("condition")) {
    const value = parseCondition(raw.condition);
    if (!value.ok) return value;
    out.condition = value.value;
  }
  if (has("price_amount")) {
    const value = parseExactPrice(raw.price_amount);
    if (!value.ok) return value;
    out.price_amount = value.value;
  }
  if (has("price_currency")) {
    const value = parseSupportedCurrency(raw.price_currency);
    if (!value.ok) return value;
    out.price_currency = value.value;
  }
  if (has("observed_on")) {
    const value = parseObservedOn(raw.observed_on, today);
    if (!value.ok) return value;
    out.observed_on = value.value;
  }
  if (has("sharing_mode")) {
    const value = parseSharing(raw.sharing_mode);
    if (!value.ok) return value;
    out.sharing_mode = value.value;
  }
  const cc0 = validateCc0Acknowledgement<PatchCollectorObservationInput>(
    out.sharing_mode,
    raw.cc0_acknowledged,
  );
  if (cc0) return cc0;
  if (out.sharing_mode === "cc0") out.cc0_acknowledged = true;

  if (has("evidence_sha256")) {
    const value = parseEvidenceHash(raw.evidence_sha256);
    if (!value.ok) return value;
    out.evidence_sha256 = value.value;
  }

  return { ok: true, value: out };
}
