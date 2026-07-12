import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Audience } from "@/lib/ui";
import { getPriceGuideConfig } from "@/lib/prices/games-config";

interface PageProps {
  params: Promise<{ game: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game } = await params;
  const config = getPriceGuideConfig(game);
  if (!config) return { title: "Movers - not found" };
  return {
    title: `${config.short_name} movers unavailable - Cambridge TCG`,
    description:
      "The historical CardRush-derived movers view is withheld pending written source and publication permission.",
  };
}

export default async function GameMoversPage({ params }: PageProps) {
  const { game } = await params;
  const config = getPriceGuideConfig(game);
  if (!config) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience
        kind="public-documentation"
        contexts={["prices", config.slug, "movers", "publication-status"]}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted mb-8">
        <Link href="/prices" className="hover:text-ink">Price guides</Link>
        <span className="mx-2 text-ink-faint">/</span>
        <Link href={`/prices/${config.slug}`} className="hover:text-ink">
          {config.short_name}
        </Link>
        <span className="mx-2 text-ink-faint">/</span>
        <span className="text-ink">Movers</span>
      </nav>

      <h1 className="text-3xl font-bold text-ink mb-4">
        {config.short_name} movers are unavailable
      </h1>
      <div className="border border-border-subtle bg-surface p-5 rounded-lg space-y-3">
        <p className="text-sm text-ink-muted leading-relaxed">
          This view previously derived price changes from stored CardRush
          observations. Percent changes and channel-price transformations retain
          that source lineage; they are not a new permission to publish.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed">
          Cambridge TCG has no recorded written partnership or downstream
          publication permission for those values, so the route returns no rows
          and performs no archive read.
        </p>
        <a
          href="https://cardrush.media/data_policy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent underline"
        >
          CardRush data policy
        </a>
      </div>
    </main>
  );
}
