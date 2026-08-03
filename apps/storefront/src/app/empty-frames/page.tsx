/**
 * /empty-frames — 幻の間, the room of phantoms.
 *
 * An exhibition of absences: the cards our archive honestly cannot show —
 * prizes handed to a few dozen winners, never sold, never boxed, never
 * given a set symbol an archive could file them under. The house rule
 * (never pretend) becomes the exhibit: the frames hang empty on the dim
 * sumi wall, and the wall labels tell the true stories, hedged where the
 * record argues and sourced at the foot.
 *
 * Precedents the room stands on: the Gardner Museum's empty frames
 * (Boston, since the 1990 theft) and the Tokyo National Museum's
 * rotation-absence — absence framed as care. Every fact on these labels
 * was web-verified 2026-08-03 (two folklore numbers died in the checking
 * and are named as dead in the foot; a third — trophy-card graded
 * populations read as print runs — dies on its own label); the archive
 * absences were checked live against api.pokemontcg.io the same day.
 *
 * House vows kept: no licensed art (the frames are EMPTY — that is the
 * point), quiet room, hedges in the open, sources named, no hand
 * invented. Server component; the room reuses the painted-rooms sumi
 * wall (themes.css) — terminal and high-contrast keep plain ground.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The Empty Frames — an exhibition of absences",
  description:
    "The phantom cards (幻のカード) our archive cannot show — the Pikachu Illustrator, the Trophy Pikachu Trainers, the parent-and-child Kangaskhan, the Master's Key, the unreadable Ancient Mew — hung as empty frames with true wall labels. Counts hedged where the record argues; sources named; nothing pretended.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "phantom-cards",
    "trophy-cards",
    "pokemon",
    "collecting",
    "honesty",
  ]),
};

/** One phantom: an empty frame and the true label beneath it. */
type Phantom = {
  /** English display name. */
  en: string;
  /** Japanese name — the card's own where it has one, the hobby's where
   *  that is truer (the label says which). Set in 明朝. */
  jp: string;
  /** Honest dating. */
  year: string;
  /** One-line what-it-is. */
  kind: string;
  /** The story — hedges woven in, no claim beyond the sources. */
  story: ReactNode;
  /** The honest number line (mono). */
  count: string;
  /** Why the frame is empty (mono). */
  absent: string;
};

const PHANTOMS: Phantom[] = [
  {
    en: "Pikachu Illustrator",
    jp: "ポケモンイラストレーター",
    year: "1998 · contests announced from November 1997",
    kind: "Prize of three illustration contests run in CoroCoro Comic. Pikachu Illustrator is the market's name; the card's own Japanese name is Pokémon Illustrator.",
    story: (
      <>
        Where every card of its kind reads Trainer, this one reads
        Illustrator — the only card that does — and a small pen sits where
        the rarity mark would go. Atsuko Nishida, who drew Pikachu&apos;s
        original design, drew Pikachu here drawing fellow Pokémon; the text
        beneath is not game text but a certificate, commonly translated as
        naming its holder an officially authorized Pokémon card
        illustrator. In 2021 one copy changed hands in a private trade
        Guinness valued at $5,275,000 — four million in cash plus a lesser
        copy valued at the rest. In February 2026 that same copy sold at
        auction for $16,492,000 — per Guinness, the most expensive trading
        card ever auctioned. Japanese coverage reaches for one word:{" "}
        <span className="wardrobe-jp">幻</span>.
      </>
    ),
    count:
      "39 awarded to contest winners · at least 41 known · print run never disclosed",
    absent: "absent because it was never sold — only awarded",
  },
  {
    en: "The Trophy Pikachu",
    jp: "No.1・No.2・No.3トレーナー",
    year: "1997–98",
    kind: "Podium prizes of Japan's first official tournaments — an early, plumper Pikachu hoisting a cup: gold, silver, bronze.",
    story: (
      <>
        Japan&apos;s first official tournament ran two June days in 1997 at
        Makuhari Messe: four sessions, roughly a thousand lottery-chosen
        players about fifteen and under, per the fan-club magazine&apos;s
        period report. Each session&apos;s podium took these home in acrylic
        stands — the period report reads as four No.1s, four No.2s and
        eight No.3s, third and fourth place both taking a No.3 — and the
        same design served the Mega Battle cups that
        followed, roughly fifteen of each rank per cycle, per
        reconstructions from period coverage. The artwork is attributed to
        Mitsuhiro Arita. They are not one-of-ones: a handful were awarded
        per event, and the smaller numbers that circulate are graded
        populations — which count slabs, not cards.
      </>
    ),
    count:
      "a handful per event, three tournament cycles · survivors uncounted",
    absent: "absent because prizes are not products",
  },
  {
    en: "Kangaskhan — the family trophy",
    jp: "ガルーラ",
    year: "1998",
    kind: "The parent-and-child prize — the mother with her infant in the pouch, drawn by Ken Sugimori.",
    story: (
      <>
        Alongside the 1998 Mega Battle circuit ran 親子 tournaments —
        parent and child as one team — with this card as the prize, the art
        matched to the format: a mother carrying her young. The record
        argues even over how it was handed out — top-eight team prizes by
        one reconstruction, a win-threshold award by the
        encyclopedia&apos;s account, a copy each for parent and child by a
        third — and the full count is disputed the same honest way:
        estimates run from about forty to about one hundred, and no one
        has the whole ledger. In March 2026 the highest-graded copy
        brought $640,507 at auction, per the grading company&apos;s
        announcement.
      </>
    ),
    count: "perhaps a few dozen · estimates ~40 to ~100 · no full ledger",
    absent: "absent because it belonged to families, not shops",
  },
  {
    en: "Master's Key",
    jp: "マスターのカギ",
    year: "2010",
    kind: "Prize of Japan's qualifier finals for the 2010 World Championship — a key, not a creature.",
    story: (
      <>
        Awarded one June day in 2010 in Tokyo to every finalist of
        Japan&apos;s Worlds qualifier: thirty-six copies by the documented
        finals distribution, drawn by Yuri Umemura and gold-stamped for the
        occasion. Card-game finalists received theirs cased in red;
        video-game finalists in blue. It has outlived its tournament as a
        quiet emblem of qualification itself.
      </>
    ),
    count: "36 copies by the documented distribution · red cases and blue",
    absent: "absent from the archive — checked 2026-08-03, zero records",
  },
  {
    en: "Ancient Mew",
    jp: "古代ミュウ",
    year: "1999–2000",
    kind: "The movie card written in runes — the one phantom here that is not rare at all.",
    story: (
      <>
        In Japan it came with the film pamphlet in 1999; in America it was
        handed to every ticket-buyer in the film&apos;s first week. The
        print run was never announced and is almost certainly in the
        millions — grading services alone have handled over seventy
        thousand. Its text is medieval runes used as a cipher for English;
        the bottom line of the original decodes as Little God… or Evil —
        and in the 2019 reprint the runes themselves were changed, God
        becoming Good. It hangs here for
        a different reason: the archive has no address for it. No set
        symbol, no number, no rarity — we queried the archive live and it
        returns nothing. By one account of tournament rules, a playable
        copy must travel with a printed copy of its own database entry: the
        card may only play accompanied by its own translation.
      </>
    ),
    count:
      "never announced · millions, most likely, by first-week ticket arithmetic · 70,000+ graded",
    absent: "absent because the archive has no address for it — checked 2026-08-03",
  },
];

