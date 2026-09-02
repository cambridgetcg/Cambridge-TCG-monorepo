import type {
  AccessDecisionV1,
  EmptyEntitlementSnapshotInputV1,
  EntitlementEventV1,
  EntitlementSnapshotV1,
  ProductEnvironment,
  ProductFlowOpaqueRef,
  ProductFlowTimestamp,
} from "@cambridge-tcg/product-flow";

import type {
  PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES,
  PRODUCT_FLOW_RUNTIME_EVENT_EFFECTS,
  STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA,
  STRIPE_SUBSCRIPTION_MAPPING_SCHEMA,
  TELEGRAM_STARS_CALLBACK_SCHEMA,
  TELEGRAM_STARS_MAPPING_SCHEMA,
} from "./constants";

interface ProductRuntimeScopeV1 {
  readonly environment: ProductEnvironment;
  readonly entitlement_ref: ProductFlowOpaqueRef;
  readonly subject_ref: ProductFlowOpaqueRef;
  readonly offer_id: string;
  readonly offer_version: number;
  readonly price_ref: ProductFlowOpaqueRef;
}

export interface StripeSubscriptionMappingV1 extends ProductRuntimeScopeV1 {
  readonly schema: typeof STRIPE_SUBSCRIPTION_MAPPING_SCHEMA;
  readonly provider: "stripe_subscriptions";
}

export interface TelegramStarsMappingV1 extends ProductRuntimeScopeV1 {
  readonly schema: typeof TELEGRAM_STARS_MAPPING_SCHEMA;
  readonly provider: "telegram_stars";
  /** Opaque host mapping for the exact expected Telegram invoice payload. */
  readonly invoice_payload_ref: ProductFlowOpaqueRef;
  readonly amount_stars: number;
}

interface RuntimeCallbackBaseV1<Schema extends string> {
  readonly schema: Schema;
  readonly event_id: ProductFlowOpaqueRef;
  readonly occurred_at: ProductFlowTimestamp;
}

interface ProviderEvidenceCallbackV1 {
  readonly provider_event_ref: ProductFlowOpaqueRef;
}

export type StripeSubscriptionCallbackV1 =
  | (RuntimeCallbackBaseV1<typeof STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA> & {
      readonly kind: "browser_return" | "checkout_session_completed";
    })
  | (RuntimeCallbackBaseV1<typeof STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA> &
      ProviderEvidenceCallbackV1 & {
        readonly kind: "invoice_paid_initial" | "invoice_paid_renewal";
        readonly payment_ref: ProductFlowOpaqueRef;
        readonly confirmed_at: ProductFlowTimestamp;
        readonly active_until: ProductFlowTimestamp;
      })
  | (RuntimeCallbackBaseV1<typeof STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA> &
      ProviderEvidenceCallbackV1 & {
        readonly kind: "invoice_payment_failed";
        readonly payment_ref: ProductFlowOpaqueRef;
        readonly failed_at: ProductFlowTimestamp;
      })
  | (RuntimeCallbackBaseV1<typeof STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA> &
      ProviderEvidenceCallbackV1 & {
        readonly kind:
          | "subscription_cancel_at_period_end"
          | "subscription_ended";
        readonly subscription_ref: ProductFlowOpaqueRef;
        readonly status_at: ProductFlowTimestamp;
      })
  | (RuntimeCallbackBaseV1<typeof STRIPE_SUBSCRIPTION_CALLBACK_SCHEMA> &
      ProviderEvidenceCallbackV1 & {
        readonly kind: "refund_created";
        readonly refund_extent: "full" | "partial";
        /** Host mapping of the original paid invoice/payment reference. */
        readonly payment_ref: ProductFlowOpaqueRef;
        readonly refunded_at: ProductFlowTimestamp;
      });

interface TelegramInvoiceProofV1 {
  readonly currency: "XTR";
  readonly invoice_payload_ref: ProductFlowOpaqueRef;
  readonly amount_stars: number;
}

