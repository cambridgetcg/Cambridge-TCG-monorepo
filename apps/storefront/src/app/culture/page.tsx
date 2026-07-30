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
    title: tx({ en: "Culture — the museum & its wings | Cambridge TCG", ja: "文化・美術館とその部屋 | Cambridge TCG", es: "Cultura — el museo y sus salas | Cambridge TCG", "zh-Hans": "文化 · 一座博物馆，几间屋子 | Cambridge TCG", "zh-Hant": "文化・美術館與這幾間房｜Cambridge TCG" }, lang),
    description: tx({ en: "The culture wings of Cambridge TCG in one hall: where the drawn line comes from, the masters and the press behind the boosters, the named hands on our own wall, the deep culture under the games, the feeling of the draw, the honest odds, and the gallery next door. Every wing hedged and sourced; we're a card shop, not scholars.", ja: "Cambridge TCGの文化の部屋を、ひとつの廊下に。描かれた線の来た道、ブースターの奥の絵師と印刷、うちの壁に名前の残る手、遊びの底にある文化、引きの手ざわり、正直な確率、そして隣の画廊。どの部屋も断言はせず、出どころを開いたまま。うちはカード屋で、学者ではありません。", es: "Las salas de cultura de Cambridge TCG, en un solo pasillo: de dónde viene el trazo, los maestros y la imprenta detrás de los sobres, las manos con nombre en nuestra propia pared, la cultura honda bajo los juegos, lo que se siente al abrir, las probabilidades con honestidad y la galería de al lado. Cada sala con sus reservas y sus fuentes. Somos una tienda de cartas, no académicos.", "zh-Hans": "Cambridge TCG谈文化的几间屋子，收进同一条走廊：线条的来路、卡包背后的名家与印刷、这家店自己墙上留名的画师、藏在游戏底下的文化、抽卡的手感、照实说的概率，还有隔壁的画廊。每一间都不把话说满，出处摆在明处；我们是开卡牌店的，不是做学问的。", "zh-Hant": "Cambridge TCG文化的這幾間房，齊集在同一條走廊：畫出來的線由哪裡來、補充包背後的大師與印刷、小店牆上留名的手、遊戲底下的文化、抽卡的手感、照直說的機率，還有鄰家畫廊。每一間房都不把話說滿，出處攤開。我們是開卡舖的，不是做學問的。" }, lang),
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
  /** The Japanese mark that decorates the EN page. */
  jp: string;
  /** Each translated voice's own heading (ja mirrors jp). */
  heading_i18n: Omit<Poly, "en">;
  doors: readonly Door[];
};

