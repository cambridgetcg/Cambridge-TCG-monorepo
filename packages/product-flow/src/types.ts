import type {
  PRODUCT_ACCESS_REASONS,
  PRODUCT_AVAILABILITIES,
  PRODUCT_DELIVERY_CHANNELS,
  PRODUCT_ENTITLEMENT_EVENT_SCHEMA,
  PRODUCT_ENTITLEMENT_EVENT_TYPES,
  PRODUCT_ENTITLEMENT_REASONS,
  PRODUCT_ENTITLEMENT_SCHEMA,
  PRODUCT_ENTITLEMENT_STATUSES,
  PRODUCT_ENVIRONMENTS,
  PRODUCT_OFFER_NON_CLAIMS,
  PRODUCT_OFFER_SCHEMA,
  PRODUCT_OFFER_STATUSES,
  PRODUCT_PAYMENT_EVIDENCE_SOURCES,
  PRODUCT_PAYMENT_RAILS,
  PRODUCT_RIGHTS_DECISIONS,
} from "./constants";

export type ProductOfferStatus = (typeof PRODUCT_OFFER_STATUSES)[number];
export type ProductEnvironment = (typeof PRODUCT_ENVIRONMENTS)[number];
export type ProductDeliveryChannel = (typeof PRODUCT_DELIVERY_CHANNELS)[number];
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];
export type ProductPaymentRail = (typeof PRODUCT_PAYMENT_RAILS)[number];
export type ProductRightsDecision = (typeof PRODUCT_RIGHTS_DECISIONS)[number];
export type EntitlementEventType =
  (typeof PRODUCT_ENTITLEMENT_EVENT_TYPES)[number];
export type PaymentEvidenceSource =
  (typeof PRODUCT_PAYMENT_EVIDENCE_SOURCES)[number];
export type EntitlementStatus = (typeof PRODUCT_ENTITLEMENT_STATUSES)[number];
export type EntitlementReason = (typeof PRODUCT_ENTITLEMENT_REASONS)[number];
export type AccessDecisionReason = (typeof PRODUCT_ACCESS_REASONS)[number];

/** Canonical UTC timestamp with exactly millisecond precision. */
export type ProductFlowTimestamp = string;

/**
 * Package-scoped pseudonymous reference. The parser accepts only the `pf_`
 * grammar; callers should map provider IDs or user identities to such values
 * before crossing this boundary.
 */
export type ProductFlowOpaqueRef = `pf_${string}`;

export interface ProductBrandV1 {
  /** Provider or studio brand. */
  readonly name: string;
  readonly product_name: string;
  readonly byline: string;
}

export type ProductWebDeliveryV1 =
  | { readonly availability: "off" }
  | {
      readonly availability: "test" | "live";
      readonly url: string;
    };

export type ProductTelegramDeliveryV1 =
  | { readonly availability: "off" }
  | {
      readonly availability: "test" | "live";
      /** Telegram username without the leading `@`. */
      readonly bot_username: string;
      readonly start_parameter: string;
    };

export interface ProductDeliveryV1 {
  readonly web: ProductWebDeliveryV1;
  readonly telegram: ProductTelegramDeliveryV1;
}

type RailDeclaration<
  Rail extends ProductPaymentRail,
  Channel extends ProductDeliveryChannel,
> =
  | {
      readonly rail: Rail;
      readonly channel: Channel;
      readonly availability: "off";
    }
  | {
      readonly rail: Rail;
      readonly channel: Channel;
      readonly availability: "test" | "live";
      readonly price_ref: ProductFlowOpaqueRef;
    };

export type ProductRailDeclarationV1 =
  | RailDeclaration<"stripe_web", "web">
  | RailDeclaration<"telegram_stars", "telegram">
  | RailDeclaration<"paypal_web", "web">
  | RailDeclaration<"crypto_web", "web">;

export interface ProductRightsV1 {
  /** Stable, machine-readable identifier for the intended data/use purpose. */
  readonly purpose: string;
  /**
   * Trusted-host catalogue assertion only. The package validates its shape;
   * it does not authenticate an authority or evidence-bound rights receipt.
   */
  readonly decision: ProductRightsDecision;
}

export interface ProductOfferLinksV1 {
  readonly terms: string;
  readonly support: string;
  readonly methodology: string;
}

export interface ProductOfferV1 {
  readonly schema: typeof PRODUCT_OFFER_SCHEMA;
  readonly brand: ProductBrandV1;
  readonly id: string;
  readonly version: number;
  readonly status: ProductOfferStatus;
  readonly environment: ProductEnvironment;
  readonly audience: string;
  readonly delivery: ProductDeliveryV1;
  /** Exactly one declaration for every v1 rail, in canonical order. */
  readonly rails: readonly ProductRailDeclarationV1[];
  readonly rights: ProductRightsV1;
  readonly links: ProductOfferLinksV1;
  readonly non_claims: typeof PRODUCT_OFFER_NON_CLAIMS;
}

