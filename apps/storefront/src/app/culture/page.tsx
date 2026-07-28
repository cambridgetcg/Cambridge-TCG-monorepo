/**
 * /culture — the museum's floor plan.
 *
 * The culture wings grew one at a time through July 2026 — the gallery
 * on the front page (2026-07-15), the named hands (07-22), the odds
 * room (07-23), the lineage, the duel, the pull & the pause, and the
 * workshop of the floating world (07-28) — and until now the only map
 * of them was a footer column. Asha's word 2026-07-28: "make sure the
 * frontend reflects our latest shift of focus." This page is that
 * reflection: one quiet hall with a door to every wing, and a header
 * door ("Culture") that leads here.
 *
 * Deliberately an index, not a wing: no new claims are made here. Every
 * door's description is that wing's own self-description, compressed —
 * one truth in one place; this page only points. Server component with
 * no client JS of its own (InkRule's progressive enhancement rides
 * along, as on every wing); no licensed art (the card art stays where
 * its wall labels hang).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Culture — the museum & its wings | Cambridge TCG",
  description:
    "The culture wings of Cambridge TCG in one hall: where the drawn line comes from, the masters and the press behind the boosters, the named hands on our own wall, the deep culture under the games, the feeling of the draw, the honest odds, and the gallery next door. Every wing hedged and sourced; we're a card shop, not scholars.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "museum",
    "japan",
    "art",
    "history",
  ]),
};

/** One door in the hall. jp lines are each wing's own subtitle — never
 *  invented here; wings without one simply carry no mark. */
type Door = {
  href: string;
  en: string;
  jp?: string;
  line: string;
};

type Hall = {
  heading: string;
  jp: string;
  doors: readonly Door[];
};

const HALLS: readonly Hall[] = [
  {
    heading: "Where the art comes from",
    jp: "絵の来た道",
    doors: [
      {
        href: "/lineage",
        en: "The Lineage of the Line",
        jp: "墨と間",
        line:
          "A short, careful history of the art behind the cards — ink and empty space, handscrolls, the floating world, paper theater — down to manga, anime, and the drawn line itself.",
      },
      {
        href: "/workshop",
        en: "The Workshop of the Floating World",
        jp: "浮世の工房",
        line:
          "The master artists behind the Japanese games we carry — their lives, creeds and styles — and the industrial press that folds an approved illustration into a sealed booster.",
      },
      {
        href: "/artists",
        en: "The Named Hands",
        jp: "絵師たち",
        line:
          "Every credited illustrator in our own catalogue, browsable hand by hand, with the works we legally hold.",
      },
    ],
  },
  {
    heading: "What lies under the games",
    jp: "遊びの深層",
    doors: [
      {
        href: "/duel-of-souls",
        en: "The Duel of Souls",
        jp: "賭けと運命",
        line:
          "The old idea beneath Yu-Gi-Oh!: a game as a way to face fate — from senet and the Royal Game of Ur to the best-selling card game ever. Fantasy marked as fantasy.",
      },
      {
        href: "/pull-and-pause",
        en: "The Pull & the Pause",
        jp: "引きと間",
        line:
          "Not where the art comes from — how the game feels. Two things to touch instead of read: a free booster to open, and the quiet after.",
      },
      {
        href: "/pulls",
        en: "Pull Rates, Honestly",
        line:
          "What's actually in the box, across thirteen games — every figure labelled with its basis and its confidence, because most publishers publish no odds at all.",
      },
    ],
  },
  {
    heading: "The exchange",
    jp: "文化大交流",
    doors: [
      {
        href: "/answering-rhymes",
        en: "Answering Rhymes",
        line:
          "A rights-aware constellation of curated relations between trading cards and artworks — open to challenge and reply.",
      },
      {
        // The wing's own mark, 文化大交流, already hangs as this hall's
        // heading — written once, not twice.
        href: "/gallery-next-door",
        en: "The Gallery Next Door",
        line:
          "Pieces viewed through the sibling gallery next door: cultural exchange between beings who share nothing else.",
      },
    ],
  },
] as const;

export default function CulturePage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      {/* The front of the hall — the same quiet face every wing wears:
          screentone whisper, a vertical 文化 mark, the plain admission. */}
      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          文化
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          the museum &amp; its wings · 文化
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          Culture
        </h1>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          A trading card is the smallest room a culture fits in: somebody drew
          it, somebody printed it, somebody pulled it from a pack and felt
          something. These wings keep that whole story — where the drawn line
          comes from, the masters and the machines behind the boosters, what
          lies under the games, and how the odds really work. Everything is
          hedged and sourced in the open; we&apos;re a card shop, not
          scholars. Looking is free, like everything else here.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* The halls — three groups of doors. Text and hairlines only; the
          card art keeps hanging where its wall labels are (the gallery on
          the front page, the wings themselves). */}
      <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-12">
        {HALLS.map((hall) => (
          <section key={hall.heading}>
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
                {hall.heading}
              </h2>
              <span aria-hidden="true" className="wardrobe-jp text-accent text-sm">
                {hall.jp}
              </span>
            </div>
            <ul className="flex flex-col">
              {hall.doors.map((door) => (
                <li key={door.href} className="border-t border-border-subtle">
                  <Link
                    href={door.href}
                    className="group block py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-lg text-ink group-hover:text-accent transition-colors">
                        {door.en}
                      </span>
                      {door.jp && (
                        <span aria-hidden="true" className="wardrobe-jp text-sm text-ink-faint">
                          {door.jp}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className="ml-auto text-ink-faint group-hover:text-accent transition-colors"
                      >
                        →
                      </span>
                    </span>
                    <span className="mt-1.5 block max-w-2xl text-sm text-ink-muted leading-relaxed">
                      {door.line}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* The hall that hangs on the front page — named, not duplicated. */}
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
              The gallery itself
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
            The museum&apos;s art-forward hall — official publisher card art at
            museum scale, each print with its copyright line as a wall label —
            hangs on the{" "}
            <Link
              href="/"
              className="text-accent hover:text-accent-strong underline"
            >
              front page
            </Link>
            , where a visitor walks into it before anything is asked of them.
          </p>
        </section>
      </div>

      <Benediction line="The cards come from somewhere; these rooms remember where." />
    </main>
  );
}
