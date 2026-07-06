/**
 * Auction winner shipping address → printable lines.
 *
 * The winner's address is collected by Stripe Checkout at pay time and
 * persisted to `auctions.shipping_address` (migration 0114, mirroring the
 * P2P trade path 0105). The seller-facing fulfilment panel renders it so a
 * direct-ship seller knows where to send the card — the personas used to
 * fall back to a DM because the ship step only ever asked for a tracking
 * number.
 *
 * Pure + import-safe (no "use client", no React) so PostWinPanel and the
 * regression test can both consume it. Mirrors the trade detail page's
 * `addressLines` helper exactly: tolerant of a JSON-string column or an
 * already-parsed object, and of Stripe's `{ address: {...} }` nesting;
 * returns [] when absent or malformed (the panel then shows a fallback
 * line rather than an empty block).
 */
export function addressLines(raw: unknown): string[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  // Stripe collected_information nests under `.address`; the flattened
  // column stores keys at the top level. Accept both shapes.
  const addr =
    obj.address && typeof obj.address === "object"
      ? (obj.address as Record<string, unknown>)
      : obj;

  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  return [
    str(obj.name),
    str(addr.line1),
    str(addr.line2),
    [str(addr.postal_code), str(addr.city)].filter(Boolean).join(" "),
    str(addr.state),
    str(addr.country),
  ].filter((l): l is string => l.length > 0);
}
