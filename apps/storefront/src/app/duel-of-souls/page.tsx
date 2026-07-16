/**
 * /duel-of-souls — the deep culture behind Yu-Gi-Oh!.
 *
 * A companion to /lineage. Where that essay traces the line of the DRAWING
 * (manga & anime), this one traces the line of the GAME: from ancient boards
 * played against fate — the Royal Game of Ur, Egypt's senet — through the
 * fantasy-Egypt engine Yu-Gi-Oh runs on, to Kazuki Takahashi and the
 * best-selling card game there has ever been. The through-line is the oldest
 * one: a game as a way to face fate, death, and the self.
 *
 * Asha's brief 2026-07-16: "yugioh lah! Deep culture."
 *
 * House vows kept: a quiet room (no licensed art, no game logos — words and
 * the 明朝 hand carry it); the fantasy-Egypt is marked as fantasy, not
 * Egyptology; contested claims are hedged in the open; sources named at the
 * foot. Facts fact-checked against those sources; the hedges follow current
 * scholarship and careful reporting. Server-rendered, no client JS.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The Duel of Souls — the deep culture behind Yu-Gi-Oh!",
  description:
    "The old idea under Yu-Gi-Oh!: a game as a way to face fate and death. From the Royal Game of Ur and Egypt's senet — a board the living played that also mapped the soul's passage through the underworld — through the fantasy-Egypt of the Millennium Items and the Egyptian God Cards, to Kazuki Takahashi and the best-selling card game ever. Fantasy marked as fantasy; sources named.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "japan",
    "egypt",
    "yugioh",
    "history",
    "games",
    "expression",
  ]),
};

/** One movement in the line. jp renders in 明朝 via the display chain. */
type Movement = {
  /** Vertical chapter kanji, 第一 … 第七. */
  chapter: string;
  /** Japanese / transliterated title. */
  jp: string;
  /** Reading. */
  romaji: string;
  /** English title. */
  en: string;
  /** The prose — kept short; hedges woven in. */
  body: ReactNode;
};

