import { PRODUCT_DELIVERY_CHANNELS, PRODUCT_ENVIRONMENTS } from "./constants";
import { parseEntitlementSnapshotV1 } from "./entitlement";
import { parseProductOfferV1 } from "./offer";
import type {
  AccessDecisionReason,
  AccessDecisionV1,
  AccessEvaluationContextV1,
  EntitlementSnapshotV1,
  ProductDeliveryChannel,
  ProductEnvironment,
  ProductFlowTimestamp,
} from "./types";
import {
  canonicalTimestamp,
  deepFreeze,
  enumValue,
  exactKeys,
  plainRecord,
  timestampMs,
} from "./validation";

export function parseAccessEvaluationContextV1(
  value: unknown,
): AccessEvaluationContextV1 {
  const record = plainRecord(value, "$", "access_context");
  const keys = ["environment", "channel", "evaluated_at"] as const;
  exactKeys(record, keys, keys, "$", "access_context");
  return deepFreeze({
    environment: enumValue(
      record.environment,
      PRODUCT_ENVIRONMENTS,
      "$.environment",
      "access_context",
    ),
    channel: enumValue(
      record.channel,
      PRODUCT_DELIVERY_CHANNELS,
      "$.channel",
      "access_context",
    ),
    evaluated_at: canonicalTimestamp(
      record.evaluated_at,
      "$.evaluated_at",
      "access_context",
    ),
  });
}

function decision(
  snapshot: EntitlementSnapshotV1,
  environment: ProductEnvironment,
  channel: ProductDeliveryChannel,
  evaluatedAt: ProductFlowTimestamp,
  allowed: boolean,
  reason: AccessDecisionReason,
): AccessDecisionV1 {
  return deepFreeze({
    allowed,
    reason,
    environment,
    channel,
    evaluated_at: evaluatedAt,
    entitlement_ref: snapshot.entitlement_ref,
  });
}

/**
 * Evaluates one delivery request using only supplied JSON and an explicitly
 * injected timestamp. Invalid contracts throw; valid-but-untrusted state
 * returns a frozen denial.
 */
export function evaluateAccessV1(
  offerValue: unknown,
  snapshotValue: unknown,
  contextValue: unknown,
): AccessDecisionV1 {
  const offer = parseProductOfferV1(offerValue);
  const snapshot = parseEntitlementSnapshotV1(snapshotValue);
  const context = parseAccessEvaluationContextV1(contextValue);
  const deny = (reason: Exclude<AccessDecisionReason, "active">) =>
    decision(
      snapshot,
      context.environment,
      context.channel,
      context.evaluated_at,
      false,
      reason,
    );

  if (
    offer.environment !== context.environment ||
    snapshot.environment !== context.environment
  ) {
    return deny("environment_mismatch");
  }

  const expectedAvailability =
    context.environment === "production" ? "live" : "test";
  const expectedStatus = context.environment === "production" ? "live" : "test";
  if (offer.status !== expectedStatus) return deny("offer_unavailable");
  if (offer.rights.decision !== "granted") return deny("rights_not_granted");

  const delivery = offer.delivery[context.channel];
  if (delivery.availability !== expectedAvailability) {
    return deny("channel_unavailable");
  }
  if (snapshot.status === "blocked") return deny("entitlement_blocked");
  if (snapshot.status !== "active") return deny("entitlement_inactive");
  if (
    snapshot.offer_id !== offer.id ||
    snapshot.offer_version !== offer.version
  ) {
    return deny("scope_mismatch");
  }

  // The snapshot parser guarantees all access fields are non-null here.
  const activeFrom = snapshot.active_from as ProductFlowTimestamp;
  const activeUntil = snapshot.active_until as ProductFlowTimestamp;
  if (timestampMs(context.evaluated_at) < timestampMs(activeFrom)) {
    return deny("not_yet_active");
  }
  if (timestampMs(context.evaluated_at) >= timestampMs(activeUntil)) {
    return deny("expired");
  }

  const rail = offer.rails.find((entry) => entry.rail === snapshot.rail);
  if (rail === undefined || rail.availability !== expectedAvailability) {
    return deny("rail_unavailable");
  }
  if (!("price_ref" in rail) || rail.price_ref !== snapshot.price_ref) {
    return deny("unknown_price_ref");
  }

  return decision(
    snapshot,
    context.environment,
    context.channel,
    context.evaluated_at,
    true,
    "active",
  );
}
