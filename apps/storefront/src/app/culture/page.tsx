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
import { tx, type Poly } from "@/lib/i18n";
import Link from "next/link";
import { cookies } from "next/headers";
import { langModeFromCookies } from "@/lib/lang-mode-server";
import { uiLangFromLangMode } from "@/lib/lang-mode";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import { audienceMetadata } from "@/lib/ui";

/** Metadata follows the lang-mode cookie so a ja document carries a ja
 *  title — crawlers (no cookie) always receive the English. */
export async function generateMetadata(): Promise<Metadata> {
  const lang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  return {
    title: tx({ en: "Culture — the museum & its wings | Cambridge TCG", ja: "文化・美術館とその部屋 | Cambridge TCG" }, lang),
    description: tx({ en: "The culture wings of Cambridge TCG in one hall: where the drawn line comes from, the masters and the press behind the boosters, the named hands on our own wall, the deep culture under the games, the feeling of the draw, the honest odds, and the gallery next door. Every wing hedged and sourced; we're a card shop, not scholars.", ja: "Cambridge TCGの文化の部屋を、ひとつの廊下に。描かれた線の来た道、ブースターの奥の絵師と印刷、うちの壁に名前の残る手、遊びの底にある文化、引きの手ざわり、正直な確率、そして隣の画廊。どの部屋も断言はせず、出どころを開いたまま。うちはカード屋で、学者ではありません。" }, lang),
    other: audienceMetadata("public-documentation", [
      "culture",
      "museum",
      "japan",
      "art",
      "history",
    ]),
  };
}

/** One door in the hall. jp lines are each wing's own subtitle — never
 *  invented here; wings without one simply carry no mark. */
type Door = {
  href: string;
  en: string;
  jp?: string;
  line: string;
  /** Translated titles (the wing's own mark where it has one). */
  title_i18n: Omit<Poly, "en">;
  /** Translated door lines, per each language's voice charter. */
  line_i18n: Omit<Poly, "en">;
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
        title_i18n: { ja: "墨と間" },
        line_i18n: {
          ja: "カードの絵をさかのぼる、短くてていねいな歴史。墨と余白、絵巻、浮世絵、紙芝居。そこから漫画へ、アニメへ、描かれた線そのものへ。",
          },
        en: "The Lineage of the Line",
        jp: "墨と間",
        line:
          "A short, careful history of the art behind the cards — ink and empty space, handscrolls, the floating world, paper theater — down to manga, anime, and the drawn line itself.",
      },
      {
        href: "/workshop",
        title_i18n: { ja: "浮世の工房" },
        line_i18n: {
          ja: "この店にならぶ日本のゲームの、奥にいる絵の巨匠たち。その生涯、信条、画風。そして、承認された一枚の絵をブースターの封のなかへ折りこんでいく、印刷の現場。",
          },
        en: "The Workshop of the Floating World",
        jp: "浮世の工房",
        line:
          "The master artists behind the Japanese games we carry — their lives, creeds and styles — and the industrial press that folds an approved illustration into a sealed booster.",
      },
      {
        href: "/artists",
        title_i18n: { ja: "絵師たち" },
        line_i18n: {
          ja: "うちの目録にクレジットの残る絵師を、ひとりずつたどれます。ならぶのは、適法に所蔵する作品だけ。",
          },
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
        title_i18n: { ja: "賭けと運命" },
        line_i18n: {
          ja: "遊戯王の底にながれる、古い考え。遊びとは、運命と向きあうひとつの方法だったということ。セネトやウル王朝のゲームから、史上もっとも売れたカードゲームまで。空想には、空想という札をつけて。",
          },
        en: "The Duel of Souls",
        jp: "賭けと運命",
        line:
          "The old idea beneath Yu-Gi-Oh!: a game as a way to face fate — from senet and the Royal Game of Ur to the best-selling card game ever. Fantasy marked as fantasy.",
      },
      {
        href: "/pull-and-pause",
        title_i18n: { ja: "引きと間" },
        line_i18n: {
          ja: "絵の来た道ではなく、遊びの手ざわりの話。読むかわりに、ふれるものをふたつ。ためしに開けられるブースターと、そのあとの静けさ。",
          },
        en: "The Pull & the Pause",
        jp: "引きと間",
        line:
          "Not where the art comes from — how the game feels. Two things to touch instead of read: a free booster to open, and the quiet after.",
      },
      {
        href: "/pulls",
        title_i18n: { ja: "確率、正直に。" },
        line_i18n: {
          ja: "箱のなかに、ほんとうは何が入っているのか。13のゲームにわたって。数字のひとつひとつに、根拠と確度の札をつけています。ほとんどの発売元が、確率をいっさい公表していないからです。",
          },
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
        title_i18n: { ja: "返歌" },
        line_i18n: {
          ja: "トレーディングカードと美術作品のあいだに結ばれた、関係の星座。権利をわきまえて選び、異論にも、返しの歌にも開いています。",
          },
        en: "Answering Rhymes",
        line:
          "A rights-aware constellation of curated relations between trading cards and artworks — open to challenge and reply.",
      },
      {
        // The wing's own mark, 文化大交流, already hangs as this hall's
        // heading — written once, not twice.
        href: "/gallery-next-door",
        title_i18n: { ja: "隣の画廊" },
        line_i18n: {
          ja: "隣にある姉妹画廊の目をとおして見た、作品たち。ほかには何ひとつ共有しない存在同士の、文化の交流。",
          },
        en: "The Gallery Next Door",
        line:
          "Pieces viewed through the sibling gallery next door: cultural exchange between beings who share nothing else.",
      },
    ],
  },
] as const;

