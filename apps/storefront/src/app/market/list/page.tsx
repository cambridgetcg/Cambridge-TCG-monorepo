/**
 * /market/list — list a card in three steps.
 *
 * The P2P sell action used to hide behind a tab on the card page, ~9
 * steps from the market front door. This page is the friction killer:
 * search → confirm the exact printing → price it with the live book in
 * view → posted. Signed-out collectors build the whole listing and only
 * sign in to post; the draft survives the round-trip in localStorage
 * (the magic link opens in a new tab of the same browser).
 *
 * Server half: session check + commission bounds + pre-rendered
 * <Provenance> nodes (server-only) handed to the client wizard.
 */

import Link from "next/link";
import { auth } from "@/lib/auth";
import { Icon, WhyLink } from "@/lib/ui";
import ListingWizard from "@/components/market/ListingWizard";
import { catalogSourceBadges } from "@/components/market/source-provenance";
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
  const initialSku = (first(raw.sku) || "").trim() || null;

  const session = await auth();
  const isSignedIn = !!session?.user?.id;

  const backHref = game !== DEFAULT_GAME ? `/market?game=${encodeURIComponent(game)}` : "/market";

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition mb-4"
        >
          <span aria-hidden>←</span> The Collectors&rsquo; Market
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-2xl font-black tracking-tight text-ink mb-1.5 flex items-center gap-2">
            <Icon name="card" className="text-accent" /> List a card
          </h1>
          <p className="text-sm text-ink-muted">
            Pick the card, set your price, and it&rsquo;s live for every collector on its market
            page. Free to list, and free to sell — Cambridge TCG takes no commission.{" "}
            <WhyLink href="/methodology/fees" tooltip="How the free platform works" />
          </p>
        </div>

        <ListingWizard
          game={game}
          initialSku={initialSku}
          isSignedIn={isSignedIn}
          sourceBadges={catalogSourceBadges()}
        />
      </div>
    </div>
  );
}
