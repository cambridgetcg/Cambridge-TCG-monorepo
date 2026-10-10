import {
  PRODUCT_DELIVERY_CHANNELS,
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  PRODUCT_ENTITLEMENT_EVENT_TYPES,
  PRODUCT_ENTITLEMENT_REASONS,
  PRODUCT_ENTITLEMENT_SCHEMA,
  PRODUCT_ENTITLEMENT_STATUSES,
  PRODUCT_ENVIRONMENTS,
  PRODUCT_FLOW_LIMITS,
  PRODUCT_PAYMENT_EVIDENCE_SOURCES,
  PRODUCT_PAYMENT_RAILS,
  PRODUCT_RAIL_CHANNELS,
} from "./constants";
import type { ProductFlowContractPhase } from "./error";
import type {
  EmptyEntitlementSnapshotInputV1,
  EntitlementEventV1,
  EntitlementSnapshotV1,
  ProductDeliveryChannel,
  ProductEnvironment,
  ProductFlowOpaqueRef,
  ProductFlowTimestamp,
  ProductPaymentEvidenceV1,
  ProductPaymentFailureEvidenceV1,
  ProductPaymentRail,
  ProductPaymentReversalEvidenceV1,
  ProductProviderStatusEvidenceV1,
} from "./types";
import {
  booleanValue,
  canonicalTimestamp,
  deepFreeze,
  enumValue,
  exactKeys,
  fail,
  literal,
  offerId,
  opaqueRef,
  plainArray,
  plainRecord,
  positiveVersion,
  timestampMs,
  type PlainRecord,
} from "./validation";

const EVENT_PHASE: ProductFlowContractPhase = "entitlement_event";
const SNAPSHOT_PHASE: ProductFlowContractPhase = "entitlement_snapshot";
const SEED_PHASE: ProductFlowContractPhase = "snapshot_seed";

const EVENT_BASE_KEYS = [
  "schema",
  "event_id",
  "environment",
  "type",
  "occurred_at",
  "entitlement_ref",
  "subject_ref",
  "offer_id",
  "offer_version",
] as const;

interface ParsedEventBase {
  readonly schema: typeof PRODUCT_ENTITLEMENT_EVENT_SCHEMA;
  readonly event_id: ProductFlowOpaqueRef;
  readonly environment: ProductEnvironment;
  readonly occurred_at: ProductFlowTimestamp;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
}

interface ParsedRailAttempt {
  readonly channel: ProductDeliveryChannel;
  readonly rail: ProductPaymentRail;
  readonly price_ref: ProductFlowOpaqueRef;
}

function parseEventBase(record: PlainRecord): ParsedEventBase {
  return {
    schema: literal(
      record.schema,
      PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
      "$.schema",
      EVENT_PHASE,
    ),
    event_id: opaqueRef(record.event_id, "$.event_id", EVENT_PHASE),
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      "$.environment",
      EVENT_PHASE,
    ),
    occurred_at: canonicalTimestamp(
      record.occurred_at,
      "$.occurred_at",
      EVENT_PHASE,
    ),
    entitlement_ref: opaqueRef(
      record.entitlement_ref,
      "$.entitlement_ref",
      EVENT_PHASE,
    ),
    subject_ref: opaqueRef(record.subject_ref, "$.subject_ref", EVENT_PHASE),
    offer_id: offerId(record.offer_id, "$.offer_id", EVENT_PHASE),
    offer_version: positiveVersion(
      record.offer_version,
      "$.offer_version",
      EVENT_PHASE,
    ),
  };
}

function parseRailAttempt(record: PlainRecord, path = "$"): ParsedRailAttempt {
  const rail = enumValue(
    record.rail,
    PRODUCT_PAYMENT_RAILS,
    `${path}.rail`,
    EVENT_PHASE,
  );
  const channel = enumValue(
    record.channel,
    PRODUCT_DELIVERY_CHANNELS,
    `${path}.channel`,
    EVENT_PHASE,
  );
  if (PRODUCT_RAIL_CHANNELS[rail] !== channel) {
    fail(
      EVENT_PHASE,
      `${path}.channel`,
      "cross_contract_mismatch",
      "Payment rail is not valid for this channel.",
    );
  }
  return {
    channel,
    rail,
    price_ref: opaqueRef(record.price_ref, `${path}.price_ref`, EVENT_PHASE),
  };
}

