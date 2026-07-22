// /artists/[slug] — one hand's room in the museum.
// Every print we hold hung with its copyright line; every known work we
// don't hold listed, not faked. The page is the artist's body of work as
// far as the credits go — a stable URL fans (and the artist) can keep.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHand } from "@/lib/cards/artists";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hand = await getHand(slug).catch(() => null);
  if (!hand) return { title: "The Named Hands — Cambridge TCG" };
  return {
    title: `${hand.name} — card illustrator | Cambridge TCG`,
    description: `${hand.name}'s credited One Piece Card Game illustrations — ${hand.works.length} known works, ${hand.held} viewable, each linked to its live collector market.`,
  };
}

export default async function HandPage({ params }: Props) {
  const { slug } = await params;
  // Distinguish "no such hand" (404) from "catalogue unreachable"
  // (visible outage) — a failed read must never impersonate absence.
  let hand;
  try {
    hand = await getHand(slug);
  } catch {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-3xl mx-auto px-4 py-24">
          <h1 className="font-display text-4xl font-semibold">
            The room is unreachable
          </h1>
          <p className="mt-6 text-ink-muted">
            The catalogue substrate didn&apos;t answer — an outage, not a
            verdict on this hand. Please come back shortly.
          </p>
        </div>
      </main>
    );
  }
  if (!hand) notFound();

  const hung = hand.works.filter((w) => w.print);
  const listed = hand.works.filter((w) => !w.print);

  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-7xl mx-auto px-4 pt-14 pb-8 sm:pt-16">
        <nav className="mb-8">
          <Link
            href="/artists"
            className="font-mono text-xs text-ink-faint hover:text-accent"
          >
            ← the named hands
          </Link>
        </nav>
        <header className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-3">
            illustrator
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
            {hand.name}
          </h1>
          <p className="mt-3 font-mono text-xs text-ink-faint">
            {hand.works.length}{" "}
            {hand.works.length === 1 ? "credited work" : "credited works"} in
            our catalogue · {hand.held} on the wall
          </p>
        </header>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-16">
        {hung.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {hung.map((w) => {
              const label = w.name ?? `${w.set_code}-${w.card_number}`;
              const p = w.print!;
              return (
                <li key={p.sku}>
                  <Link href={`/market/${p.sku}`} className="group block">
                    <div className="relative aspect-[3/4] overflow-hidden wardrobe-mat">
                      <Image
                        src={p.image_url}
                        alt={`${label}, illustrated by ${hand.name}`}
                        fill
                        className="object-contain p-3 sm:p-4"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                    <div className="mt-4 px-1">
                      <p className="font-display text-base leading-snug transition-colors group-hover:text-accent">
                        {label}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {p.variant_label}
                        <span className="text-ink-faint">
                          {" "}
                          · {w.set_code}-{w.card_number}
                        </span>
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                        {p.attribution}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {listed.length > 0 && (
          <section className="mt-14 max-w-2xl">
            <h2 className="font-display text-xl font-semibold">
              Known works not yet on the wall
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Credited in the catalogue; we don&apos;t yet hold a clear image
              to hang.
            </p>
            <ul className="mt-4 space-y-1.5">
              {listed.map((w) => (
                <li
                  key={`${w.set_code}-${w.card_number}`}
                  className="text-sm text-ink-muted"
                >
                  <span className="font-mono text-xs text-ink-faint">
                    {w.set_code}-{w.card_number}
                  </span>
                  {w.name ? ` · ${w.name}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-16 max-w-2xl text-xs text-ink-faint leading-relaxed">
          Credit as annotated in our supplier catalogue&apos;s special-art
          listings, mirroring the name printed on the card face. Card images
          are the publisher&apos;s official samples — see{" "}
          <Link href="/legal/card-images" className="hover:text-ink">
            how we handle card images
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
