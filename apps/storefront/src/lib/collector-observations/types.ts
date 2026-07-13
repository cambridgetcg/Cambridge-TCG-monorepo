import type { Currency } from "@/lib/fx/rates";

export const OBSERVATION_KINDS = [
  "purchase",
  "completed_sale",
  "asking_price",
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

export const OBSERVATION_CONDITIONS = ["M", "NM", "LP", "MP", "HP", "DMG"] as const;
export type ObservationCondition = (typeof OBSERVATION_CONDITIONS)[number];

export const OBSERVATION_SHARING_MODES = [
  "private",
  "anonymous_aggregate",
  "cc0",
] as const;

export type ObservationSharingMode = (typeof OBSERVATION_SHARING_MODES)[number];

export const COLLECTOR_OBSERVATION_TERMS_VERSION = "collector-witness-v2" as const;
export const COLLECTOR_OBSERVATION_PUBLICATION = Object.freeze({
  status: "paused" as const,
  reason:
    "A live mutable aggregate can reveal a contributor through controlled-account and repeated-read differencing, even after a distinct-person threshold is met.",
  resumes_when: [
    "A delayed closed projector separates contribution time from publication time.",
    "Coarse output and a release ledger prevent exact-value and repeated-read reconstruction.",
    "Automated tests pin consent, deletion, correction, and differencing boundaries.",
  ] as const,
  rights: "NOASSERTION" as const,
  source_rights: "internal-only" as const,
});

/**
 * Owner-facing representation. It intentionally has no user id, receipt,
 * source URL, note, merchant, or location. `first_party_attested` is always
 * true: the server writes a row only after the authenticated collector made
 * that explicit attestation.
 */
export interface CollectorObservation {
  id: string;
  submission_key: string;
  sku: string;
  observation_kind: ObservationKind;
  condition: ObservationCondition | null;
  /** Exact decimal string, never a JavaScript floating-point number. */
  price_amount: string;
  price_currency: Currency;
  /** Calendar date only. Exact transaction time is intentionally not stored. */
  observed_on: string;
  first_party_attested: true;
  first_party_attested_at: string;
  sharing_mode: ObservationSharingMode;
  sharing_terms_version: string;
  sharing_changed_at: string;
  cc0_acknowledged_at: string | null;
  /** Owner-only. Any future projector must exclude this field. */
  evidence_sha256: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCollectorObservationInput {
  submission_key: string;
  sku: string;
  observation_kind: ObservationKind;
  condition: ObservationCondition | null;
  price_amount: string;
  price_currency: Currency;
  observed_on: string;
  first_party_attested: true;
  sharing_mode: ObservationSharingMode;
  evidence_sha256: string | null;
  cc0_acknowledged: boolean;
}

export interface PatchCollectorObservationInput {
  revision: number;
  sku?: string;
  observation_kind?: ObservationKind;
  condition?: ObservationCondition | null;
  price_amount?: string;
  price_currency?: Currency;
  observed_on?: string;
  sharing_mode?: ObservationSharingMode;
  evidence_sha256?: string | null;
  cc0_acknowledged?: boolean;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; field: string; message: string };
