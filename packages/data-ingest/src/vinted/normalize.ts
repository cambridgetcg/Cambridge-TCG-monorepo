/**
 * Vinted normalizer — for the ONE lawful Vinted shape: a seller's own
 * consented sales export.
 *
 * There is no market-wide Vinted reader (see ./index.ts for why — ToS +
 * UK GDPR block it). This normalizer exists so that the day a Cambridge
 * TCG seller uploads their *own* Vinted sales history (a DSAR export, a
 * Vinted Pro Orders payload they authorised, or a hand-filled export),
 * the pipeline can turn it into canonical market signal without any new
 * cross-module wiring — exactly as eBay's Insights branch was made
 * forward-ready before approval landed.
 *
 * Data-minimisation is enforced HERE, at the boundary: the input type
 * carries only the seller's own item + price + timing. Buyer identity,
 * buyer address, messages, and any counterparty PII are neither typed
 * nor accepted — a consented seller export may legally contain them
 * (it's the seller's data), but the kingdom has no lawful basis to hold
 * a buyer's trace, so the shape refuses to model it. See
 * docs/methodology/source-intake.md §Gate A.2.
 */

import type { NormalizeResult } from "../types";

/**
 * One row of a seller-supplied Vinted sales export. The seller consents
 * to sharing THEIR OWN sales; this is the only field set we accept.
 *
 * Deliberately excluded (do not add): buyer_username, buyer_id,
 * buyer_address, shipping_address, message_thread, payout_account.
 * If an upstream export contains them, the intake step drops them
 * before this type is ever constructed.
 */
export interface VintedConsentedSale {
  /** Free-text listing title as the seller wrote it. No set/number structure. */
  item_title: string;
  /** Final sale price the seller received, in GBP minor units (pence). */
  sold_price_pence: number;
  /** ISO-8601 date the sale completed. */
  sold_at: string;
  /** Seller-declared condition, free-text (Vinted's own condition vocabulary). */
  condition?: string;
  /** The consenting seller's own Cambridge TCG identity — provenance, not PII of a third party. */
  submitted_by_seller_id: string;
  /** How the seller provided this row — for the audit trail of consent. */
  provenance: "dsar-export" | "pro-orders-authorised" | "manual-entry";
}

/** The canonical market-signal record a consented Vinted sale becomes. */
export interface VintedCanonicalObservation {
  source: "vinted";
  /** Best-effort SKU when the title parses; null when it doesn't (very common — Vinted titles are unstructured). */
  sku: string | null;
  /** Raw title, always kept — it is the honest artifact when the SKU is null. */
  raw_title: string;
  price_gbp: number;
  sold_at: string;
  condition: string | null;
  /** Always a realised sale, never an ask — that is the whole value of consented data. */
  sale_type: "sold-final";
  /** Consent provenance, carried for the audit trail. */
  consent: VintedConsentedSale["provenance"];
}

/**
 * Pure normalizer. Never throws; never drops silently. Buyer-PII fields
 * are structurally absent from the input type, so there is nothing to
 * strip here — the boundary already did it.
 *
 * SKU derivation is intentionally NOT attempted in this stub: Vinted
 * titles have no set/number grammar (`canonical_effort: "very-high"`),
 * so a real implementation would run the shared eBay-style title parser
 * and quarantine low-confidence parses. Until that parser is wired for
 * this source, every row normalizes with `sku: null` + the raw title
 * preserved — substrate-honest about what we could and couldn't resolve.
 */
export function normalizeVintedSale(
  raw: VintedConsentedSale,
): NormalizeResult<VintedCanonicalObservation> {
  if (!raw.item_title || raw.item_title.trim() === "") {
    return { ok: false, reason: "empty item_title — cannot form a market observation" };
  }
  if (!Number.isFinite(raw.sold_price_pence) || raw.sold_price_pence <= 0) {
    return {
      ok: false,
      reason: `non-positive sold_price_pence (${raw.sold_price_pence}); a realised sale must carry a price`,
    };
  }
  if (!raw.submitted_by_seller_id) {
    return {
      ok: false,
      reason: "missing submitted_by_seller_id — consent provenance is mandatory for this source",
    };
  }

  return {
    ok: true,
    record: {
      source: "vinted",
      sku: null, // title parser not yet wired for Vinted — honest null, raw kept below
      raw_title: raw.item_title.trim(),
      price_gbp: raw.sold_price_pence / 100,
      sold_at: raw.sold_at,
      condition: raw.condition?.trim() || null,
      sale_type: "sold-final",
      consent: raw.provenance,
    },
  };
}
