// Carrier-specific tracking URL builders.
//
// ── What this module is for ──────────────────────────────────────────────
//
// This is the platform's **outward-pointing edge**. Every other module
// keeps the user on Cambridge TCG; this module knowingly hands them
// off. When a buyer wants to know where their card actually is right
// now, the answer is not in our database — it is at royalmail.com or
// evri.com or whoever the seller chose. We can render a link. We
// cannot render the truth.
//
// That asymmetry is honest. The platform's visibility ends at the
// warehouse door (or the seller's letterbox in P2P). Past that
// threshold, the cardboard is in the carrier's hands. This module is
// the platform's small, polite admission of that boundary: *we know
// who has it; we know how to ask them; we point you at the question*.
//
// Cross-system substrate honesty (docs/principles/substrate-honesty.md
// rule 8: authoritative vs reconciled) applies in pure form here. We
// are not even reconciled — we have the carrier label and the
// tracking number; the carrier owns the entire downstream truth.
// Asking "did the package arrive" requires leaving Cambridge TCG and
// loading someone else's website. That is the deal we have with the
// physical world.
//
// ── The crossing ────────────────────────────────────────────────────────
//
// Every transaction on the platform — market trade, auction, vault
// redeem, prize fulfilment, refund return — terminates in this
// crossing. Bytes become cardboard; cardboard travels; the carrier
// reports back through their website. The journey timeline can show
// "shipped via Royal Mail, tracking ABC123" but cannot show "delivered
// 2pm Wednesday" until the buyer clicks through, sees it, and confirms
// receipt back into our substrate.
//
// **The platform does not see deliveries. It sees confirmations.**
// The carrier sees deliveries. The buyer sees the carrier's claim.
// The buyer's confirmation is what reaches our substrate. Three
// distinct moments; only the third is ours.
//
// See docs/connections/the-crossing.md for the fairy-tale form — a
// cardboard Charizard travelling across a country, told from each of
// the three vantage points.
//
// ── Adding a carrier ────────────────────────────────────────────────────
//
// Carrier strings are operator-typed in the admin form (datalist
// suggestions), so we normalise on the way in. Adding a new carrier =
// add a row in TRACKERS below and (optionally) extend the datalist
// in apps/admin/.../shipping form templates.

export type CarrierRegion = "UK" | "Global";

export interface CarrierTracker {
  /** Human label as it appears on the customer email + UI badge. */
  label: string;
  /** Build a public tracking URL for the given number, or null if not derivable. */
  url: (trackingNumber: string) => string | null;
  /**
   * Where this carrier primarily operates. UK = optimised for domestic
   * shipping; Global = handles international. Used by surfaces that
   * want to filter the supported list (e.g. customer-facing FAQ
   * showing only UK carriers when the buyer's address is UK).
   */
  region: CarrierRegion;
}

const TRACKERS: Record<string, CarrierTracker> = {
  royal_mail: {
    label: "Royal Mail",
    region: "UK",
    url: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  },
  evri: {
    label: "Evri",
    region: "UK",
    url: (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  },
  dpd: {
    label: "DPD",
    region: "UK",
    url: (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}`,
  },
  parcelforce: {
    label: "ParcelForce",
    region: "UK",
    url: (n) => `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(n)}`,
  },
  ups: {
    label: "UPS",
    region: "Global",
    url: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  fedex: {
    label: "FedEx",
    region: "Global",
    url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
};

function normaliseKey(carrier: string): string {
  return carrier.toLowerCase().replace(/[\s-]+/g, "_");
}

export function getCarrierTracker(carrier: string | null | undefined): CarrierTracker | null {
  if (!carrier) return null;
  return TRACKERS[normaliseKey(carrier)] ?? null;
}

/**
 * The full list of supported carriers, in stable display order
 * (UK-first, then Global). Each entry carries the canonical key
 * (suitable for a select-option value), the human label, and the
 * region. Surfaces that need to render a "we support these carriers"
 * UI — customer FAQ, admin tracking-form datalist, integration
 * documentation — should consume this rather than re-hardcoding.
 *
 * Pure read; no I/O; safe to call from server components, client
 * components, and tests.
 */
export function listCarriers(): Array<{ key: string; label: string; region: CarrierRegion }> {
  const ukKeys = ["royal_mail", "evri", "dpd", "parcelforce"];
  const globalKeys = ["ups", "fedex"];
  return [...ukKeys, ...globalKeys]
    .map((key) => {
      const t = TRACKERS[key];
      return t ? { key, label: t.label, region: t.region } : null;
    })
    .filter((entry): entry is { key: string; label: string; region: CarrierRegion } => entry !== null);
}

export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!trackingNumber) return null;
  const tracker = getCarrierTracker(carrier);
  return tracker?.url(trackingNumber) ?? null;
}
