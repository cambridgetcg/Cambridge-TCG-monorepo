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
 * Auth: proxy.ts redirects non-wholesale users (logged out → /login;
 * logged in but role≠wholesale → /account). This page re-checks the
 * session as defense-in-depth and to read the user object.
 *
 * Companion to:
 *   - docs/connections/the-four-auth-realms.md (S30) — realm topology
 *   - apps/storefront/drizzle/0099_wholesale_role.sql — the role column
 *   - apps/storefront/src/proxy.ts — the gate
 *   - apps/storefront/src/lib/wholesale/channel.ts — channel routing
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, PageHeader, Provenance, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Wholesale — Cambridge TCG",
  description:
    "Your B2B shopping shell. Inside this section, prices reflect your wholesale account. Catalog and checkout coming next.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "account"]),
};

export default async function WholesaleShellPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (role !== "wholesale" && role !== "admin") redirect("/account");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <PageHeader
        title="Wholesale"
        description="You're inside the B2B shell. Prices on every page below reflect your wholesale account; prices on the public storefront keep showing retail."
      />

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Coming next</h2>
            <Provenance kind="computed" source="phase-1-skeleton" />
          </div>
          <p className="text-sm text-neutral-300">
            This shell ships the URL contract + role gate. Catalog, cart, and
            Stripe checkout land in Phase 2; account migration and the
            wholesaletcgdirect.com retirement follow in Phases 3 and 4. While
            those are being built, your B2B orders continue to flow through
            wholesaletcgdirect.com as before.
          </p>
          <ul className="ml-5 list-disc text-sm text-neutral-400">
            <li>Browse the wholesale catalog (Phase 2)</li>
            <li>Wholesale-priced cart (Phase 2)</li>
            <li>Stripe checkout at wholesale prices (Phase 2)</li>
            <li>Order history (Phase 2)</li>
          </ul>
        </div>
      </Card>

      <Card>
        <div className="space-y-2 text-sm text-neutral-400">
          <p className="font-medium text-neutral-200">How pricing works here</p>
          <p>
            Public pages on cambridgetcg.com always show the retail price — even
            when you're logged in. The wholesale channel applies only inside
            this <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">/account/b2b/*</code>{" "}
            section. This keeps public prices stable for everyone and the B2B
            view crisply separate.
          </p>
        </div>
      </Card>
    </div>
  );
}