interface EntitlementEventBaseV1 {
  readonly schema: typeof PRODUCT_ENTITLEMENT_EVENT_SCHEMA;
  readonly event_id: ProductFlowOpaqueRef;
  readonly environment: ProductEnvironment;
  readonly type: EntitlementEventType;
  readonly occurred_at: ProductFlowTimestamp;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
}

interface RailAttemptFieldsV1 {
  readonly channel: ProductDeliveryChannel;
  readonly rail: ProductPaymentRail;
  readonly price_ref: ProductFlowOpaqueRef;
}

export interface ProductPaymentEvidenceV1 {
  readonly kind: "provider_confirmation";
  readonly source: PaymentEvidenceSource;
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
  readonly confirmed_at: ProductFlowTimestamp;
  readonly active_until: ProductFlowTimestamp;
}

export interface ProductPaymentFailureEvidenceV1 {
  readonly kind: "provider_failure";
  readonly source: PaymentEvidenceSource;
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
  readonly failed_at: ProductFlowTimestamp;
}

export interface ProductPaymentReversalEvidenceV1 {
  readonly kind: "provider_reversal";
  readonly source: PaymentEvidenceSource;
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly channel: ProductDeliveryChannel;
  readonly rail: ProductPaymentRail;
  readonly price_ref: ProductFlowOpaqueRef;
  readonly provider_event_ref: ProductFlowOpaqueRef;
  /** Must match the latest provider-confirmed payment in the snapshot. */
  readonly payment_ref: ProductFlowOpaqueRef;
  readonly confirmed_at: ProductFlowTimestamp;
}

export interface ProductProviderStatusEvidenceV1 {
  readonly kind: "provider_status";
  readonly source: PaymentEvidenceSource;
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly channel: ProductDeliveryChannel;
  readonly rail: ProductPaymentRail;
  readonly price_ref: ProductFlowOpaqueRef;
  readonly provider_event_ref: ProductFlowOpaqueRef;
  readonly payment_or_subscription_ref: ProductFlowOpaqueRef;
  readonly status_at: ProductFlowTimestamp;
}

export type EntitlementEventV1 =
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "checkout_started" | "browser_return";
      })
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "precheckout_approved";
        readonly channel: "telegram";
        readonly rail: "telegram_stars";
      })
  | (EntitlementEventBaseV1 & {
      readonly type: "channel_linked";
      readonly channel: ProductDeliveryChannel;
    })
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "payment_confirmed" | "renewal_confirmed";
        readonly active_until: ProductFlowTimestamp;
        readonly evidence: ProductPaymentEvidenceV1;
      })
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "payment_failed";
        readonly evidence: ProductPaymentFailureEvidenceV1;
      })
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "refunded";
        readonly evidence: ProductPaymentReversalEvidenceV1;
      })
  | (EntitlementEventBaseV1 &
      RailAttemptFieldsV1 & {
        readonly type: "cancel_at_period_end" | "subscription_ended";
        readonly evidence: ProductProviderStatusEvidenceV1;
      })
  | (EntitlementEventBaseV1 & {
      readonly type: "revoked";
    });

export type ProductEntitlementEventV1 = EntitlementEventV1;

export interface EntitlementSnapshotV1 {
  readonly schema: typeof PRODUCT_ENTITLEMENT_SCHEMA;
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly status: EntitlementStatus;
  readonly reason: EntitlementReason;
  readonly channel: ProductDeliveryChannel | null;
  readonly rail: ProductPaymentRail | null;
  readonly price_ref: ProductFlowOpaqueRef | null;
  readonly active_from: ProductFlowTimestamp | null;
  readonly active_until: ProductFlowTimestamp | null;
  readonly cancel_at_period_end: boolean;
  readonly last_event_at: ProductFlowTimestamp | null;
  readonly last_event_id: ProductFlowOpaqueRef | null;
  readonly processed_event_ids: readonly ProductFlowOpaqueRef[];
  readonly processed_provider_event_refs: readonly ProductFlowOpaqueRef[];
  readonly confirmed_payment_refs: readonly ProductFlowOpaqueRef[];
}

export type ProductEntitlementV1 = EntitlementSnapshotV1;

export interface EmptyEntitlementSnapshotInputV1 {
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
}

export interface AccessEvaluationContextV1 {
  /** Explicit caller-selected environment; never read from process state. */
  readonly environment: ProductEnvironment;
  readonly channel: ProductDeliveryChannel;
  /** Explicit caller-supplied time; this package never reads a clock. */
  readonly evaluated_at: ProductFlowTimestamp;
}

export interface AccessDecisionV1 {
  readonly allowed: boolean;
  readonly reason: AccessDecisionReason;
  readonly environment: ProductEnvironment;
  readonly channel: ProductDeliveryChannel;
  readonly evaluated_at: ProductFlowTimestamp;
  readonly entitlement_ref: ProductFlowOpaqueRef;
}
