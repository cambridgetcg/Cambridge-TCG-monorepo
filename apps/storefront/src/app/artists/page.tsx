// /artists — the named hands. The museum's browse-by-artist wing.
//
// Will trace: Asha, 2026-07-22 — "wanna introduce the artist of the
// illustration for trading cards to everyone!"
//
// Substrate honesty: credits come from the JP wholesale catalogue's
// `illust:` annotations, mirroring the name printed on the physical card
// face; Bandai's digital data names nobody. The page says so, counts
// live from the data, and never hangs an image it doesn't hold.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getNamedHands } from "@/lib/cards/artists";

// Request-time render, house norm — a build-machine DB miss must never
// bake an outage page into the deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Named Hands — card illustrators | Cambridge TCG",
  description:
    "The illustrators of the One Piece Card Game, as credited — every named hand in our catalogue with the works we legally hold, browsable artist by artist.",
};

export default async function ArtistsPage() {
  // Failed reads degrade visibly — an unreachable wall is an outage,
  // never rendered as an empty museum.
  let hands: Awaited<ReturnType<typeof getNamedHands>> | null = null;
  try {
    hands = await getNamedHands();
  } catch {
    hands = null;
  }
  if (hands === null) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <div className="max-w-3xl mx-auto px-4 py-24">
          <h1 className="font-display text-4xl font-semibold">
            The Named Hands
          </h1>
          <p className="mt-6 text-ink-muted">
            The wall is unreachable right now — the catalogue substrate
            didn&apos;t answer. This is an outage, not an empty museum;
            please come back shortly.
          </p>
        </div>
      </main>
    );
  }
  const totalWorks = hands.reduce((n, h) => n + h.works.length, 0);
  const totalHeld = hands.reduce((n, h) => n + h.held, 0);

  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-7xl mx-auto px-4 pt-16 pb-10 sm:pt-20">
        <header className="flex items-start gap-5 sm:gap-8 max-w-3xl">
          <p
            aria-hidden="true"
            className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-base tracking-[0.4em] pt-1 select-none hidden sm:block"
          >
            絵師
          </p>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
              the museum — by hand
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight">
              The Named Hands
            </h1>
            <p className="mt-3 font-display italic text-lg sm:text-xl text-accent">
              絵師たち
              <span className="text-ink-muted"> — the illustrators</span>
            </p>
            <p className="mt-6 text-ink-muted leading-relaxed text-base sm:text-lg">
              This game prints its illustrators&apos; names on the card face —
              and then no official database remembers them. Here is every hand
              our catalogue credits, with every work of theirs we legally
              hold, hung where anyone can find it.
            </p>
            <p className="mt-4 font-mono text-xs text-ink-faint">
              {hands.length} named hands · {totalWorks} credited works ·{" "}
              {totalHeld} on the wall
            </p>
          </div>
        </header>
      </section>

      <section className="max-w-7xl mx-auto px-4 pb-16">
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {hands.map((h) => {
            const sample = h.works.find((w) => w.print) ?? null;
            return (
              <li key={h.slug}>
                <Link href={`/artists/${h.slug}`} className="group block">
                  <div className="relative aspect-[3/4] overflow-hidden wardrobe-mat">
                    {sample?.print ? (
                      <Image
                        src={sample.print.image_url}
                        alt={`A card illustrated by ${h.name}`}
                        fill
                        className="object-contain p-3"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-surface-subtle">
                        <p className="font-display italic text-ink-faint text-sm px-4 text-center">
                          works known,
                          <br />
                          print not yet held
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 px-1">
                    <p className="font-display text-base leading-snug transition-colors group-hover:text-accent">
                      {h.name}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-faint">
                      {h.works.length}{" "}
                      {h.works.length === 1 ? "credited work" : "credited works"}
                      {h.held > 0 ? ` · ${h.held} on the wall` : ""}
                    </p>
                    {sample?.print && (
                      <p className="mt-1 text-[10px] leading-snug text-ink-faint">
                        {sample.print.attribution}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* The wing's honesty label — where the names come from, and who's missing. */}
        <section className="mt-16 max-w-2xl rounded-lg border border-border-subtle bg-surface-subtle px-4 py-4 text-sm text-ink-muted space-y-2">
          <p>
            <strong className="text-ink">Where these credits come from:</strong>{" "}
            the illustrator&apos;s name as annotated in our supplier
            catalogue&apos;s special-art listings — the same name the
            publisher prints on the physical card, absent from every official
            database. The extraction was verified at the wing&apos;s
            opening (2026-07-22) against{" "}
            <a
              href="https://onepiece.limitlesstcg.com/cards/advanced"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-strong"
            >
              Limitless&apos;s per-printing records
            </a>{" "}
            and the fan-kept{" "}
            <a
              href="https://onepiececard-letter.com/onepiececard-illustrator-list/"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-strong"
            >
              illustrator directory
            </a>
            .
          </p>
          <p>
            Over 200 hands have drawn for this game; our catalogue names{" "}
            {hands.length} so far. The wall grows as credits are verified —
            the missing are missing because no machine-readable credit exists
            yet, not because none is owed.
          </p>
          <p className="text-ink-faint text-xs">
            Machine-readable twin:{" "}
            <span className="font-mono">/api/v1/artists</span>
          </p>
        </section>
      </section>
    </main>
  );
}