type EvidenceKind =
  | "provider_confirmation"
  | "provider_failure"
  | "provider_reversal";

interface ParsedBoundEvidence {
  readonly kind: EvidenceKind;
  readonly source: ProductPaymentEvidenceV1["source"];
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly channel: ProductDeliveryChannel;
  readonly rail: ProductPaymentRail;
  readonly price_ref: ProductFlowOpaqueRef;
  readonly provider_event_ref: ProductFlowOpaqueRef;
  readonly payment_ref: ProductFlowOpaqueRef;
  readonly evidence_at: ProductFlowTimestamp;
  readonly active_until: ProductFlowTimestamp | null;
}

function parseBoundEvidence(
  value: unknown,
  kind: EvidenceKind,
  timeKey: "confirmed_at" | "failed_at",
  path: string,
): ParsedBoundEvidence {
  const record = plainRecord(value, path, EVENT_PHASE);
  const keys = [
    "kind",
    "source",
    "environment",
    "entitlement_ref",
    "subject_ref",
    "offer_id",
    "offer_version",
    "channel",
    "rail",
    "price_ref",
    "provider_event_ref",
    "payment_ref",
    timeKey,
  ];
  if (kind === "provider_confirmation") keys.push("active_until");
  exactKeys(record, keys, keys, path, EVENT_PHASE);
  const attempt = parseRailAttempt(record, path);
  return {
    kind: literal(record.kind, kind, `${path}.kind`, EVENT_PHASE),
    source: enumValue(
      record.source,
      PRODUCT_PAYMENT_EVIDENCE_SOURCES,
      `${path}.source`,
      EVENT_PHASE,
    ),
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      `${path}.environment`,
      EVENT_PHASE,
    ),
    entitlement_ref: opaqueRef(
      record.entitlement_ref,
      `${path}.entitlement_ref`,
      EVENT_PHASE,
    ),
    subject_ref: opaqueRef(
      record.subject_ref,
      `${path}.subject_ref`,
      EVENT_PHASE,
    ),
    offer_id: offerId(record.offer_id, `${path}.offer_id`, EVENT_PHASE),
    offer_version: positiveVersion(
      record.offer_version,
      `${path}.offer_version`,
      EVENT_PHASE,
    ),
    ...attempt,
    provider_event_ref: opaqueRef(
      record.provider_event_ref,
      `${path}.provider_event_ref`,
      EVENT_PHASE,
    ),
    payment_ref: opaqueRef(
      record.payment_ref,
      `${path}.payment_ref`,
      EVENT_PHASE,
    ),
    evidence_at: canonicalTimestamp(
      record[timeKey],
      `${path}.${timeKey}`,
      EVENT_PHASE,
    ),
    active_until:
      kind === "provider_confirmation"
        ? canonicalTimestamp(
            record.active_until,
            `${path}.active_until`,
            EVENT_PHASE,
          )
        : null,
  };
}

function assertEvidenceBinding(
  event: ParsedEventBase & ParsedRailAttempt,
  evidence: Pick<
    ParsedBoundEvidence,
    | "environment"
    | "entitlement_ref"
    | "subject_ref"
    | "offer_id"
    | "offer_version"
    | "channel"
    | "rail"
    | "price_ref"
    | "evidence_at"
  >,
): void {
  if (
    evidence.environment !== event.environment ||
    evidence.entitlement_ref !== event.entitlement_ref ||
    evidence.subject_ref !== event.subject_ref ||
    evidence.offer_id !== event.offer_id ||
    evidence.offer_version !== event.offer_version ||
    evidence.channel !== event.channel ||
    evidence.rail !== event.rail ||
    evidence.price_ref !== event.price_ref
  ) {
    fail(
      EVENT_PHASE,
      "$.evidence",
      "cross_contract_mismatch",
      "Provider evidence must bind the event entitlement, offer version, environment, channel, rail, and price reference.",
    );
  }
  if (timestampMs(evidence.evidence_at) > timestampMs(event.occurred_at)) {
    fail(
      EVENT_PHASE,
      "$.evidence",
      "invalid_order",
      "Provider evidence cannot be confirmed after its lifecycle event.",
    );
  }
}

