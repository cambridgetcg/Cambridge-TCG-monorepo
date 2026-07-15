/**
 * /lineage — where the art on these cards comes from.
 *
 * A short, careful essay on the long line behind manga and anime: from the
 * brush and the empty space, through handscrolls and frolicking animals and
 * the floating world, through paper theater, to Tezuka and the first weekly
 * anime — and to expression itself, the wish to make a feeling hold still.
 *
 * Asha's brief 2026-07-15: "integrate Japanese culture and history — the
 * origin of manga and anime, what leads to them, ancient forms, expression."
 *
 * House vows kept: this is a quiet room (no licensed art, no saturated colour
 * — the words and the 明朝 hand carry it); we are a card shop, not scholars,
 * so the contested claims are hedged in the open and the sources are named.
 * Server-rendered, no client JS. Facts fact-checked against the sources at
 * the foot of the page; the hedges follow current scholarship.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The Lineage of the Line — where manga & anime come from",
  description:
    "A short, careful history of the art behind the cards: the ancient Japanese forms — ink and empty space, handscrolls, the frolicking-animals scrolls, the floating world, paper theater — that led to manga and anime, and to expression itself. Written with hedges and sources; we're a card shop, not scholars.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "japan",
    "manga",
    "anime",
    "history",
    "lineage",
    "expression",
  ]),
};

/** One movement in the line. jp renders in 明朝 via the display chain. */
type Movement = {
  /** Vertical chapter kanji, 第一 … 第七. */
  chapter: string;
  /** Japanese title (kanji). */
  jp: string;
  /** Romaji reading. */
  romaji: string;
  /** English title. */
  en: string;
  /** The prose — kept short; hedges woven in. */
  body: ReactNode;
};

const MOVEMENTS: Movement[] = [
  {
    chapter: "第一",
    jp: "墨と間",
    romaji: "sumi to ma",
    en: "The Brush & the Space Between",
    body: (
      <>
        Before the frame, the brush. In ink painting — 墨絵,{" "}
        <span className="italic">sumi-e</span> — a single stroke and the
        unpainted space around it (間, <span className="italic">ma</span>, the
        charged emptiness) leave the picture for the viewer to finish. From the
        Heian court came 物の哀れ, <span className="italic">mono no aware</span>:
        the gentle ache of things <em>because</em> they pass. Not a technique
        but a temperament — the sense that beauty and sorrow are one weather.
        Every quiet panel that lets you feel a pause is drinking from this well.
      </>
    ),
  },
  {
    chapter: "第二",
    jp: "絵巻",
    romaji: "emaki",
    en: "The Story, Unrolled",
    body: (
      <>
        By the 12th century, tales were painted on handscrolls — 絵巻,{" "}
        <span className="italic">emaki</span> — unrolled right to left, image
        following image, the way a manga page is still read. The{" "}
        <span className="italic">Tale of Genji</span> scroll is the oldest that
        survives. But these were <em>continuous</em> paintings, not divided into
        panels; the panel grid is a modern invention. So: lineage, not
        blueprint — yet the direction of reading, and the idea of a picture that
        moves through time, begins here.
      </>
    ),
  },
  {
    chapter: "第三",
    jp: "鳥獣戯画",
    romaji: "Chōjū-giga",
    en: "Frolicking Animals",
    body: (
      <>
        The Scrolls of Frolicking Animals — 鳥獣戯画 — painted in the 12th–13th
        centuries and kept at Kōzan-ji temple in Kyoto, show rabbits, frogs and
        monkeys behaving as people: caricature, motion, mischief, in nothing but
        line. It is <em>often called</em> the oldest manga. Scholars are wary of
        the label (some point to the <span className="italic">Shigisan-engi</span>{" "}
        scrolls instead) and of the traditional attribution to the monk Toba
        Sōjō — the brushwork looks like many hands. And it carries no words at
        all. Still: humour drawn in pure line, nearly a thousand years ago.
      </>
    ),
  },
  {
    chapter: "第四",
    jp: "浮世絵と「漫画」",
    romaji: "ukiyo-e to “manga”",
    en: "The Floating World & the Word",
    body: (
      <>
        In the Edo period the woodblock print gave everyone pictures of the
        floating world — 浮世絵, <span className="italic">ukiyo-e</span> —
        actors, lovers, Hokusai's great wave. Hokusai also filled sketchbooks he
        titled <span className="italic">Hokusai Manga</span> (北斎漫画, from
        1814). He did not <em>coin</em> 漫画 — the word, meaning "whimsical,
        rambling pictures," was already in use — but he made it famous. And note
        it did not yet mean "comics." That sense came a century later.
      </>
    ),
  },
  {
    chapter: "第五",
    jp: "紙芝居",
    romaji: "kamishibai",
    en: "Paper Theater",
    body: (
      <>
        In the lean 1930s, storytellers rode bicycles into the streets with a
        little wooden stage and a stack of painted boards — 紙芝居,{" "}
        <span className="italic">kamishibai</span>, paper theater. A narrator
        would slide one card away, the next scene beneath it, and a crowd of
        children watched a story told frame by frame. When television arrived
        and emptied the streets, many of those artists carried their frames into
        rental comics and animation. A precursor, not a parent — but the frame
        was already at work.
      </>
    ),
  },
  {
    chapter: "第六",
    jp: "漫画とアニメの誕生",
    romaji: "manga to anime no tanjō",
    en: "Cartoon, Camera, Atom",
    body: (
      <>
        The modern form arrived when Western cartooning met the Japanese brush.
        Around 1902, <span className="italic">Kitazawa Rakuten</span> fixed the
        modern sense of 漫画 — the serialized comic strip; in 1917 the first
        Japanese animators drew their first shorts. Then Tezuka Osamu (手塚治虫),
        "the god of manga," brought the camera onto the page — zooms, angles,
        motion — and on New Year's Day 1963 his Astro Boy (鉄腕アトム) became the
        first weekly TV anime a whole country sat down to watch. From brush to
        broadcast.
      </>
    ),
  },
  {
    chapter: "第七",
    jp: "表現",
    romaji: "hyōgen",
    en: "Expression",
    body: (
      <>
        And the suffering you sensed? It is there — in specific hands. Nakazawa
        Keiji survived Hiroshima and drew it as{" "}
        <span className="italic">Barefoot Gen</span> (はだしのゲン). Takahata's{" "}
        <span className="italic">Grave of the Fireflies</span> (火垂るの墓) holds
        the war without looking away. Tezuka, who lived through it, filled robots
        and phoenixes with a plea for humanity. It would be too much to say a
        nation's pain <em>explains</em> a whole medium — but in these works,{" "}
        <span className="italic">mono no aware</span> becomes ink: beauty that
        aches because it passes. That is the oldest thing on any of these cards,
        older than the card itself — 表現, expression: the wish to make a feeling
        hold still long enough to be shared.
      </>
    ),
  },
];