export type TelegramStarsCallbackV1 =
  | (RuntimeCallbackBaseV1<typeof TELEGRAM_STARS_CALLBACK_SCHEMA> &
      TelegramInvoiceProofV1 & {
        readonly kind: "precheckout_approved";
      })
  | (RuntimeCallbackBaseV1<typeof TELEGRAM_STARS_CALLBACK_SCHEMA> &
      TelegramInvoiceProofV1 &
      ProviderEvidenceCallbackV1 & {
        readonly kind: "successful_payment";
        readonly payment_ref: ProductFlowOpaqueRef;
        readonly confirmed_at: ProductFlowTimestamp;
        readonly subscription_expiration_at: ProductFlowTimestamp;
        readonly is_recurring: boolean;
        readonly is_first_recurring: boolean;
      })
  | (RuntimeCallbackBaseV1<typeof TELEGRAM_STARS_CALLBACK_SCHEMA> &
      TelegramInvoiceProofV1 &
      ProviderEvidenceCallbackV1 & {
        readonly kind: "refunded_payment";
        /** Host mapping of the original telegram_payment_charge_id. */
        readonly original_payment_ref: ProductFlowOpaqueRef;
        readonly refunded_at: ProductFlowTimestamp;
      });

export type ProductFlowRuntimeDuplicateMatchV1 =
  (typeof PRODUCT_FLOW_RUNTIME_DUPLICATE_MATCHES)[number];

export type ProductFlowRuntimeEventEffectV1 =
  (typeof PRODUCT_FLOW_RUNTIME_EVENT_EFFECTS)[number];

export interface ProductFlowRuntimeGrantIdentityV1 {
  readonly environment: ProductEnvironment;
  readonly rail: "stripe_web" | "telegram_stars" | "paypal_web" | "crypto_web";
  readonly payment_ref: ProductFlowOpaqueRef;
}

export type ProductFlowRuntimeAppendResultV1 =
  | { readonly disposition: "appended" }
  | {
      readonly disposition: "duplicate";
      readonly matched_by: readonly ProductFlowRuntimeDuplicateMatchV1[];
      readonly existing_event: EntitlementEventV1;
    };

/** All methods operate inside the store's enclosing transaction. */
export interface ProductFlowRuntimeTransactionV1 {
  /** Create or lock/load by (environment, entitlement_ref) for update. */
  lockEntitlement(
    seed: EmptyEntitlementSnapshotInputV1,
  ): Promise<EntitlementSnapshotV1>;

  /** Unique by environment + event id, provider event ref, and grant identity. */
  appendUniqueEvent(
    event: EntitlementEventV1,
  ): Promise<ProductFlowRuntimeAppendResultV1>;

  /** Persist only the entitlement locked by this transaction. */
  persistEntitlement(snapshot: EntitlementSnapshotV1): Promise<void>;
}

export interface ProductFlowRuntimeStoreV1 {
  /**
   * Commit all callback writes together and roll back on throw. Locks must
   * serialize same-environment entitlement applies before event insertion.
   */
  transaction<T>(
    work: (transaction: ProductFlowRuntimeTransactionV1) => Promise<T>,
  ): Promise<T>;
}

export type ProductFlowRuntimeApplyResultV1 =
  | {
      readonly disposition: "applied";
      readonly effect: ProductFlowRuntimeEventEffectV1;
      readonly event: EntitlementEventV1;
      readonly snapshot: EntitlementSnapshotV1;
    }
  | {
      readonly disposition: "duplicate";
      readonly effect: ProductFlowRuntimeEventEffectV1;
      readonly matched_by: readonly ProductFlowRuntimeDuplicateMatchV1[];
      readonly event: EntitlementEventV1;
      readonly snapshot: EntitlementSnapshotV1;
    };

export interface ProductFlowRuntimeDeliveryDecisionsV1 {
  readonly web: AccessDecisionV1;
  readonly telegram: AccessDecisionV1;
}

export interface ProductFlowRuntimeEvaluationInputV1 {
  readonly environment: ProductEnvironment;
  readonly evaluated_at: ProductFlowTimestamp;
}

export interface ProductFlowRuntimeMemoryStateV1 {
  readonly events: readonly EntitlementEventV1[];
  readonly snapshots: readonly EntitlementSnapshotV1[];
}