function confirmationEvidence(
  parsed: ParsedBoundEvidence,
): ProductPaymentEvidenceV1 {
  return {
    kind: "provider_confirmation",
    source: parsed.source,
    environment: parsed.environment,
    entitlement_ref: parsed.entitlement_ref,
    subject_ref: parsed.subject_ref,
    offer_id: parsed.offer_id,
    offer_version: parsed.offer_version,
    channel: parsed.channel,
    rail: parsed.rail,
    price_ref: parsed.price_ref,
    provider_event_ref: parsed.provider_event_ref,
    payment_ref: parsed.payment_ref,
    confirmed_at: parsed.evidence_at,
    active_until: parsed.active_until as ProductFlowTimestamp,
  };
}

function failureEvidence(
  parsed: ParsedBoundEvidence,
): ProductPaymentFailureEvidenceV1 {
  return {
    kind: "provider_failure",
    source: parsed.source,
    environment: parsed.environment,
    entitlement_ref: parsed.entitlement_ref,
    subject_ref: parsed.subject_ref,
    offer_id: parsed.offer_id,
    offer_version: parsed.offer_version,
    channel: parsed.channel,
    rail: parsed.rail,
    price_ref: parsed.price_ref,
    provider_event_ref: parsed.provider_event_ref,
    payment_ref: parsed.payment_ref,
    failed_at: parsed.evidence_at,
  };
}

function reversalEvidence(
  parsed: ParsedBoundEvidence,
): ProductPaymentReversalEvidenceV1 {
  return {
    kind: "provider_reversal",
    source: parsed.source,
    environment: parsed.environment,
    entitlement_ref: parsed.entitlement_ref,
    subject_ref: parsed.subject_ref,
    offer_id: parsed.offer_id,
    offer_version: parsed.offer_version,
    channel: parsed.channel,
    rail: parsed.rail,
    price_ref: parsed.price_ref,
    provider_event_ref: parsed.provider_event_ref,
    payment_ref: parsed.payment_ref,
    confirmed_at: parsed.evidence_at,
  };
}

function parseProviderStatusEvidence(
  value: unknown,
  path: string,
): ProductProviderStatusEvidenceV1 {
  const record = plainRecord(value, path, EVENT_PHASE);
  const keys = [
    "kind",
    "source",
    "environment",
    "entitlement_ref",
    "subject_ref",
    "offer_id",
    "offer_version",
    "channel",
    "rail",
    "price_ref",
    "provider_event_ref",
    "payment_or_subscription_ref",
    "status_at",
  ];
  exactKeys(record, keys, keys, path, EVENT_PHASE);
  const attempt = parseRailAttempt(record, path);
  return {
    kind: literal(record.kind, "provider_status", `${path}.kind`, EVENT_PHASE),
    source: enumValue(
      record.source,
      PRODUCT_PAYMENT_EVIDENCE_SOURCES,
      `${path}.source`,
      EVENT_PHASE,
    ),
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      `${path}.environment`,
      EVENT_PHASE,
    ),
    entitlement_ref: opaqueRef(
      record.entitlement_ref,
      `${path}.entitlement_ref`,
      EVENT_PHASE,
    ),
    subject_ref: opaqueRef(
      record.subject_ref,
      `${path}.subject_ref`,
      EVENT_PHASE,
    ),
    offer_id: offerId(record.offer_id, `${path}.offer_id`, EVENT_PHASE),
    offer_version: positiveVersion(
      record.offer_version,
      `${path}.offer_version`,
      EVENT_PHASE,
    ),
    ...attempt,
    provider_event_ref: opaqueRef(
      record.provider_event_ref,
      `${path}.provider_event_ref`,
      EVENT_PHASE,
    ),
    payment_or_subscription_ref: opaqueRef(
      record.payment_or_subscription_ref,
      `${path}.payment_or_subscription_ref`,
      EVENT_PHASE,
    ),
    status_at: canonicalTimestamp(
      record.status_at,
      `${path}.status_at`,
      EVENT_PHASE,
    ),
  };
}