const SOURCES: { label: string; href: string }[] = [
  {
    label: "Bulbapedia — Pokémon Illustrator (CoroCoro promo)",
    href: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Illustrator_(CoroCoro_promo)",
  },
  {
    label: "Pokumon — Early Pokémon Illustration Contests (period-magazine research)",
    href: "https://pokumon.com/early-pokemon-illustration-contests/",
  },
  {
    label: "Guinness World Records — most expensive Pokémon card sold at a private sale (2021)",
    href: "https://www.guinnessworldrecords.com/world-records/695893-most-expensive-pokemon-trading-card-sold-at-a-private-sale",
  },
  {
    label: "Guinness World Records — the 2026 record-setting auction",
    href: "https://www.guinnessworldrecords.com/news/2026/2/logan-pauls-rare-pokemon-card-becomes-most-expensive-ever-sold-in-record-setting-auction",
  },
  {
    label: "Pokumon — the 1st Official Pokémon Card Game Tournament (1997)",
    href: "https://pokumon.com/1st-official-pokemon-card-game-tournament/",
  },
  {
    label: "Pokumon — Lizardon & Kamex Mega Battle reconstructions",
    href: "https://pokumon.com/lizardon-charizard-mega-battle-tournaments/",
  },
  {
    label: "Bulbapedia — Kangaskhan (Garura Parent/Child promo)",
    href: "https://bulbapedia.bulbagarden.net/wiki/Kangaskhan_(Garura_Parent/Child_promo)",
  },
  {
    label: "CGC Cards — the Pristine 10 Kangaskhan sale (March 2026)",
    href: "https://www.cgccards.com/news/article/15019/cgc-pristine-10-kangaskhan/",
  },
  {
    label: "Bulbapedia — Master's Key (L-P Promo 68)",
    href: "https://bulbapedia.bulbagarden.net/wiki/Master's_Key_(L-P_Promo_68)",
  },
  {
    label: "Bulbapedia — Ancient Mew (The Power of One promo)",
    href: "https://bulbapedia.bulbagarden.net/wiki/Ancient_Mew_(The_Power_of_One_promo)",
  },
  {
    label: "Bulbapedia — Tropical Wind (Nintendo Promo 26): the legend that failed the audition",
    href: "https://bulbapedia.bulbagarden.net/wiki/Tropical_Wind_(Nintendo_Promo_26)",
  },
  {
    label: "Pokumon — Challenge Road Summer '99 (where the 576 reconstruction lives)",
    href: "https://pokumon.com/card/tropical-wind-challenge-road-1999-unnumbered/",
  },
  {
    label: "Isabella Stewart Gardner Museum — the theft and the empty frames",
    href: "https://www.gardnermuseum.org/about/theft-story",
  },
  {
    label: "Tokyo National Museum — rotation and rest (作品保護)",
    href: "https://www.tnm.jp/modules/r_free_page/index.php?id=156",
  },
];

