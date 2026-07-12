/** Value-free per-set route while imported catalog/price rights are closed. */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Audience } from "@/lib/ui";
import { getPriceGuideConfig } from "@/lib/prices/games-config";

interface PageProps {
  params: Promise<{ game: string; set: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game, set } = await params;
  const config = getPriceGuideConfig(game);
  return {
    title: config
      ? `${set.toUpperCase()} — public data boundary · Cambridge TCG`
      : "Price guide not found — Cambridge TCG",
    description:
      "Structural set code only. Imported set and card values are withheld pending affirmative public reuse rights.",
    robots: { index: false, follow: true },
  };
}

export default async function SetPriceGuidePage({ params }: PageProps) {
  const { game, set } = await params;
  const config = getPriceGuideConfig(game);
  if (!config) notFound();
  const setCode = set.toUpperCase();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", game, setCode, "rights-gap"]} />
      <nav className="mb-8 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href={`/prices/${game}`} className="hover:text-ink">{config.short_name}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{setCode}</span>
      </nav>

      <h1 className="text-3xl font-bold text-ink mb-4">{setCode}</h1>
      <p className="text-ink-muted leading-relaxed mb-6">
        This URL preserves the structural set-code route. Imported set names,
        release dates, card counts, card names, images, rarities, prices,
        stock, and price-derived ordering are withheld under the current
        source-rights review.
      </p>
      <p className="rounded-lg border border-border-subtle bg-surface p-5 text-sm text-ink-muted mb-8">
        No absence or count is inferred from the restricted catalog. See the
        source registry for the reviewed decision and evidence.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/api/v1/sources" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Source registry
        </Link>
        <Link href="/licenses" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Rights and licences
        </Link>
      </div>
    </main>
  );
}
