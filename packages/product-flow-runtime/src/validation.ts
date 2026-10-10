import {
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  createEmptyEntitlementSnapshotV1,
  parseEntitlementEventV1,
  type ProductFlowOpaqueRef,
  type ProductFlowTimestamp,
} from "@cambridge-tcg/product-flow";

import { ProductFlowRuntimeError } from "./error";

export type RuntimeRecord = Record<string, unknown>;

export function runtimeRecord(value: unknown, path: string): RuntimeRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      "Expected a plain JSON object.",
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      "Expected a plain JSON object.",
    );
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new ProductFlowRuntimeError(
        "invalid_contract",
        path,
        "Symbol keys are not accepted.",
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new ProductFlowRuntimeError(
        "invalid_contract",
        `${path}.${key}`,
        "Only enumerable JSON data properties are accepted.",
      );
    }
  }
  return value as RuntimeRecord;
}

export function runtimeExactKeys(
  record: RuntimeRecord,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      throw new ProductFlowRuntimeError(
        "invalid_contract",
        `${path}.${key}`,
        "Unknown callback or mapping field.",
      );
    }
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new ProductFlowRuntimeError(
        "invalid_contract",
        `${path}.${key}`,
        "Required callback or mapping field is missing.",
      );
    }
  }
}

export function runtimeLiteral<T extends string>(
  value: unknown,
  expected: T,
  path: string,
): T {
  if (value !== expected) {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      `Expected the exact value ${expected}.`,
    );
  }
  return expected;
}

export function runtimeEnum<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  path: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      "Expected a supported string value.",
    );
  }
  return value as Values[number];
}

export function runtimeBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      "Expected a JSON boolean.",
    );
  }
  return value;
}

export function runtimePositiveInteger(
  value: unknown,
  path: string,
  maximum = 2_147_483_647,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maximum
  ) {
    throw new ProductFlowRuntimeError(
      "invalid_contract",
      path,
      `Expected a positive integer no greater than ${maximum}.`,
    );
  }
  return value;
}

/**
 * Reuses product-flow's strict parser as the canonical validator for refs,
 * timestamps, environment, offer ids, versions, and rail/channel binding.
 */
export function validateRuntimeScope(
  record: RuntimeRecord,
  channel: "web" | "telegram",
  rail: "stripe_web" | "telegram_stars",
): {
  readonly environment: "test" | "production";
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly price_ref: ProductFlowOpaqueRef;
} {
  const seed = createEmptyEntitlementSnapshotV1({
    environment: record.environment,
    entitlement_ref: record.entitlement_ref,
    subject_ref: record.subject_ref,
    offer_id: record.offer_id,
    offer_version: record.offer_version,
  });
  const probe = parseEntitlementEventV1({
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: "pf_runtimeprobe0000",
    environment: seed.environment,
    type: "browser_return",
    occurred_at: "2000-01-01T00:00:00.000Z",
    entitlement_ref: seed.entitlement_ref,
    subject_ref: seed.subject_ref,
    offer_id: seed.offer_id,
    offer_version: seed.offer_version,
    channel,
    rail,
    price_ref: record.price_ref,
  });
  if (!("price_ref" in probe)) {
    throw new ProductFlowRuntimeError(
      "store_invariant",
      "$",
      "Scope validation did not produce a rail event.",
    );
  }
  return Object.freeze({
    environment: seed.environment,
    entitlement_ref: seed.entitlement_ref,
    subject_ref: seed.subject_ref,
    offer_id: seed.offer_id,
    offer_version: seed.offer_version,
    price_ref: probe.price_ref,
  });
}

export function validateEventIdentity(record: RuntimeRecord): Readonly<{
  event_id: ProductFlowOpaqueRef;
  occurred_at: ProductFlowTimestamp;
}> {
  // A non-authoritative event validates the two callback fields without
  // manufacturing provider evidence.
  const event = parseEntitlementEventV1({
    schema: PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
    event_id: record.event_id,
    environment: "test",
    type: "channel_linked",
    occurred_at: record.occurred_at,
    entitlement_ref: "pf_runtimeentitle00",
    subject_ref: "pf_runtimesubject00",
    offer_id: "runtime-probe",
    offer_version: 1,
    channel: "web",
  });
  return Object.freeze({
    event_id: event.event_id,
    occurred_at: event.occurred_at,
  });
}