export function parseEntitlementEventV1(value: unknown): EntitlementEventV1 {
  const record = plainRecord(value, "$", EVENT_PHASE);
  const type = enumValue(
    record.type,
    PRODUCT_ENTITLEMENT_EVENT_TYPES,
    "$.type",
    EVENT_PHASE,
  );
  const base = parseEventBase(record);

  if (type === "checkout_started" || type === "browser_return") {
    const keys = [...EVENT_BASE_KEYS, "channel", "rail", "price_ref"];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    return deepFreeze({ ...base, type, ...parseRailAttempt(record) });
  }

  if (type === "precheckout_approved") {
    const keys = [...EVENT_BASE_KEYS, "channel", "rail", "price_ref"];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    const attempt = parseRailAttempt(record);
    if (attempt.channel !== "telegram" || attempt.rail !== "telegram_stars") {
      return fail(
        EVENT_PHASE,
        "$.rail",
        "cross_contract_mismatch",
        "Telegram pre-checkout is valid only for the Telegram Stars rail.",
      );
    }
    return deepFreeze({
      ...base,
      type,
      channel: "telegram",
      rail: "telegram_stars",
      price_ref: attempt.price_ref,
    });
  }

  if (type === "channel_linked") {
    const keys = [...EVENT_BASE_KEYS, "channel"];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    return deepFreeze({
      ...base,
      type,
      channel: enumValue(
        record.channel,
        PRODUCT_DELIVERY_CHANNELS,
        "$.channel",
        EVENT_PHASE,
      ),
    });
  }

  if (type === "payment_confirmed" || type === "renewal_confirmed") {
    const keys = [
      ...EVENT_BASE_KEYS,
      "channel",
      "rail",
      "price_ref",
      "active_until",
      "evidence",
    ];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    const attempt = parseRailAttempt(record);
    const event = { ...base, ...attempt };
    const evidence = parseBoundEvidence(
      record.evidence,
      "provider_confirmation",
      "confirmed_at",
      "$.evidence",
    );
    assertEvidenceBinding(event, evidence);
    const activeUntil = canonicalTimestamp(
      record.active_until,
      "$.active_until",
      EVENT_PHASE,
    );
    if (evidence.active_until !== activeUntil) {
      return fail(
        EVENT_PHASE,
        "$.evidence.active_until",
        "cross_contract_mismatch",
        "Provider confirmation must bind the exact entitlement end timestamp.",
      );
    }
    if (timestampMs(activeUntil) <= timestampMs(base.occurred_at)) {
      return fail(
        EVENT_PHASE,
        "$.active_until",
        "invalid_order",
        "Active-until must be later than the confirmation event.",
      );
    }
    return deepFreeze({
      ...event,
      type,
      active_until: activeUntil,
      evidence: confirmationEvidence(evidence),
    });
  }

  if (type === "payment_failed") {
    const keys = [
      ...EVENT_BASE_KEYS,
      "channel",
      "rail",
      "price_ref",
      "evidence",
    ];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    const attempt = parseRailAttempt(record);
    const event = { ...base, ...attempt };
    const evidence = parseBoundEvidence(
      record.evidence,
      "provider_failure",
      "failed_at",
      "$.evidence",
    );
    assertEvidenceBinding(event, evidence);
    return deepFreeze({
      ...event,
      type,
      evidence: failureEvidence(evidence),
    });
  }

  if (type === "refunded") {
    const keys = [
      ...EVENT_BASE_KEYS,
      "channel",
      "rail",
      "price_ref",
      "evidence",
    ];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    const attempt = parseRailAttempt(record);
    const event = { ...base, ...attempt };
    const evidence = parseBoundEvidence(
      record.evidence,
      "provider_reversal",
      "confirmed_at",
      "$.evidence",
    );
    assertEvidenceBinding(event, evidence);
    return deepFreeze({
      ...event,
      type,
      evidence: reversalEvidence(evidence),
    });
  }

  if (
    type === "cancel_at_period_end" ||
    type === "subscription_resumed" ||
    type === "subscription_ended"
  ) {
    const keys = [
      ...EVENT_BASE_KEYS,
      "channel",
      "rail",
      "price_ref",
      "evidence",
    ];
    exactKeys(record, keys, keys, "$", EVENT_PHASE);
    const attempt = parseRailAttempt(record);
    const event = { ...base, ...attempt };
    const evidence = parseProviderStatusEvidence(record.evidence, "$.evidence");
    assertEvidenceBinding(event, {
      ...evidence,
      evidence_at: evidence.status_at,
    });
    return deepFreeze({ ...event, type, evidence });
  }

  const keys = [...EVENT_BASE_KEYS];
  exactKeys(record, keys, keys, "$", EVENT_PHASE);
  return deepFreeze({ ...base, type });
}