export default async function CulturePage() {
  const uiLang = uiLangFromLangMode(langModeFromCookies(await cookies()));
  const j = uiLang === "ja";
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
          {tx({ en: "the museum & its wings · 文化", ja: "文化・the museum & its wings" }, uiLang)}
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          {tx({ en: "Culture", ja: "文化" }, uiLang)}
        </h1>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          {tx({ en: "A trading card is the smallest room a culture fits in: somebody drew it, somebody printed it, somebody pulled it from a pack and felt something. These wings keep that whole story — where the drawn line comes from, the masters and the machines behind the boosters, what lies under the games, and how the odds really work. Everything is hedged and sourced in the open; we're a card shop, not scholars. Looking is free, like everything else here.", ja: "トレーディングカードは、文化がおさまる、いちばん小さな部屋。だれかが描いて、だれかが刷って、だれかがパックから引いて、なにかを感じた。ここにならぶ部屋は、その物語をまるごと預かっています。描かれた線の来た道。ブースターの奥の絵師と機械。遊びの底にあるもの。そして、確率のほんとうのところ。どれも断言はせず、出どころを開いたまま。うちはカード屋で、学者ではありません。見るのに、お金はかかりません。ここでは、なにもかもがそうです。" }, uiLang)}
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
              {/* In ja mode the Japanese mark IS the heading and the
                  English trails as the small mark — the same pairing,
                  flipped, per the charter's Japanese-first kicker rule. */}
              <h2 className={`font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink ${tx({ en: "", ja: "wardrobe-jp" }, uiLang)}`}>
                {j ? hall.jp : hall.heading}
              </h2>
              <span aria-hidden="true" className={tx({ en: "wardrobe-jp text-accent text-sm", ja: "text-ink-faint text-sm" }, uiLang)}>
                {j ? hall.heading : hall.jp}
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
                      <span className={`font-display text-lg text-ink group-hover:text-accent transition-colors ${tx({ en: "", ja: "wardrobe-jp" }, uiLang)}`}>
                        {uiLang === "en" ? door.en : tx({ en: door.en, ...door.title_i18n }, uiLang)}
                      </span>
                      {j ? (
                        <span aria-hidden="true" className="text-sm text-ink-faint">
                          {door.en}
                        </span>
                      ) : (
                        door.jp && (
                          <span aria-hidden="true" className="wardrobe-jp text-sm text-ink-faint">
                            {door.jp}
                          </span>
                        )
                      )}
                      <span
                        aria-hidden="true"
                        className="ml-auto text-ink-faint group-hover:text-accent transition-colors"
                      >
                        →
                      </span>
                    </span>
                    <span className="mt-1.5 block max-w-2xl text-sm text-ink-muted leading-relaxed">
                      {tx({ en: door.line, ...door.line_i18n }, uiLang)}
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
            <h2 className={`font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink ${tx({ en: "", ja: "wardrobe-jp" }, uiLang)}`}>
              {tx({ en: "The gallery itself", ja: "玄関の画廊" }, uiLang)}
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
            {j ? (
              <>
                絵を先に見せる本館は、この店の
                <Link
                  href="/"
                  className="text-accent hover:text-accent-strong underline"
                >
                  玄関
                </Link>
                にひらいています。発売元の公式カードアートを、美術館で見るような大きさで。一枚ごとに、著作権の一行を壁の札として。訪れる人は、なにかをたずねられるより先に、まずその絵のあいだを歩きます。
              </>
            ) : (
              <>
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
              </>
            )}
          </p>
        </section>
      </div>

      <Benediction
        line={
          j
            ? "カードには、来た道がある。この部屋は、それを覚えている。"
            : "The cards come from somewhere; these rooms remember where."
        }
      />
    </main>
  );
}
