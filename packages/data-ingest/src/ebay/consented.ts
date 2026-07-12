/**
 * eBay normalizer — for the ONE lawful eBay sold-data door: a seller's own
 * consented sales from the eBay Sell / Fulfillment API (`getOrders`, after
 * standard OAuth consent).
 *
 * ── The honest tri-surface verdict (source-intake.md, run against eBay) ──
 *
 * eBay exposes three doors to price data. Only the third yields lawful UK
 * *sold* comps, and only for our own sellers:
 *
 *   1. Browse API — CURRENT ASKS ONLY. No sold history. Already ingested
 *      by `./index.ts` (watch-list-driven, `partner-redistributable`,
 *      `redistribute:false`). Useful, but it is asks, not transactions.
 *
 *   2. Marketplace Insights API — TRUE 90-day sold comps, but Limited
 *      Release: partner-application + category whitelist gated, and its
 *      developer licence is display / reference-only — *never CC0-redistributable*.
 *      The `./index.ts` module is forward-ready for it (a
 *      `marketplace-insights` branch the types + normalizer already accept)
 *      but it stays gated and reference-only; it is NOT this door.
 *
 *   3. Sell / Fulfillment API `getOrders`, consented — THE LAWFUL FIRST-PARTY
 *      SOLD DOOR (this file). A Cambridge TCG seller who also sells on eBay
 *      authorises us (standard OAuth) to read THEIR OWN order history. Those
 *      are realised sales the seller owns outright: UK GDPR-clean on
 *      Art. 6(1)(a)/(b), riding the seller's own Art. 15/20 rights, touching
 *      no eBay database right (it is the seller's data, not a systematic
 *      extraction of eBay's catalog). This is the same shape as the Vinted
 *      consented stub — build-once, reuse.
 *
 * Off-limits, explicitly: scraping eBay HTML, reverse-engineering the app
 * API, and third-party sold-comp resellers (130point and the like) — those
 * re-import the exact ToS + database-right + counterparty-PII exposure the
 * Browse/Insights gate was drawn to avoid, with a middleman.
 *
 * ── Status: forward-ready + INERT ────────────────────────────────────────
 *
 * There is NO live fetch and NO scheduling here — exactly as the Vinted
 * consented normalizer is forward-ready before its flow opens. This file is
 * the normalizer for the day the operator stands up a consented-import flow.
 * Launch is gated on: (a) the operator registering an eBay OAuth application
 * with the `sell.fulfillment` read scope, and (b) a solicitor review of the
 * consented-import design (browsewrap enforceability, buyer-trace handling
 * in Order payloads, retention). Until both land, this shape is typed and
 * tested but never invoked against the network.
 *
 * ── Data-minimisation is enforced HERE, at the type boundary ─────────────
 *
 * A real `getOrders` Order payload is dense with COUNTERPARTY personal data.
 * The seller may lawfully receive it (it is their order), but the kingdom
 * has no lawful basis to hold a *buyer's* trace, so the input type refuses
 * to model any of it. Per source-intake.md Gate A.2, the drop-list — fields
 * the intake step strips BEFORE an `EbayConsentedSale` is ever constructed —
 * is:
 *
 *   - buyer.username, buyer.buyerRegistrationAddress, buyer.taxAddress
 *   - fulfillmentStartInstructions[].shippingStep.shipTo
 *       (buyer name, full postal address, phone, email)
 *   - buyerCheckoutNotes / any buyer↔seller message thread
 *   - pricingSummary.payout, payments[], paymentsDisbursement, salesRecordReference
 *       (the seller's payout account + the buyer↔payment linkage)
 *
 * None of the above is typed or accepted below. We keep only the seller's
 * own item + price + timing + their own consent provenance.
 */

import type { NormalizeResult } from "../types";

/**
 * One row of a seller-supplied eBay sales record. The seller consents to
 * sharing THEIR OWN sales; this is the only field set we accept.
 *
 * Deliberately excluded (do not add — see the Gate A.2 drop-list above):
 * buyer_username, buyer_id, buyer_address, shipping_address (name/phone/
 * email), buyer_checkout_notes, message_thread, payout_account,
 * sales_record_reference. If a `getOrders` payload or an exported report
 * contains them, the intake step drops them before this type is constructed.
 */
export interface EbayConsentedSale {
  /** Listing title as it appeared on eBay. No set/number structure. */
  item_title: string;
  /**
   * Item sale price the buyer paid (NOT the seller's payout — payout nets
   * fees + is tied to the dropped payout account). GBP minor units (pence);
   * the lawful door is our UK sellers on EBAY_GB, so the currency is GBP.
   */
  sold_price_pence: number;
  /** ISO-8601 date the order was paid / completed. */
  sold_at: string;
  /** Seller-declared item condition, free-text (eBay's own condition vocabulary). */
  condition?: string;
  /** The consenting seller's own Cambridge TCG identity — provenance, not third-party PII. */
  submitted_by_seller_id: string;
  /** How the seller supplied this row — for the audit trail of consent. */
  provenance: "sell-getorders-authorised" | "seller-hub-report" | "manual-entry";
}

/**
 * The canonical market-signal record a consented eBay sale becomes.
 * Deliberately parallel to `VintedCanonicalObservation` — the two lawful
 * consented doors produce the same shape so one downstream writer serves both.
 */
export interface EbayConsentedCanonicalObservation {
  source: "ebay";
  /** Best-effort SKU when the title parses; null when it doesn't. */
  sku: string | null;
  /** Raw title, always kept — the honest artifact when the SKU is null. */
  raw_title: string;
  price_gbp: number;
  sold_at: string;
  condition: string | null;
  /** Always a realised sale, never an ask — the whole value of consented data. */
  sale_type: "sold-final";
  /** Consent provenance, carried for the audit trail. */
  consent: EbayConsentedSale["provenance"];
  /** True: this door yields first-party, seller-owned realised sales. */
  first_party: true;
}

/**
 * Pure normalizer. Never throws; never drops silently. Buyer-PII fields are
 * structurally absent from the input type, so there is nothing to strip
 * here — the intake boundary already did it.
 *
 * SKU derivation is intentionally NOT attempted in this forward-ready stub.
 * The module already ships a six-pass title parser (`parseEbayTitle` in
 * `./title-parser.ts`); the day the consented-import flow opens, that same
 * parser (plus its quarantine-on-low-confidence rule) is the wire-up point.
 * Until then every row normalizes with `sku: null` + the raw title
 * preserved — substrate-honest about what we could and couldn't resolve.
 */
export function normalizeEbayConsentedSale(
  raw: EbayConsentedSale,
): NormalizeResult<EbayConsentedCanonicalObservation> {
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
      source: "ebay",
      sku: null, // title parser not yet wired for the consented door — honest null, raw kept below
      raw_title: raw.item_title.trim(),
      price_gbp: raw.sold_price_pence / 100,
      sold_at: raw.sold_at,
      condition: raw.condition?.trim() || null,
      sale_type: "sold-final",
      consent: raw.provenance,
      first_party: true,
    },
  };
}