function nullable<T>(value: unknown, parser: (value: unknown) => T): T | null {
  return value === null ? null : parser(value);
}

function parseReferenceHistory(
  value: unknown,
  path: string,
): readonly ProductFlowOpaqueRef[] {
  const input = plainArray(value, path, SNAPSHOT_PHASE);
  if (input.length > PRODUCT_FLOW_LIMITS.processed_event_ids) {
    fail(
      SNAPSHOT_PHASE,
      path,
      "out_of_range",
      "Reference history exceeds the v1 bound.",
    );
  }
  const references = input.map((entry, index) =>
    opaqueRef(entry, `${path}[${index}]`, SNAPSHOT_PHASE),
  );
  if (new Set(references).size !== references.length) {
    fail(
      SNAPSHOT_PHASE,
      path,
      "duplicate_value",
      "Reference history values must be unique.",
    );
  }
  return references;
}

export function parseEntitlementSnapshotV1(
  value: unknown,
): EntitlementSnapshotV1 {
  const record = plainRecord(value, "$", SNAPSHOT_PHASE);
  const keys = [
    "schema",
    "environment",
    "entitlement_ref",
    "subject_ref",
    "offer_id",
    "offer_version",
    "status",
    "reason",
    "channel",
    "rail",
    "price_ref",
    "active_from",
    "active_until",
    "cancel_at_period_end",
    "last_event_at",
    "last_event_id",
    "processed_event_ids",
    "processed_provider_event_refs",
    "confirmed_payment_refs",
  ] as const;
  exactKeys(record, keys, keys, "$", SNAPSHOT_PHASE);

  const status = enumValue(
    record.status,
    PRODUCT_ENTITLEMENT_STATUSES,
    "$.status",
    SNAPSHOT_PHASE,
  );
  const reason = enumValue(
    record.reason,
    PRODUCT_ENTITLEMENT_REASONS,
    "$.reason",
    SNAPSHOT_PHASE,
  );
  const channel = nullable(record.channel, (entry) =>
    enumValue(entry, PRODUCT_DELIVERY_CHANNELS, "$.channel", SNAPSHOT_PHASE),
  );
  const rail = nullable(record.rail, (entry) =>
    enumValue(entry, PRODUCT_PAYMENT_RAILS, "$.rail", SNAPSHOT_PHASE),
  );
  const priceRef = nullable(record.price_ref, (entry) =>
    opaqueRef(entry, "$.price_ref", SNAPSHOT_PHASE),
  );
  const activeFrom = nullable(record.active_from, (entry) =>
    canonicalTimestamp(entry, "$.active_from", SNAPSHOT_PHASE),
  );
  const activeUntil = nullable(record.active_until, (entry) =>
    canonicalTimestamp(entry, "$.active_until", SNAPSHOT_PHASE),
  );
  const lastEventAt = nullable(record.last_event_at, (entry) =>
    canonicalTimestamp(entry, "$.last_event_at", SNAPSHOT_PHASE),
  );
  const lastEventId = nullable(record.last_event_id, (entry) =>
    opaqueRef(entry, "$.last_event_id", SNAPSHOT_PHASE),
  );
  const processedEventIds = parseReferenceHistory(
    record.processed_event_ids,
    "$.processed_event_ids",
  );
  const processedProviderEventRefs = parseReferenceHistory(
    record.processed_provider_event_refs,
    "$.processed_provider_event_refs",
  );
  const confirmedPaymentRefs = parseReferenceHistory(
    record.confirmed_payment_refs,
    "$.confirmed_payment_refs",
  );
  if (
    (processedEventIds.length === 0 &&
      (lastEventAt !== null || lastEventId !== null)) ||
    (processedEventIds.length > 0 &&
      (lastEventAt === null ||
        lastEventId === null ||
        processedEventIds.at(-1) !== lastEventId))
  ) {
    fail(
      SNAPSHOT_PHASE,
      "$.last_event_id",
      "cross_contract_mismatch",
      "Snapshot cursor must match the processed event-id history.",
    );
  }

  const hasNoAccessFields =
    channel === null &&
    rail === null &&
    priceRef === null &&
    activeFrom === null &&
    activeUntil === null;
  const hasAllAccessFields =
    channel !== null &&
    rail !== null &&
    priceRef !== null &&
    activeFrom !== null &&
    activeUntil !== null;
  const cancelled = booleanValue(
    record.cancel_at_period_end,
    "$.cancel_at_period_end",
    SNAPSHOT_PHASE,
  );

  if (status === "active") {
    if (
      !hasAllAccessFields ||
      processedEventIds.length === 0 ||
      processedProviderEventRefs.length === 0 ||
      confirmedPaymentRefs.length === 0 ||
      lastEventAt === null ||
      (reason !== "payment_confirmed" && reason !== "renewal_confirmed")
    ) {
      fail(
        SNAPSHOT_PHASE,
        "$.status",
        "cross_contract_mismatch",
        "Active snapshots require confirmed access fields and reason.",
      );
    }
    if (
      PRODUCT_RAIL_CHANNELS[rail as ProductPaymentRail] !== channel ||
      timestampMs(activeFrom as ProductFlowTimestamp) >=
        timestampMs(activeUntil as ProductFlowTimestamp) ||
      timestampMs(lastEventAt as ProductFlowTimestamp) <
        timestampMs(activeFrom as ProductFlowTimestamp)
    ) {
      fail(
        SNAPSHOT_PHASE,
        "$.active_until",
        "cross_contract_mismatch",
        "Active snapshot rail/channel and time bounds must be coherent.",
      );
    }
  } else {
    const allowedReasons =
      status === "inactive"
        ? ["no_confirmed_payment"]
        : status === "ended"
          ? ["subscription_ended", "refunded", "revoked"]
          : [
              "scope_mismatch",
              "out_of_order",
              "history_limit",
              "invalid_transition",
            ];
    if (
      !hasNoAccessFields ||
      cancelled ||
      !allowedReasons.includes(reason) ||
      (status === "ended" && processedEventIds.length === 0)
    ) {
      fail(
        SNAPSHOT_PHASE,
        "$.status",
        "cross_contract_mismatch",
        "Non-active snapshot fields do not match its status and reason.",
      );
    }
  }

  return deepFreeze({
    schema: literal(
      record.schema,
      PRODUCT_ENTITLEMENT_SCHEMA,
      "$.schema",
      SNAPSHOT_PHASE,
    ),
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      "$.environment",
      SNAPSHOT_PHASE,
    ),
    entitlement_ref: opaqueRef(
      record.entitlement_ref,
      "$.entitlement_ref",
      SNAPSHOT_PHASE,
    ),
    subject_ref: opaqueRef(record.subject_ref, "$.subject_ref", SNAPSHOT_PHASE),
    offer_id: offerId(record.offer_id, "$.offer_id", SNAPSHOT_PHASE),
    offer_version: positiveVersion(
      record.offer_version,
      "$.offer_version",
      SNAPSHOT_PHASE,
    ),
    status,
    reason,
    channel,
    rail,
    price_ref: priceRef,
    active_from: activeFrom,
    active_until: activeUntil,
    cancel_at_period_end: cancelled,
    last_event_at: lastEventAt,
    last_event_id: lastEventId,
    processed_event_ids: processedEventIds,
    processed_provider_event_refs: processedProviderEventRefs,
    confirmed_payment_refs: confirmedPaymentRefs,
  });
}