const MOVEMENTS: Movement[] = [
  {
    chapter: "第一",
    jp: "賭けと運命",
    romaji: "kake to unmei",
    en: "Games Against Fate",
    body: (
      <>
        Long before games were entertainment, people played them to touch what
        they could not control — luck, the gods, fate. The oldest board we can
        still hold, the <span className="italic">Royal Game of Ur</span>, was
        buried in a Mesopotamian royal grave around 2600 BCE. A Babylonian
        tablet from far later — 177 BCE — records its rules and notes that its
        squares were also read for fortune-telling. A race of counters, and a
        way to ask the future a question.
      </>
    ),
  },
  {
    chapter: "第二",
    jp: "セネト",
    romaji: "senet",
    en: "The Board That Was a Passage",
    body: (
      <>
        In Egypt they played <span className="italic">senet</span> (znt,
        "passing"), attested from the First Dynasty, around 3100 BCE. The living
        enjoyed it — but by the New Kingdom the same board had become a map of
        the soul's journey through the <span className="italic">Duat</span>, the
        underworld: each square a hazard on the way, the dead playing against an
        opponent no one could see. It appears in the{" "}
        <span className="italic">Book of the Dead</span>, and Queen Nefertari is
        painted at the board in her tomb. Its true rules are lost — what we
        "know" is careful modern reconstruction. Here is the oldest ancestor of
        a duel of souls: a game the living loved that doubled as a passage
        through death.
      </>
    ),
  },
  {
    chapter: "第三",
    jp: "闇のゲーム",
    romaji: "yami no gēmu",
    en: "The Shadow Game",
    body: (
      <>
        Three thousand years later — in fiction — a boy named Yugi (遊戯,
        "play") solves an ancient Egyptian puzzle and wakes the spirit of a
        pharaoh. (The Japanese original says 3,000 years; the English dub
        inflated it to 5,000.) The Millennium Items (千年アイテム) and the Shadow
        Games — 闇のゲーム, literally "games of darkness," played for a soul —
        borrow real Egyptian furniture: the <span className="italic">ka</span>{" "}
        and <span className="italic">ba</span> (a person's life-force and soul),
        Ma'at's feather of truth, the weighing of the heart, the Duat. But say
        it plainly: this is a romanticized, fantasy Egypt, not Egyptology. The
        game does not teach the past — it uses it as an engine of meaning.
      </>
    ),
  },
  {
    chapter: "第四",
    jp: "三幻神",
    romaji: "Sangenshin",
    en: "Three Phantom Gods",
    body: (
      <>
        At the story's summit stand the Egyptian God Cards — 三幻神, the "three
        phantom gods." Here is a small, honest lesson in how myth gets made: of
        the three, only two carry the names of real deities — Osiris (the
        Japanese name of the card the West calls "Slifer") and Ra. The third,
        Obelisk, is a monument, not a god. And "Slifer" honours no pharaoh at
        all: it is the surname of Roger Slifer, a producer on the English dub.
        A reverent surface; playful, commercial machinery underneath.
      </>
    ),
  },
  {
    chapter: "第五",
    jp: "高橋和希",
    romaji: "Takahashi Kazuki",
    en: "The King of Games",
    body: (
      <>
        The hand behind it was Kazuki Takahashi (高橋和希, born 1961).{" "}
        <span className="italic">Yu-Gi-Oh!</span> — 遊☆戯☆王, "King of Games" —
        began in <span className="italic">Weekly Shōnen Jump</span> in 1996 as a
        manga about games in general; the card game inside it, "Magic &amp;
        Wizards," grew so beloved it took over the story. He died in 2022, found
        in the sea off Nago, Okinawa; the authorities confirmed drowning, and no
        crime. It was later reported — attributed to a U.S. Army major, Robert
        Bourgeau, in <span className="italic">Stars and Stripes</span> — that he
        drowned trying to help swimmers caught in a rip current. We pass that on
        as it was given: a report, honestly sourced, about a life that ended in
        the water.
      </>
    ),
  },
  {
    chapter: "第六",
    jp: "二百五十億",
    romaji: "nihyaku-gojū oku",
    en: "Tens of Billions",
    body: (
      <>
        And the object itself. <span className="italic">Magic: The Gathering</span>{" "}
        (1993) was the first <em>modern</em> trading card game; Konami launched
        Yu-Gi-Oh's Official Card Game in Japan in 1999, and the international
        game in 2002. It became the best-selling trading card game there has
        ever been — more than 25 billion cards certified sold by 2011 (the "35
        billion" figure you'll see quoted is an estimate, not a certified
        count). A myth about ancient games became a physical thing, traded by
        the tens of billions. It is the reason a museum for TCG can exist at all.
      </>
    ),
  },
  {
    chapter: "第七",
    jp: "魂",
    romaji: "tamashii",
    en: "The Duel of Souls",
    body: (
      <>
        So the line runs from a board that mapped the soul's passage through
        death to a card game about duelling souls — and it was never really
        about winning. From senet to the Shadow Game, people have played to face
        what they cannot control: fate, the dead, the self. That is the oldest
        thing in the deck, older than any card — 魂,{" "}
        <span className="italic">tamashii</span>, the soul, made into a game so a
        feeling could be shared. The same wish that runs through every card we
        hang next door in{" "}
        <Link href="/" className="text-accent hover:text-accent-strong underline underline-offset-2">
          the gallery
        </Link>
        .
      </>
    ),
  },
];

/** Where we read this — named in the open (the attribution vow). */
const SOURCES: { label: string; href: string }[] = [
  { label: "The Met — Board Games from Ancient Egypt and the Near East", href: "https://www.metmuseum.org/essays/board-games-from-ancient-egypt-and-the-near-east" },
  { label: "The British Museum — the Royal Game of Ur", href: "https://www.britishmuseum.org/collection/object/W_1928-1009-378" },
  { label: "Wikipedia — Book of the Dead (weighing of the heart)", href: "https://en.wikipedia.org/wiki/Book_of_the_Dead" },
  { label: "Britannica — Maat (truth & cosmic order)", href: "https://www.britannica.com/topic/Maat-Egyptian-goddess" },
  { label: "Nippon.com — Yu-Gi-Oh! began as a manga about games", href: "https://www.nippon.com/en/japan-topics/g02295/" },
  { label: "Anime News Network — Kazuki Takahashi obituary & autopsy", href: "https://www.animenewsnetwork.com/news/2022-07-11/autopsy-concludes-yu-gi-oh-manga-creator-kazuki-takahashi-died-by-drowning/.187574" },
  { label: "Stars and Stripes — the reported rip-current rescue", href: "https://www.stripes.com/branches/army/2022-10-11/okinawa-riptide-rescue-yu-gi-oh-7646714.html" },
  { label: "Wikipedia — Roger Slifer (the God-card name)", href: "https://en.wikipedia.org/wiki/Roger_Slifer" },
  { label: "Guinness World Records — First modern trading card game", href: "https://www.guinnessworldrecords.com/world-records/first-modern-trading-card-game" },
];

export default function DuelOfSoulsPage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      {/* The front of the wing — a vertical 決闘 mark in 明朝, the title, and a
          plain admission of what this is (and isn't). */}
      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          決闘
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 魂
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Duel of Souls
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          魂の決闘
          <span className="text-ink-muted"> — the deep culture behind Yu-Gi-Oh!</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          Yu-Gi-Oh! wears ancient Egypt like a costume — but under the costume
          is something genuinely old, and genuinely moving: the idea that a game
          can be a way to face fate and death. We're a card shop, not
          Egyptologists, so the fantasy is marked as fantasy and the sources are
          named. Follow the line from a board of the dead to a boy solving a
          puzzle.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* The seven movements — vertical chapter kanji + 明朝 title over short,
          hedged prose, inking in as it's reached. */}
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
          A card shop reaching for ancient Egypt and another culture's history
          should show its work — especially where a beloved game romanticizes
          the past. These are the sources behind the essay; museums and reporters
          did the real work. If we've got something wrong, tell us and we'll mend
          it.
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
          A companion piece traces the line of the drawing itself —{" "}
          <Link href="/lineage" className="text-accent hover:text-accent-strong underline underline-offset-2">
            the lineage of manga &amp; anime <span className="wardrobe-jp">線の系譜</span>
          </Link>
          . No artwork is reproduced here; the only pictures we hang are the
          cards themselves.
        </p>
      </div>

      <Benediction line="The oldest game was always played against fate." />
    </main>
  );
}
