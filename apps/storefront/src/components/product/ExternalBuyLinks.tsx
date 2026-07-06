/**
 * ExternalBuyLinks — the "find this card elsewhere" block for /product/[sku].
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md): the
 * platform's own market is the primary CTA; this block sits BELOW it and
 * routes the reader outward to the other channels a card actually sells
 * on — CardRush (Japan), Cardmarket (Europe), eBay UK — plus a link to the
 * buying guide that explains each channel's cost, wait and import fees.
 *
 * Substrate honesty: every link is a pre-filled SEARCH on the other site
 * (we hold no external product IDs), so each wears a "search" badge and we
 * say plainly that we earn nothing when you click. The house is the map,
 * not the merchant.
 *
 * Pure presentational server component — no interactivity, no data fetch.
 */

import Link from "next/link";
import {
  buildExternalMarketLinks,
  type CardLinkFields,
} from "@/lib/buying/marketplace-links";
import type { SkuGameSlug } from "@/lib/games/sku-game";

export default function ExternalBuyLinks({
  card,
  gameSlug,
}: {
  card: CardLinkFields;
  gameSlug?: SkuGameSlug;
}) {
  const links = buildExternalMarketLinks(card, gameSlug);
  if (links.length === 0) return null;

  return (
    <div className="bg-surface border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">
          Find this card elsewhere
        </h3>
        <Link
          href="/guides/buying"
          className="text-xs text-accent hover:text-accent-strong transition shrink-0"
        >
          How each channel works &rarr;
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.channel}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-page px-3 py-2 hover:border-border-strong transition"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-ink font-medium truncate">{link.label}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-surface-subtle text-ink-faint text-[10px] uppercase tracking-wider">
                  {link.kind}
                </span>
              </span>
              <span
                className="shrink-0 text-ink-faint group-hover:text-accent transition"
                aria-hidden="true"
              >
                &#8599;
              </span>
            </a>
            {link.note && (
              <p className="text-xs text-ink-faint mt-1 px-1">{link.note}</p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-faint">
        Each opens a search on another site. We don&apos;t sell these cards and
        we earn nothing when you click — prices, stock and import fees all live
        on the other side.
      </p>
    </div>
  );
}