export function createEmptyEntitlementSnapshotV1(
  value: unknown,
): EntitlementSnapshotV1 {
  const record = plainRecord(value, "$", SEED_PHASE);
  const keys = [
    "environment",
    "entitlement_ref",
    "subject_ref",
    "offer_id",
    "offer_version",
  ] as const;
  exactKeys(record, keys, keys, "$", SEED_PHASE);
  const seed: EmptyEntitlementSnapshotInputV1 = {
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      "$.environment",
      SEED_PHASE,
    ),
    entitlement_ref: opaqueRef(
      record.entitlement_ref,
      "$.entitlement_ref",
      SEED_PHASE,
    ),
    subject_ref: opaqueRef(record.subject_ref, "$.subject_ref", SEED_PHASE),
    offer_id: offerId(record.offer_id, "$.offer_id", SEED_PHASE),
    offer_version: positiveVersion(
      record.offer_version,
      "$.offer_version",
      SEED_PHASE,
    ),
  };
  return parseEntitlementSnapshotV1({
    schema: PRODUCT_ENTITLEMENT_SCHEMA,
    ...seed,
    status: "inactive",
    reason: "no_confirmed_payment",
    channel: null,
    rail: null,
    price_ref: null,
    active_from: null,
    active_until: null,
    cancel_at_period_end: false,
    last_event_at: null,
    last_event_id: null,
    processed_event_ids: [],
    processed_provider_event_refs: [],
    confirmed_payment_refs: [],
  });
}

