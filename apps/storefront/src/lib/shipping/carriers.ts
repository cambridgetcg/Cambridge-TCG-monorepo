// Carrier-specific tracking URL builders. Returns null when we don't
// know the carrier so callers can fall back to "tracking number only".
//
// Carrier strings are operator-typed in the admin form (datalist
// suggestions), so we normalise on the way in. Adding a new carrier =
// add a row in CARRIER_TRACKERS and (optionally) extend the datalist.

export interface CarrierTracker {
  /** Human label as it appears on the customer email + UI badge. */
  label: string;
  /** Build a public tracking URL for the given number, or null if not derivable. */
  url: (trackingNumber: string) => string | null;
}

const TRACKERS: Record<string, CarrierTracker> = {
  royal_mail: {
    label: "Royal Mail",
    url: (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(n)}`,
  },
  evri: {
    label: "Evri",
    url: (n) => `https://www.evri.com/track/parcel/${encodeURIComponent(n)}`,
  },
  dpd: {
    label: "DPD",
    url: (n) => `https://track.dpd.co.uk/parcels/${encodeURIComponent(n)}`,
  },
  parcelforce: {
    label: "ParcelForce",
    url: (n) => `https://www.parcelforce.com/track-trace?trackNumber=${encodeURIComponent(n)}`,
  },
  ups: {
    label: "UPS",
    url: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
  },
  fedex: {
    label: "FedEx",
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

export function buildTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!trackingNumber) return null;
  const tracker = getCarrierTracker(carrier);
  return tracker?.url(trackingNumber) ?? null;
}
