import { PRODUCT_FLOW_LIMITS } from "./constants";
import {
  ProductFlowContractError,
  type ProductFlowContractIssueCode,
  type ProductFlowContractPhase,
} from "./error";
import type { ProductFlowOpaqueRef, ProductFlowTimestamp } from "./types";

export type PlainRecord = Record<string, unknown>;

const CANONICAL_UTC =
  /^(?!0000-)[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/;
const OFFER_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PURPOSE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const OPAQUE_REF = /^pf_[A-Za-z0-9_-]{16,64}$/;
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TELEGRAM_START_PARAMETER = /^[A-Za-z0-9_-]{1,64}$/;

export function fail(
  phase: ProductFlowContractPhase,
  path: string,
  code: ProductFlowContractIssueCode,
  message: string,
): never {
  throw new ProductFlowContractError(phase, [{ path, code, message }]);
}

export function plainRecord(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(phase, path, "wrong_type", "Expected a plain JSON object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail(phase, path, "wrong_type", "Expected a plain JSON object.");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      return fail(
        phase,
        path,
        "unknown_field",
        "Symbol keys are not part of the JSON contract.",
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return fail(
        phase,
        `${path}.${key}`,
        "invalid_format",
        "Only enumerable JSON data properties are accepted.",
      );
    }
  }
  return value as PlainRecord;
}

export function exactKeys(
  record: PlainRecord,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  phase: ProductFlowContractPhase,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      fail(
        phase,
        `${path}.${key}`,
        "unknown_field",
        "Unknown fields are rejected at the public contract boundary.",
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      fail(phase, `${path}.${key}`, "required", "Required field is missing.");
    }
  }
}

export function plainArray(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    return fail(phase, path, "wrong_type", "Expected a plain JSON array.");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)) {
      return fail(
        phase,
        path,
        "unknown_field",
        "Array properties outside JSON indices are rejected.",
      );
    }
    const index = Number(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= value.length ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return fail(
        phase,
        `${path}[${key}]`,
        "invalid_format",
        "Array indices must be enumerable JSON data properties.",
      );
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return fail(
        phase,
        `${path}[${index}]`,
        "required",
        "Sparse JSON arrays are rejected.",
      );
    }
  }
  return value;
}

export function literal<T extends string>(
  value: unknown,
  expected: T,
  path: string,
  phase: ProductFlowContractPhase,
): T {
  if (value !== expected) {
    return fail(
      phase,
      path,
      typeof value === "string" ? "unsupported_value" : "wrong_type",
      `Expected the exact value ${expected}.`,
    );
  }
  return expected;
}

export function enumValue<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  path: string,
  phase: ProductFlowContractPhase,
): Values[number] {
  if (typeof value !== "string") {
    return fail(
      phase,
      path,
      "wrong_type",
      "Expected a supported string value.",
    );
  }
  if (!(allowed as readonly string[]).includes(value)) {
    return fail(
      phase,
      path,
      "unsupported_value",
      "Value is not supported by product-flow/v1.",
    );
  }
  return value as Values[number];
}

export function booleanValue(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): boolean {
  if (typeof value !== "boolean") {
    return fail(phase, path, "wrong_type", "Expected a JSON boolean.");
  }
  return value;
}

export function positiveVersion(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    return fail(
      phase,
      path,
      typeof value === "number" ? "out_of_range" : "wrong_type",
      "Version must be a positive 32-bit safe integer.",
    );
  }
  return value;
}

export function boundedText(
  value: unknown,
  maximum: number,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  if (typeof value !== "string") {
    return fail(phase, path, "wrong_type", "Expected a JSON string.");
  }
  if (
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Text must be non-empty, trimmed, bounded, and contain no controls.",
    );
  }
  return value;
}

export function offerId(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  const parsed = boundedText(
    value,
    PRODUCT_FLOW_LIMITS.offer_id_chars,
    path,
    phase,
  );
  if (!OFFER_ID.test(parsed)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Offer id must be a lowercase safe identifier.",
    );
  }
  return parsed;
}

export function rightsPurpose(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  const parsed = boundedText(
    value,
    PRODUCT_FLOW_LIMITS.purpose_chars,
    path,
    phase,
  );
  if (!PURPOSE.test(parsed)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Rights purpose must be a lowercase safe identifier.",
    );
  }
  return parsed;
}

export function opaqueRef(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): ProductFlowOpaqueRef {
  if (typeof value !== "string") {
    return fail(phase, path, "wrong_type", "Expected an opaque reference.");
  }
  if (!OPAQUE_REF.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Reference must use pf_ plus 16-64 URL-safe opaque characters.",
    );
  }
  return value as ProductFlowOpaqueRef;
}

export function canonicalTimestamp(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): ProductFlowTimestamp {
  if (typeof value !== "string") {
    return fail(
      phase,
      path,
      "wrong_type",
      "Expected a canonical UTC timestamp string.",
    );
  }
  if (!CANONICAL_UTC.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Timestamp must be UTC with exactly millisecond precision.",
    );
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Timestamp is not a real instant.",
    );
  }
  return value;
}

export function timestampMs(value: ProductFlowTimestamp): number {
  return Date.parse(value);
}

export function safeLink(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  const parsed = boundedText(
    value,
    PRODUCT_FLOW_LIMITS.link_chars,
    path,
    phase,
  );
  if (/\s|\\/.test(parsed)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Link must not contain whitespace or backslashes.",
    );
  }
  if (parsed.startsWith("/") && !parsed.startsWith("//")) return parsed;
  try {
    const url = new URL(parsed);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hostname === ""
    ) {
      throw new Error("unsafe");
    }
  } catch {
    return fail(
      phase,
      path,
      "invalid_format",
      "Link must be root-relative or an HTTPS URL without credentials.",
    );
  }
  return parsed;
}

export function telegramBotUsername(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  if (
    typeof value !== "string" ||
    !TELEGRAM_USERNAME.test(value) ||
    !value.toLowerCase().endsWith("bot")
  ) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Bot username must be 5-32 Latin letters, digits, or underscores, begin with a letter, end in bot, and omit @.",
    );
  }
  return value;
}

export function telegramStartParameter(
  value: unknown,
  path: string,
  phase: ProductFlowContractPhase,
): string {
  if (typeof value !== "string" || !TELEGRAM_START_PARAMETER.test(value)) {
    return fail(
      phase,
      path,
      "invalid_format",
      "Start parameter must contain 1-64 base64url characters.",
    );
  }
  return value;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