function blockedSnapshot(
  snapshot: EntitlementSnapshotV1,
  reason:
    | "scope_mismatch"
    | "out_of_order"
    | "history_limit"
    | "invalid_transition",
): EntitlementSnapshotV1 {
  return parseEntitlementSnapshotV1({
    ...snapshot,
    status: "blocked",
    reason,
    channel: null,
    rail: null,
    price_ref: null,
    active_from: null,
    active_until: null,
    cancel_at_period_end: false,
  });
}

function withCursor(
  snapshot: EntitlementSnapshotV1,
  event: EntitlementEventV1,
  changes: Partial<EntitlementSnapshotV1> = {},
): EntitlementSnapshotV1 {
  const providerEventRef =
    "evidence" in event ? event.evidence.provider_event_ref : null;
  const confirmedPaymentRef =
    event.type === "payment_confirmed" || event.type === "renewal_confirmed"
      ? event.evidence.payment_ref
      : null;
  return parseEntitlementSnapshotV1({
    ...snapshot,
    ...changes,
    last_event_at: event.occurred_at,
    last_event_id: event.event_id,
    processed_event_ids: [...snapshot.processed_event_ids, event.event_id],
    processed_provider_event_refs:
      providerEventRef === null
        ? snapshot.processed_provider_event_refs
        : [...snapshot.processed_provider_event_refs, providerEventRef],
    confirmed_payment_refs:
      confirmedPaymentRef === null
        ? snapshot.confirmed_payment_refs
        : [...snapshot.confirmed_payment_refs, confirmedPaymentRef],
  });
}

