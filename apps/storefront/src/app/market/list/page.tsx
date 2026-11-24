/**
 * /market/list — the listing page, retired 2026-09-23.
 *
 * It keeps its address, says where existing listings and trades are, and has
 * no form. The listing wizard that stood here was removed on 2026-11-24.
 */

import Link from "next/link";
import { Icon } from "@/lib/ui";
import CommercialRetirementNotice from "@/components/CommercialRetirementNotice";
import { DEFAULT_GAME } from "@/components/market/catalog";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const game = (first(raw.game) || DEFAULT_GAME).trim() || DEFAULT_GAME;

  const backHref = game !== DEFAULT_GAME ? `/market?game=${encodeURIComponent(game)}` : "/market";

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition mb-4"
        >
          <span aria-hidden>←</span> Market records
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-2xl font-black tracking-tight text-ink mb-1.5 flex items-center gap-2">
            <Icon name="card" className="text-accent" /> Listing is retired
          </h1>
          <p className="text-sm text-ink-muted">
            New paid listings were retired on 23 September 2026. Existing listings can be cancelled
            from{" "}
            <Link href="/account/trades" className="text-accent hover:text-accent-strong">
              Trades
            </Link>
            , and existing trades still settle.
          </p>
        </div>

        <CommercialRetirementNotice />
      </div>
    </div>
  );
}