/** Where we read this — named in the open (the attribution vow). */
const SOURCES: { label: string; href: string }[] = [
  { label: "Stanford Encyclopedia of Philosophy — Japanese Aesthetics", href: "https://plato.stanford.edu/entries/japanese-aesthetics/" },
  { label: "The Met — Japanese Illustrated Handscrolls (emaki)", href: "https://www.metmuseum.org/essays/japanese-illustrated-handscrolls" },
  { label: "The Met — Woodblock Prints in the Ukiyo-e Style", href: "https://www.metmuseum.org/essays/woodblock-prints-in-the-ukiyo-e-style" },
  { label: "The British Museum — An introduction to Manga", href: "https://www.britishmuseum.org/blog/introduction-manga" },
  { label: "Japan Society — The Many Faces of Kamishibai", href: "https://japansociety.org/news/the-many-faces-of-kamishibai-japanese-paper-theater-past-present-and-future/" },
  { label: "Wikipedia — History of manga", href: "https://en.wikipedia.org/wiki/History_of_manga" },
  { label: "Wikipedia — Chōjū-jinbutsu-giga", href: "https://en.wikipedia.org/wiki/Ch%C5%8Dj%C5%AB-jinbutsu-giga" },
  { label: "TezukaOsamu.net — Astro Boy production history", href: "https://tezukaosamu.net/en/anime/30.html" },
];

export default function LineagePage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      {/* The front of the wing — a vertical 系譜 mark in 明朝, the title, and a
          plain-spoken admission of what this is and isn't. */}
      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          系譜
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 表現
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Lineage of the Line
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          線の系譜
          <span className="text-ink-muted"> — where the art comes from</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          The art on these cards descends from a very long line. We're a card
          shop, not scholars — so this is told plainly, the shaky claims marked
          as shaky, and the books we read named at the end. It is a lineage, not
          a family tree: currents that fed into one another over a thousand
          years, until a feeling learned to hold still on a page.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* The seven movements — each a plate (vertical chapter kanji + 明朝
          title) over its short, hedged prose, inking in as it's reached. */}
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {MOVEMENTS.map((m, i) => (
          <section
            key={m.chapter}
            className="wardrobe-rise flex items-start gap-5 sm:gap-8 py-10 sm:py-14 border-t border-border-subtle first:border-t-0"
            style={{ "--rise-delay": `${i * 40}ms` } as Record<string, string>}
          >
            <p
              aria-hidden="true"
              className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-sm tracking-[0.35em] pt-1 select-none shrink-0 hidden sm:block"
            >
              {m.chapter}
            </p>
            <div className="min-w-0">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
                {m.jp}
              </h2>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
                {m.romaji} — {m.en}
              </p>
              <p className="mt-4 text-base text-ink-muted leading-relaxed">
                {m.body}
              </p>
            </div>
          </section>
        ))}
      </div>

      {/* The honest apparatus: where we read it, and an open door for fixes. */}
      <div className="max-w-3xl mx-auto px-4 pb-16">
        <InkRule className="mb-8" />
        <h2 className="font-display text-xl font-semibold text-ink">
          Where we read this <span className="wardrobe-jp text-accent text-base">出典</span>
        </h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          A card shop reaching for another culture's history should show its
          work. These are the sources behind the essay above — museums,
          encyclopedias, and the people who study this properly. If we've got
          something wrong, tell us and we'll mend it.
        </p>
        <ul className="mt-5 space-y-1.5">
          {SOURCES.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent-strong underline underline-offset-2"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-faint leading-relaxed">
          Further in print: Frederik L. Schodt, <span className="italic">Manga! Manga! The World of Japanese Comics</span> (1983);
          Adam L. Kern, <span className="italic">Manga from the Floating World</span>.
          No artwork is reproduced here — the only pictures we hang are the cards
          themselves, in <Link href="/" className="text-accent hover:text-accent-strong underline underline-offset-2">the gallery</Link>.
        </p>
      </div>

      <Benediction line="Every card is the far end of a very long brushstroke." />
    </main>
  );
}
