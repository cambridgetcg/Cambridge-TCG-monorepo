/**
 * /account/b2b/cards/[sku] — signed-in structural card detail.
 *
 * Stock remains numeric for B2B planning. Legacy price and image fields are
 * withheld; account authentication does not create source rights.
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
import { B2B_PURCHASE_AVAILABILITY } from "@/lib/b2b/purchase-availability";

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
    description: `Structural B2B catalog record for ${name} (${card.card_number}); legacy price and image values are withheld.`,
    other: audienceMetadata("consumer", ["wholesale", "b2b", "card", card.sku]),
  };
}

export default async function B2BCardDetailPage({ params }: PageProps) {
  const { sku } = await params;
  const card = await fetchCard(sku, "wholesale");
  if (!card) notFound();

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
        className="inline-block text-sm text-ink-muted hover:text-accent"
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
              className="rounded-lg border border-border-subtle"
            />
          ) : (
            <div className="aspect-[5/7] rounded-lg border border-border-subtle bg-surface flex items-center justify-center text-ink-faint text-xs">
              No image
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs uppercase tracking-wider text-ink-faint">
                  Legacy price
                </span>
                <span className="text-lg font-semibold text-ink-faint">
                  Withheld
                </span>
              </div>
              <div className="text-xs text-ink-faint">
                {B2B_PURCHASE_AVAILABILITY.reason} This page cannot add a new
                cart item or create a checkout session.
              </div>
            </div>
          </Card>

          <Card>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">UK on-hand stock</span>
                <span
                  className={
                    "font-mono " + (card.stock > 0 ? "text-ok" : "text-ink-faint")
                  }
                >
                  {card.stock}
                </span>
              </div>
              {card.pending_stock > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Pending (ordered)</span>
                  <span className="font-mono text-accent">+{card.pending_stock}</span>
                </div>
              )}
              {card.updated_at && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">Last synced</span>
                  <span className="text-ink-faint text-xs">
                    {new Date(card.updated_at).toISOString().slice(0, 10)}
                  </span>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-faint">SKU</dt>
              <dd className="font-mono text-xs text-ink-muted">{card.sku}</dd>
              <dt className="text-ink-faint">Set</dt>
              <dd>
                {card.set_name ? `${card.set_name} (${card.set_code ?? "?"})` : card.set_code ?? "—"}
              </dd>
              <dt className="text-ink-faint">Rarity</dt>
              <dd>{card.rarity ?? "—"}</dd>
              <dt className="text-ink-faint">Category</dt>
              <dd>{card.category ?? "—"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