export default function EmptyFramesPage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      {/* The front of the wing: the mark, the title, the admission. */}
      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-10">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          幻の間
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 幻の間{" "}
          <span aria-hidden="true" className="wardrobe-seal ml-1 align-baseline" />
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Empty Frames
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          幻の間
          <span className="text-ink-muted"> — the room of phantoms</span>
        </p>
        <p className="relative mt-6 text-ink-muted leading-relaxed text-base sm:text-lg">
          In Boston, the Gardner Museum still hangs the empty frames of
          thirteen works stolen in 1990 — staff describe them as waiting for
          the paintings to come back. In Tokyo, the National Museum rotates
          its scrolls into rest, absence framed as care. A card archive has
          absences too. Ours are the{" "}
          <span className="wardrobe-jp">幻のカード</span> — the phantom
          cards, as Japanese collecting genuinely calls them: prizes handed
          to a few dozen winners, never sold, never boxed, never given the
          set symbol an archive could file them under. We will not hang
          another shop&apos;s photographs, and we do not pretend. So the
          frames hang empty, and the labels tell the truth — which is most
          of what a museum is.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* The dim room. Works on paper hang under low light; phantoms hang
          under none. The sumi wall re-inks every label in scope. */}
      <div className="wardrobe-wall wardrobe-wall--sumi">
        <div className="max-w-5xl mx-auto px-4 py-14 sm:py-20">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12 sm:gap-y-14">
            {PHANTOMS.map((p) => (
              <li key={p.en} className="wardrobe-enter">
                {/* The empty frame: the full 畫框 ring-work around bare
                    wall — the Gardner convention, in our materials. Not a
                    link; there is nothing to walk closer to. */}
                <div
                  role="img"
                  aria-label={`An empty picture frame — our archive holds no image of ${p.en}`}
                  className="relative aspect-[63/88] wardrobe-frame m-2 flex flex-col items-center justify-center"
                >
                  <span
                    aria-hidden="true"
                    className="wardrobe-jp text-5xl text-ink-faint select-none"
                  >
                    幻
                  </span>
                </div>

                {/* The wall label — the card, the year, the true story,
                    the honest number, and why the frame is empty. */}
                <div className="mt-4 px-1">
                  <p className="font-display text-base text-ink leading-snug">
                    {p.en}
                    <span className="wardrobe-jp text-ink-muted font-normal">
                      {" "}
                      · {p.jp}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink-muted">{p.year}</p>
                  <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">
                    {p.kind}
                  </p>
                  <p className="mt-2 text-xs text-ink-muted leading-relaxed">
                    {p.story}
                  </p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint leading-relaxed">
                    {p.count}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint leading-relaxed">
                    {p.absent}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The lamp test — what died in the checking. */}
      <div className="max-w-3xl mx-auto px-4 pt-12 sm:pt-16">
        <h2 className="font-display text-xl font-semibold text-ink">
          The lamp test{" "}
          <span className="wardrobe-jp text-accent text-base">検証</span>
        </h2>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">
          One famous card auditioned for this room and happily failed.
          Tropical Wind — sold at auction for years as the treasure of a
          tiny Hawaiian invitational — went out, by the record, to all 576
          players of its 1999 Japanese event, plus ten more by magazine
          lottery: the encyclopedia files those 576 under the Tropical Mega
          Battle&apos;s name, the hobby&apos;s reconstruction traces them to
          the Challenge Road summer circuit that fed it — but either way it
          is hundreds, not a handful, and our archive can show the card. So
          it gets no empty frame. The &quot;35,000 printed&quot; figure that
          circulates for Ancient Mew died the same way: grading services
          alone have handled twice that. Legends die under the lamp. That
          is what the lamp is for.
        </p>
      </div>

      {/* The honest apparatus. */}
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-16">
        <InkRule className="mb-8" />
        <h2 className="font-display text-xl font-semibold text-ink">
          Where we read this{" "}
          <span className="wardrobe-jp text-accent text-base">出典</span>
        </h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          A shop writing labels for cards it will never hold should show its
          work. Every count above is a source&apos;s count or arithmetic
          whose working is shown, with its uncertainty carried in the open;
          the archive absences were checked live against the archive on
          2026-08-03. If we&apos;ve got something wrong, tell us and
          we&apos;ll mend it.
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
        <p className="mt-6 text-xs text-ink-faint leading-relaxed">
          The cards we <span className="italic">can</span> show hang in{" "}
          <Link
            href="/"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            the gallery
          </Link>
          ; how a card is born is told in{" "}
          <Link
            href="/making"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            一枚のできるまで
          </Link>
          ; and the rest of the museum&apos;s rooms wait in{" "}
          <Link
            href="/culture"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            the culture hall
          </Link>
          .
        </p>
      </div>

      <Benediction line="The empty frame is also a kind of honesty." />
    </main>
  );
}