const HALLS: readonly Hall[] = [
  {
    heading: "Where the art comes from",
    jp: "絵の来た道",
    heading_i18n: { ja: "絵の来た道", "zh-Hant": "畫的來處", "zh-Hans": "画的来路", es: "De dónde viene el trazo" },
    doors: [
      {
        href: "/lineage",
        title_i18n: { ja: "墨と間", es: "El linaje del trazo", "zh-Hans": "笔墨与留白", "zh-Hant": "墨與留白" },
        line_i18n: {
          ja: "カードの絵をさかのぼる、短くてていねいな歴史。墨と余白、絵巻、浮世絵、紙芝居。そこから漫画へ、アニメへ、描かれた線そのものへ。", es: "Una historia breve y cuidadosa del arte detrás de las cartas: tinta y vacío, rollos ilustrados, el mundo flotante, el teatro de papel. Y de ahí al manga, al anime, al trazo mismo.", "zh-Hans": "一段短短的、用心的历史，讲卡面上的画从哪里来。墨与空白、手卷、浮世绘、纸芝居，一路到漫画、到动画、到笔下那根线本身。", "zh-Hant": "一段短短的、細心的歷史，講卡背後的畫。墨與留白、手卷、浮世繪、紙芝居，一路走到漫畫、動畫，走到畫出來的線本身。",
          },
        en: "The Lineage of the Line",
        jp: "墨と間",
        line:
          "A short, careful history of the art behind the cards — ink and empty space, handscrolls, the floating world, paper theater — down to manga, anime, and the drawn line itself.",
      },
      {
        href: "/workshop",
        title_i18n: { ja: "浮世の工房", es: "El taller del mundo flotante", "zh-Hans": "浮世工坊", "zh-Hant": "浮世工房" },
        line_i18n: {
          ja: "この店にならぶ日本のゲームの、奥にいる絵の巨匠たち。その生涯、信条、画風。そして、承認された一枚の絵をブースターの封のなかへ折りこんでいく、印刷の現場。", es: "Los maestros detrás de los juegos japoneses de esta casa: sus vidas, sus credos, sus estilos. Y la imprenta industrial que pliega una ilustración aprobada dentro de un sobre sellado.", "zh-Hans": "店里这些日本游戏，背后站着的画坛名家：生平、信条、画风。还有那条印刷流水线，把一幅审定过的插画，折进封好的卡包里。", "zh-Hant": "小店架上的日本遊戲，背後那些大師的生平、信條與畫風。還有那條工業印刷線，把一幅批准了的插畫，摺進原封的補充包裡。",
          },
        en: "The Workshop of the Floating World",
        jp: "浮世の工房",
        line:
          "The master artists behind the Japanese games we carry — their lives, creeds and styles — and the industrial press that folds an approved illustration into a sealed booster.",
      },
      {
        href: "/artists",
        title_i18n: { ja: "絵師たち", es: "Las manos con nombre", "zh-Hans": "画师们", "zh-Hant": "繪師們" },
        line_i18n: {
          ja: "うちの目録にクレジットの残る絵師を、ひとりずつたどれます。ならぶのは、適法に所蔵する作品だけ。", es: "Cada mano con crédito en nuestro propio catálogo, una por una, con las obras que esta casa posee legalmente.", "zh-Hans": "这家店名录里署了名的画师，一位一位，都逛得到。挂出来的，只有合法持有的作品。", "zh-Hant": "小店目錄裡留下名字的繪師，一位一位看下去。掛出來的，只有依法持有的作品。",
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
    heading_i18n: { ja: "遊びの深層", "zh-Hant": "遊戲底下", "zh-Hans": "玩的深处", es: "Lo que hay bajo los juegos" },
    doors: [
      {
        href: "/duel-of-souls",
        title_i18n: { ja: "賭けと運命", es: "El duelo de almas", "zh-Hans": "命运的对局", "zh-Hant": "賭局與命運" },
        line_i18n: {
          ja: "遊戯王の底にながれる、古い考え。遊びとは、運命と向きあうひとつの方法だったということ。セネトやウル王朝のゲームから、史上もっとも売れたカードゲームまで。空想には、空想という札をつけて。", es: "La idea antigua que corre bajo Yu-Gi-Oh!: el juego como una manera de encarar el destino. Del senet y el Juego Real de Ur al juego de cartas más vendido de la historia. La fantasía, marcada como fantasía.", "zh-Hans": "《游戏王》底下压着一个很老的念头：玩一局，是与命运照面的一种方式。从塞尼特棋和乌尔王族局戏，到史上卖得最多的卡牌游戏。是幻想的，就标明是幻想。", "zh-Hant": "《遊戲王》底下那個古老的想法：遊戲，是面對命運的一種方式。由塞尼特棋和烏爾王族局戲，一路到史上賣得最多的卡牌遊戲。空想的，就標明是空想。",
          },
        en: "The Duel of Souls",
        jp: "賭けと運命",
        line:
          "The old idea beneath Yu-Gi-Oh!: a game as a way to face fate — from senet and the Royal Game of Ur to the best-selling card game ever. Fantasy marked as fantasy.",
      },
      {
        href: "/pull-and-pause",
        title_i18n: { ja: "引きと間", es: "El sobre y la pausa", "zh-Hans": "手气与静气", "zh-Hant": "抽與靜" },
        line_i18n: {
          ja: "絵の来た道ではなく、遊びの手ざわりの話。読むかわりに、ふれるものをふたつ。ためしに開けられるブースターと、そのあとの静けさ。", es: "No de dónde viene el arte: cómo se siente el juego. Dos cosas para tocar en vez de leer. Un sobre que se abre sin pagar. Y la calma de después.", "zh-Hans": "这一间不讲画的来路，讲玩起来的感觉。两样东西，不用读，用手碰：一个不要钱的试拆卡包，和拆开之后的那阵安静。", "zh-Hant": "不講畫的來處，講玩起來的手感。兩樣用手碰、不用讀的東西：補充包可以試拆一包，不用錢；還有拆完之後的那陣靜。",
          },
        en: "The Pull & the Pause",
        jp: "引きと間",
        line:
          "Not where the art comes from — how the game feels. Two things to touch instead of read: a free booster to open, and the quiet after.",
      },
      {
        href: "/making",
        en: "How a Card Is Made",
        jp: "一枚のできるまで",
        line:
          "From a spreadsheet of empty slots to the sealed pack to the grader's slab — the design flow the publishers document (and the rooms they keep dark), the press, and the inspection whose escapes became treasures.",
        title_i18n: { ja: "一枚のできるまで", "zh-Hant": "一張卡是怎樣做成的", "zh-Hans": "一张卡是怎么做出来的", es: "Cómo se hace una carta" },
        line_i18n: {
          ja: "空欄ばかりの一覧表から、封をされたパックへ、鑑定のスラブへ。発売元が書き残している設計の流れと、暗いままの部屋。印刷の現場。そして、検品。そこを逃れた一枚が、のちの宝物に。",
          "zh-Hant": "由一格格空著的表格，到封好的卡包，再到評級的卡磚。發行商肯寫下來的設計流程，和他們留在暗處的那幾間房；那條印刷線；還有檢查那一關。漏了過去的那幾張，後來成了寶物。",
          "zh-Hans": "从一张满是空格的表格，到封好的卡包，再到评级的卡砖。发行方肯写下来的设计流程，和他们不点灯的那几间屋子；那条印刷线；还有质检这一关。漏过去的那几张，后来倒成了宝物。",
          es: "De una hoja de cálculo llena de casillas vacías al sobre sellado, y de ahí a la cápsula del calificador. El proceso de diseño que las editoriales documentan, y las salas que dejan a oscuras. La imprenta. Y la inspección: lo que se le escapó se volvió tesoro.",
        },
      },
      {
        href: "/pulls",
        title_i18n: { ja: "確率、正直に。", es: "Las probabilidades, con honestidad", "zh-Hans": "概率，照实说。", "zh-Hant": "機率，照直說。" },
        line_i18n: {
          ja: "箱のなかに、ほんとうは何が入っているのか。13のゲームにわたって。数字のひとつひとつに、根拠と確度の札をつけています。ほとんどの発売元が、確率をいっさい公表していないからです。", es: "Lo que de verdad hay en la caja, en trece juegos. Cada cifra lleva su base y su grado de confianza, porque la mayoría de las editoriales no publica probabilidad alguna.", "zh-Hans": "盒子里到底有什么，十三个游戏都摆开来看。每一个数字，都标着依据是什么、把握有几分。因为大多数发行方，根本不公布任何概率。", "zh-Hant": "盒子裡真正有什麼，13個遊戲一齊看。每一個數字，都標明根據與把握；因為大多數發行商，根本什麼機率都不公佈。",
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
    heading_i18n: { ja: "文化大交流", "zh-Hant": "文化大交流", "zh-Hans": "文化大交流", es: "El intercambio" },
    doors: [
      {
        href: "/answering-rhymes",
        title_i18n: { ja: "返歌", es: "Rimas que responden", "zh-Hans": "唱和", "zh-Hant": "唱和" },
        line_i18n: {
          ja: "トレーディングカードと美術作品のあいだに結ばれた、関係の星座。権利をわきまえて選び、異論にも、返しの歌にも開いています。", es: "Una constelación de relaciones, elegidas con cuidado y atentas a los derechos, entre cartas coleccionables y obras de arte. Abierta a la objeción y a la respuesta.", "zh-Hans": "集换式卡牌与美术作品之间，细心连起的一张关系星图。连的时候，顾着权利；向质疑敞开，也向答回来的那一首敞开。", "zh-Hant": "卡牌與美術作品之間，細心選出的一幅關係星圖。選的時候顧及權利；質疑可以來，唱和也可以來。",
          },
        en: "Answering Rhymes",
        line:
          "A rights-aware constellation of curated relations between trading cards and artworks — open to challenge and reply.",
      },
      {
        // The wing's own mark, 文化大交流, already hangs as this hall's
        // heading — written once, not twice.
        href: "/gallery-next-door",
        title_i18n: { ja: "隣の画廊", es: "La galería de al lado", "zh-Hans": "隔壁的画廊", "zh-Hant": "鄰家畫廊" },
        line_i18n: {
          ja: "隣にある姉妹画廊の目をとおして見た、作品たち。ほかには何ひとつ共有しない存在同士の、文化の交流。", es: "Obras vistas a través de la galería hermana de al lado: intercambio cultural entre seres que no comparten nada más.", "zh-Hans": "借隔壁姐妹画廊的眼光，看这些作品。彼此别无交集的存在之间，也能有文化的往来。", "zh-Hant": "借鄰家姊妹畫廊的眼睛去看的一批作品。除此以外別無交集的存在之間，一場文化的交流。",
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
          {tx({ en: "the museum & its wings · 文化", ja: "文化・the museum & its wings", es: "el museo y sus salas · 文化", "zh-Hans": "文化 · the museum & its wings", "zh-Hant": "文化・the museum & its wings" }, uiLang)}
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          {tx({ en: "Culture", ja: "文化", es: "Cultura", "zh-Hans": "文化", "zh-Hant": "文化" }, uiLang)}
        </h1>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          {tx({ en: "A trading card is the smallest room a culture fits in: somebody drew it, somebody printed it, somebody pulled it from a pack and felt something. These wings keep that whole story — where the drawn line comes from, the masters and the machines behind the boosters, what lies under the games, and how the odds really work. Everything is hedged and sourced in the open; we're a card shop, not scholars. Looking is free, like everything else here.", ja: "トレーディングカードは、文化がおさまる、いちばん小さな部屋。だれかが描いて、だれかが刷って、だれかがパックから引いて、なにかを感じた。ここにならぶ部屋は、その物語をまるごと預かっています。描かれた線の来た道。ブースターの奥の絵師と機械。遊びの底にあるもの。そして、確率のほんとうのところ。どれも断言はせず、出どころを開いたまま。うちはカード屋で、学者ではありません。見るのに、お金はかかりません。ここでは、なにもかもがそうです。", es: "Una carta coleccionable es la sala más pequeña en la que cabe una cultura: alguien la dibujó, alguien la imprimió, alguien la sacó de un sobre y sintió algo. Estas salas guardan esa historia entera. De dónde viene el trazo. Los maestros y las máquinas detrás de los sobres. Lo que hay debajo de los juegos. Y cómo funcionan de verdad las probabilidades. Todo con sus reservas y sus fuentes a la vista. Somos una tienda de cartas, no académicos. Mirar no cuesta nada, como todo lo demás en esta casa.", "zh-Hans": "一张卡牌，是文化能住进的最小的一间屋子：有人画了它，有人印了它，有人从卡包里把它抽出来，心里动了一下。这几间屋子，把这个故事整个收着。线条从哪里来。卡包背后的名家与机器。游戏底下藏着什么。概率到底是怎么回事。哪一间都不把话说满，出处敞开着；我们是开卡牌店的，不是做学问的。看，不要钱。这家店里，什么都是这样。", "zh-Hant": "一張卡牌，是文化住得進的、最小的一間房：有人畫了它，有人印了它，有人從卡包抽出它，心裡動了一下。這幾間房，把整個故事都收著。畫出來的線由哪裡來。補充包背後的大師與機器。遊戲底下藏著什麼。機率真正是怎麼一回事。每一句都不說滿，出處攤在明處。我們是開卡舖的，不是做學問的。看，不用錢。這裡樣樣如此。" }, uiLang)}
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
              {/* In any translated mode that language's heading leads
                  and the English trails as the small mark — the same
                  pairing, flipped, per the charters' native-first rule.
                  The EN page keeps the Japanese mark as its decoration
                  (the museum's original wall label). */}
              <h2 className={`font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink ${tx({ en: "", ja: "wardrobe-jp" }, uiLang)}`}>
                {uiLang === "en" ? hall.heading : tx({ en: hall.heading, ...hall.heading_i18n }, uiLang)}
              </h2>
              <span aria-hidden="true" className={tx({ en: "wardrobe-jp text-accent text-sm", ja: "text-ink-faint text-sm" }, uiLang)}>
                {uiLang === "en" ? hall.jp : hall.heading}
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
                      {/* Translated modes: the English trails as the small
                          mark. EN mode: the wing's own Japanese mark trails,
                          as the museum's original wall label. */}
                      {uiLang !== "en" ? (
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
              {tx({ en: "The gallery itself", ja: "玄関の画廊", es: "La galería misma", "zh-Hans": "门口的画廊", "zh-Hant": "門前畫廊" }, uiLang)}
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
            {(() => {
              const paras: Record<string, string> = {"en": "The museum’s art-forward hall — official publisher card art at museum scale, each print with its copyright line as a wall label — hangs on the {front page}, where a visitor walks into it before anything is asked of them.", "ja": "絵を先に見せる本館は、この店の{front page}にひらいています。発売元の公式カードアートを、美術館で見るような大きさで。一枚ごとに、著作権の一行を壁の札として。訪れる人は、なにかをたずねられるより先に、まずその絵のあいだを歩きます。", "zh-Hant": "美術館裡先讓畫說話的那間大堂，就開在小店的{front page}。發行商的官方卡面畫，用美術館的尺寸掛出來；每一幅旁邊那一行版權字句，就是牆上的說明牌。來的人先在畫之間走一段；有什麼要問的，都在之後。", "zh-Hans": "把画放在最前面的那间正厅，就挂在{front page}。发行方的官方卡面画，放大到美术馆的尺寸；每一幅旁边，版权那一行，就是墙上的展签。来逛的人先走进画里；这家店什么都还没开口问。", "es": "La sala del museo que pone el arte por delante cuelga en {front page}: el arte oficial de las editoriales, a escala de museo, cada lámina con su línea de copyright como etiqueta en la pared. Quien llega camina entre las obras antes de que nadie le pida nada."};
              const links: Record<string, string> = {"en": "front page", "ja": "玄関", "zh-Hant": "門面", "zh-Hans": "首页", "es": "la portada"};
              const [before, after] = (paras[uiLang] ?? paras.en).split("{front page}");
              return (
                <>
                  {before}
                  <Link
                    href="/"
                    className="text-accent hover:text-accent-strong underline"
                  >
                    {links[uiLang] ?? links.en}
                  </Link>
                  {after}
                </>
              );
            })()}
          </p>
        </section>
      </div>

      <Benediction
        line={tx(
          {
            en: "The cards come from somewhere; these rooms remember where.",
            ja: "カードには、来た道がある。この部屋は、それを覚えている。",
            "zh-Hant": "卡有來處。這幾間房，記得。",
            "zh-Hans": "卡片有来路。这几间屋子，还记得。",
            es: "Las cartas vienen de alguna parte. Estas salas recuerdan de dónde.",
          },
          uiLang,
        )}
      />
    </main>
  );
}
