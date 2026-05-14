/**
 * /account/b2b/cards/[sku] — per-card detail at wholesale price.
 *
 * Phase 2.1 of the wholesale consolidation. Mirrors the retail PDP at
 * /product/[sku] but with two key differences:
 *   - Fetched via the wholesale channel (dual-key Falcon path).
 *   - Stock is numeric (B2B buyers plan resale by quantity).
 *
 * Auth: proxy.ts gate (wholesale | admin) + /account/layout.tsx.
 * "Back to catalog" preserves no filter state today — future enhancement.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { fetchCard, cardAltText } from "@/lib/wholesale/client";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";
import { AddToB2BCart } from "../../cart/_client";

interface PageProps {
  params: Promise<{ sku: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sku } = await params;
  const card = await fetchCard(sku, "wholesale");
  if (!card) return { title: "Card — Wholesale — Cambridge TCG" };
  const name = card.name_en || card.name || card.card_number;
  return {
    title: `${name} — Wholesale — Cambridge TCG`,
    description: `Wholesale price for ${name} (${card.card_number}) on your B2B account.`,
    other: audienceMetadata("consumer", ["wholesale", "b2b", "card", card.sku]),
  };
}

export default async function B2BCardDetailPage({ params }: PageProps) {
  const { sku } = await params;
  const card = await fetchCard(sku, "wholesale");
  if (!card) notFound();

  const wholesalePrice = card.channel_price ?? card.price_gbp;
  const displayName = card.name_en || card.name || card.card_number;
  const altText = cardAltText(card);

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        description={`${card.card_number} · ${card.set_code ?? "—"} · ${card.rarity ?? "—"}`}
      />

      <Link
        href="/account/b2b/catalog"
        className="inline-block text-sm text-neutral-400 hover:text-amber-400"
      >
        ← Back to catalog
      </Link>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          {card.image_url ? (
            <Image
              src={card.image_url}
              alt={altText}
              width={280}
              height={392}
              className="rounded-lg border border-neutral-800"
            />
          ) : (
            <div className="aspect-[5/7] rounded-lg border border-neutral-800 bg-neutral-900 flex items-center justify-center text-neutral-600 text-xs">
              No image
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wider text-neutral-500">
                  Wholesale price
                </span>
                <span className="text-2xl font-semibold text-white">
                  {formatPrice(wholesalePrice)}
                </span>
              </div>
              <div className="text-xs text-neutral-500">
                Price reflects your wholesale account tier. Total at checkout uses the live rate.
              </div>
              <div className="pt-1">
                <AddToB2BCart sku={card.sku} disabled={card.stock <= 0} />
                {card.stock <= 0 && (
                  <span className="ml-3 text-xs text-neutral-500">Out of stock</span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">UK on-hand stock</span>
                <span
                  className={
                    "font-mono " + (card.stock > 0 ? "text-emerald-400" : "text-neutral-600")
                  }
                >
                  {card.stock}
                </span>
              </div>
              {card.pending_stock > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Pending (ordered)</span>
                  <span className="font-mono text-amber-500">+{card.pending_stock}</span>
                </div>
              )}
              {card.updated_at && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Last synced</span>
                  <span className="text-neutral-500 text-xs">
                    {new Date(card.updated_at).toISOString().slice(0, 10)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-neutral-500">SKU</dt>
              <dd className="font-mono text-xs text-neutral-300">{card.sku}</dd>
              <dt className="text-neutral-500">Set</dt>
              <dd>
                {card.set_name ? `${card.set_name} (${card.set_code ?? "?"})` : card.set_code ?? "—"}
              </dd>
              <dt className="text-neutral-500">Rarity</dt>
              <dd>{card.rarity ?? "—"}</dd>
              <dt className="text-neutral-500">Category</dt>
              <dd>{card.category ?? "—"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