/** Pure, fail-closed projection of one already-received lifecycle event. */
export function reduceEntitlementEventV1(
  snapshotValue: unknown,
  eventValue: unknown,
): EntitlementSnapshotV1 {
  const snapshot = parseEntitlementSnapshotV1(snapshotValue);
  const event = parseEntitlementEventV1(eventValue);

  // Event-id idempotency is checked before any payload comparison. A replay
  // with altered fields cannot perturb a projection that already saw the id.
  if (snapshot.processed_event_ids.includes(event.event_id)) return snapshot;
  if (snapshot.status === "blocked") return snapshot;

  const providerEventRef =
    "evidence" in event ? event.evidence.provider_event_ref : null;
  if (
    providerEventRef !== null &&
    snapshot.processed_provider_event_refs.includes(providerEventRef)
  ) {
    return blockedSnapshot(snapshot, "invalid_transition");
  }
  if (
    (event.type === "payment_confirmed" ||
      event.type === "renewal_confirmed") &&
    snapshot.confirmed_payment_refs.includes(event.evidence.payment_ref)
  ) {
    return blockedSnapshot(snapshot, "invalid_transition");
  }

  if (
    snapshot.environment !== event.environment ||
    snapshot.entitlement_ref !== event.entitlement_ref ||
    snapshot.subject_ref !== event.subject_ref ||
    snapshot.offer_id !== event.offer_id ||
    snapshot.offer_version !== event.offer_version
  ) {
    return blockedSnapshot(snapshot, "scope_mismatch");
  }
  if (
    snapshot.last_event_at !== null &&
    timestampMs(event.occurred_at) <= timestampMs(snapshot.last_event_at)
  ) {
    return blockedSnapshot(snapshot, "out_of_order");
  }
  if (
    snapshot.processed_event_ids.length >=
      PRODUCT_FLOW_LIMITS.processed_event_ids ||
    snapshot.processed_provider_event_refs.length >=
      PRODUCT_FLOW_LIMITS.processed_event_ids ||
    snapshot.confirmed_payment_refs.length >=
      PRODUCT_FLOW_LIMITS.processed_event_ids
  ) {
    return blockedSnapshot(snapshot, "history_limit");
  }

  // A reversal can terminate only the entitlement's latest confirmed grant.
  // Refunding an older paid period must not erase access purchased by a later
  // renewal. Any non-current payment is anomalous, so fail closed without
  // projecting it as the refund that ends access.
  if (
    event.type === "refunded" &&
    snapshot.confirmed_payment_refs.at(-1) !== event.evidence.payment_ref
  ) {
    return blockedSnapshot(snapshot, "invalid_transition");
  }

  if (event.type === "payment_confirmed") {
    if (snapshot.status !== "inactive") {
      return blockedSnapshot(snapshot, "invalid_transition");
    }
    return withCursor(snapshot, event, {
      status: "active",
      reason: "payment_confirmed",
      channel: event.channel,
      rail: event.rail,
      price_ref: event.price_ref,
      active_from: event.evidence.confirmed_at,
      active_until: event.active_until,
      cancel_at_period_end: false,
    });
  }

  if (event.type === "renewal_confirmed") {
    if (
      snapshot.status !== "active" ||
      snapshot.active_until === null ||
      timestampMs(event.active_until) <= timestampMs(snapshot.active_until)
    ) {
      return blockedSnapshot(snapshot, "invalid_transition");
    }
    return withCursor(snapshot, event, {
      status: "active",
      reason: "renewal_confirmed",
      channel: event.channel,
      rail: event.rail,
      price_ref: event.price_ref,
      active_until: event.active_until,
    });
  }

  if (event.type === "cancel_at_period_end") {
    if (
      snapshot.status === "active" &&
      (snapshot.channel !== event.channel ||
        snapshot.rail !== event.rail ||
        snapshot.price_ref !== event.price_ref)
    ) {
      return blockedSnapshot(snapshot, "scope_mismatch");
    }
    return withCursor(
      snapshot,
      event,
      snapshot.status === "active" ? { cancel_at_period_end: true } : {},
    );
  }

  if (event.type === "subscription_resumed") {
    if (
      snapshot.status !== "active" ||
      snapshot.channel !== event.channel ||
      snapshot.rail !== event.rail ||
      snapshot.price_ref !== event.price_ref
    ) {
      return blockedSnapshot(snapshot, "invalid_transition");
    }
    return withCursor(snapshot, event, { cancel_at_period_end: false });
  }

  if (
    event.type === "subscription_ended" ||
    event.type === "refunded" ||
    event.type === "revoked"
  ) {
    if (
      snapshot.status === "active" &&
      event.type !== "revoked" &&
      (snapshot.channel !== event.channel ||
        snapshot.rail !== event.rail ||
        snapshot.price_ref !== event.price_ref)
    ) {
      return blockedSnapshot(snapshot, "scope_mismatch");
    }
    return withCursor(snapshot, event, {
      status: "ended",
      reason: event.type,
      channel: null,
      rail: null,
      price_ref: null,
      active_from: null,
      active_until: null,
      cancel_at_period_end: false,
    });
  }

  // Checkout, redirect, pre-checkout, channel-link and failed-payment events
  // advance audit state only. None can create or extend paid access.
  return withCursor(snapshot, event);
}

export function reduceEntitlementEventsV1(
  snapshotValue: unknown,
  eventValues: unknown,
): EntitlementSnapshotV1 {
  const events = plainArray(eventValues, "$events", EVENT_PHASE);
  return events.reduce<EntitlementSnapshotV1>(
    (snapshot, event) => reduceEntitlementEventV1(snapshot, event),
    parseEntitlementSnapshotV1(snapshotValue),
  );
}
