"use client";

import { useEffect } from "react";
import Link from "next/link";

// Legacy cart key from the retail-shop era (see the collectors-first
// decision, docs/decisions/2026-07-06-collectors-first.md). The cart is
// gone; this sweep just tidies the stale localStorage entry for anyone
// arriving from a pre-pivot session.
const LEGACY_CART_KEY = "cambridgetcg_cart";

export default function OrderDetails() {
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_CART_KEY);
    } catch {
      // Storage unavailable — nothing to tidy.
    }
  }, []);

  return (
    <div className="text-center mt-8">
      <Link
        href="/market"
        className="inline-block px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
      >
        Browse the collectors&apos; market
      </Link>
    </div>
  );
}
