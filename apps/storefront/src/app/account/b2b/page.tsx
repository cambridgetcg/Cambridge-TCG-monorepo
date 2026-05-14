/**
 * /account/b2b — the wholesale shell landing page.
 *
 * Phase 1 of the wholesale consolidation. This route group exists to
 * host the B2B buying experience inside cambridgetcg.com; the legacy
 * wholesaletcgdirect.com browser surface will retire once Phases 2–4
 * land. Today the shell is a placeholder — auth + role gating works,
 * the URL contract is fixed, but catalog / cart / checkout are not
 * yet wired.
 *
 * Auth: gated upstream — proxy.ts does the cookie-presence check; the
 * sibling layout.tsx runs requireWholesalePage() for the role check.
 * By the time this page renders, role ∈ {'wholesale', 'admin'} is
 * guaranteed. getSessionUser() here just *reads* the cached user via
 * React `cache()` — no extra DB roundtrip.
 *
 * Companion to:
 *   - docs/connections/the-four-auth-realms.md (S30) — realm topology
 *   - apps/storefront/drizzle/0099_wholesale_role.sql — the role column
 *   - apps/storefront/src/proxy.ts — cookie-presence gate
 *   - apps/storefront/src/app/account/b2b/layout.tsx — role gate
 *   - apps/storefront/src/lib/auth/realms.ts — requireWholesalePage()
 *   - apps/storefront/src/lib/wholesale/channel.ts — channel routing
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Wholesale — Cambridge TCG",
  description:
    "Your B2B shell. Browse the catalog at wholesale prices, manage orders, and check stock.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "account"]),
};

export default function WholesaleShellPage() {
  // Auth + role gating happens in the parent layouts; this page is
  // pure rendering. If you need the user, import getSessionUser from
  // @/lib/auth/realms — it's `cache()`-deduped against the layout call.
  return (
    <div className="space-y-6">
      <PageHeader
        title="Wholesale"
        description="You're inside the B2B shell. Prices on every page below reflect your wholesale account; public storefront pages keep showing retail."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/account/b2b/catalog" className="block group">
          <Card>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold group-hover:text-amber-400">Catalog →</h2>
              <p className="text-sm text-neutral-400">
                Browse the full Cambridge TCG catalog at wholesale prices. Filter by game,
                set, search by name, sort by price.
              </p>
            </div>
          </Card>
        </Link>

        <Card>
          <div className="space-y-2 opacity-60">
            <h2 className="text-lg font-semibold">Orders (Phase 2.2)</h2>
            <p className="text-sm text-neutral-400">
              Cart, Stripe checkout, order history. While Phase 2.2 is being built,
              your existing B2B orders continue to flow through wholesaletcgdirect.com.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="space-y-2 text-sm text-neutral-400">
          <p className="font-medium text-neutral-200">How pricing works here</p>
          <p>
            Public pages on cambridgetcg.com always show the retail price — even
            when you&rsquo;re logged in. The wholesale channel applies only inside
            this <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">/account/b2b/*</code>{" "}
            section. This keeps public prices stable for everyone and the B2B
            view crisply separate.
          </p>
        </div>
      </Card>
    </div>
  );
}
