/**
 * /workshop — the masters behind the cards, and the press that folds
 * their art into a sealed pack.
 *
 * A companion to /lineage (the line of the drawing) and /artists (the
 * named hands on our own wall). Where those trace the art and the
 * credits, this wing tells the people and the machinery: the lives,
 * creeds and styles of the master artists behind the Japanese TCG IPs
 * we carry — and the industrial process (order, approval, ink, foil,
 * collation) by which an illustration becomes a card in a booster.
 *
 * Asha's brief 2026-07-28: "introduce major artists behind the japanese
 * TCG IP. Their life, their works, their philosophy and style choice.
 * Combined with the production process of how the art is integrated
 * into the industrial process and into booster packs."
 *
 * The frame is the ukiyo-e workshop the /lineage essay planted:
 * publisher, artist, carver, printer — four hands, one sheet. We have
 * found no scholar who draws that line to a booster pack, so the
 * parallel is offered as this house's own reading, hedged in the open.
 *
 * House vows kept: a quiet room (no licensed art; the only images are
 * open-access museum objects, public domain, wall labels attached — words
 * and the 明朝
 * hand carry it); contested claims hedged in the open; quotes only
 * where verified against the cited source, translations marked;
 * deceased artists handled by officially announced fact, attributed
 * report kept distinct; sources named at the foot. Researched by a
 * ten-dossier fleet, each dossier adversarially fact-checked before a
 * word of this page was written. Server-rendered, no client JS.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Audience, Benediction, InkRule } from "@/lib/ui";
import MuseumPlate, { type MuseumPiece } from "@/components/culture/MuseumPlate";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The Workshop of the Floating World — the masters & the press",
  description:
    "The master artists behind the Japanese trading card games — Toriyama, Oda, Takahashi, Sugimori & Nishida, Arita, Watanabe & Itou, and the named hands of the One Piece Card Game — their lives, creeds and styles; and the industrial press that folds their art into a sealed booster: the order, the approval, the ink, the foil, the collation. Hedged and sourced; we're a card shop, not scholars.",
  other: audienceMetadata("public-documentation", [
    "culture",
    "japan",
    "artists",
    "illustration",
    "production",
    "printing",
    "ukiyo-e",
    "workshop",
  ]),
};

/** One plate in the wing. jp renders in 明朝 via the display chain. */
type Plate = {
  /** Vertical chapter kanji, 序 · 第一 … 第十. */
  chapter: string;
  /** Japanese title (kanji). */
  jp: string;
  /** Romaji reading. */
  romaji: string;
  /** English title. */
  en: string;
  /** The prose — hedges woven in, quotes only where verified. */
  body: ReactNode;

  /** Borrowed light: an open-access museum object hung beside this plate. */
  piece?: MuseumPiece;
};

const PROLOGUE: Plate = {
  chapter: "序",
  jp: "四人の手",
  piece: {
        src: "/culture-plates/met-55723.jpg",
        width: 600,
        height: 289,
        title: "Artisans, from the series \"An Up-to-Date Parody of the Four Classes\"",
        artist: "Utagawa Kunisada",
        date: "19th century",
        medium: "Triptych of woodblock prints; ink and color on paper",
        credit: "Gift of Cole J. Younger, 1975",
        sourceName: "The Metropolitan Museum of Art",
        sourceUrl: "https://www.metmuseum.org/art/collection/search/55723",
        rights: "Public domain (Met Open Access)",
        alt: "A woodblock triptych of women at every station of a print workshop — carving blocks, rubbing impressions, hanging printed sheets to dry",
      },
  romaji: "yonin no te",
  en: "The Four Hands",
  body: (
    <>
      In Edo Japan, a woodblock print was never one artist's work. The
      Metropolitan Museum puts it plainly: "each print required the
      collaboration of four experts: the designer, the engraver, the printer,
      and the publisher." The publisher — 版元,{" "}
      <span className="italic">hanmoto</span> — planned the venture, financed
      it, chose the subject; the artist — 絵師,{" "}
      <span className="italic">eshi</span> — drew; the carver — 彫師,{" "}
      <span className="italic">horishi</span> — cut the blocks; the printer —
      摺師, <span className="italic">surishi</span> — laid the colours. Of the
      three craft hands, only the designer signed the sheet; carver and printer
      went unnamed beside the publisher's seal. The result, in the Library of
      Congress's words, was "an art that was both populist… and highly
      sophisticated" — by conventional account some two hundred impressions a
      day, a sheet for about the price of a bowl of soba, and collected
      hungrily: around 1810, Shikitei Sanba wrote children into his bathhouse
      comedy <span className="italic">Ukiyoburo</span> trading actor prints and
      arguing over their quality. We have found no scholar who draws the line
      from that workshop to a booster pack, so take the parallel as this
      house's own reading, offered in the open: a trading card is popular art —
      publisher-commissioned, artist-signed, industrially printed, cheaply
      sold, hungrily collected. The four roles never disbanded. They
      re-hired.
    </>
  ),
};

const MASTERS: Plate[] = [
  {
    chapter: "第一",
    jp: "鳥山明",
    romaji: "Toriyama Akira",
    en: "Entertainment, Through & Through",
    body: (
      <>
        Akira Toriyama (1955–2024) came to manga sideways: born in Kiyosu,
        outside Nagoya, he spent about three years designing posters at an ad
        agency, quit at 23, debuted in Weekly Shonen Jump in 1978 — and always
        credited those agency years for a working habit of never missing a
        deadline. <span className="italic">Dr. Slump</span> made his name;{" "}
        <span className="italic">Dragon Ball</span> (1984–95, 519 chapters, a
        publisher-estimated 260 million copies) made an era, alongside his
        character designs for Dragon Quest and Chrono Trigger. His creed was
        entertainment without apology — "The role of my manga is to be a work
        of entertainment through and through," he told the Asahi Shimbun in a
        rare 2013 interview (AP's translation). The cards came early: Bandai's
        Carddass machines launched in 1988, and by Bandai's own count some 1.5
        billion Dragon Ball cards had sold by 1995 — but Toriyama did not draw
        them. Bandai's Carddass developer has described waiting with Jump's
        editors for his rough storyboards, then carrying copies to Toei
        Animation, whose artists drew the card art. No official source credits
        him as a card illustrator in the modern game either; his hand is
        upstream — the characters and the world are his, rendered by the
        workshop. Fusion World launched in February 2024. On 1 March he died,
        aged 68, of an acute subdural hematoma — announced on 8 March by his
        studio, works still in the middle of creation, the funeral already
        held privately. The announcement asked for quiet, and offerings were
        declined.
      </>
    ),
  },
  {
    chapter: "第二",
    jp: "尾田栄一郎",
    romaji: "Oda Eiichirō",
    en: "One Reader, Aged Fifteen",
    body: (
      <>
        Eiichiro Oda (b. 1975, Kumamoto) earned a place in Shueisha's Tezuka
        Award at seventeen, served the classic Jump apprenticeship — including
        under Nobuhiro Watsuki on{" "}
        <span className="italic">Rurouni Kenshin</span> — and began{" "}
        <span className="italic">One Piece</span> in 1997. Guinness first
        certified it in 2015 under the exact title "Most copies published for
        the same comic book series by a single author"; by 2022 the count had
        passed 500 million copies worldwide. His philosophy is reader-first to
        the point of self-portraiture: "I have only one reader in my mind —
        myself as a 15-year-old," he told VIZ in 2012, mixing action, comedy
        and tears because "more than anybody, I would get bored." The famous
        three-hours-of-sleep lore is his own remark in a 2016 promotional
        paper, surviving in fan translation — self-description, not verified
        biography. After the 2016 Kumamoto earthquakes he backed his home
        prefecture's recovery; bronze Straw Hats now stand across it. The One
        Piece Card Game arrived for the series' 25th anniversary — announced
        March 2022, Japan that July, English that December — with a
        commemorative illustration from Oda and a joke, per ANN's translation,
        that he doesn't know much about card games. The cards, his staff
        account explained, carry art "from the manga, anime, and also other
        illustrators"; the double copyright line on every card reflects those
        two licensed streams, manga and anime (our reading of it). Whether Oda
        approves individual cards is not publicly recorded — his documented
        guard-dog supervision is of the Netflix adaptation — so we leave his
        role at the licence, where the record leaves it.
      </>
    ),
  },
  {
    chapter: "第三",
    jp: "高橋和希",
    romaji: "Takahashi Kazuki",
    en: "You Can't Play Alone",
    body: (
      <>
        Kazuki Takahashi (1961–2022) worked some fifteen years in near-obscurity
        before <span className="italic">Yu-Gi-Oh!</span> began in 1996 — not as
        a card-game manga but, in his own framing, a school drama: "Yu-Gi-Oh
        feels like a manga about a card game, but at its heart it is really a
        school drama" (as translated by Nippon.com). The card game inside the
        story — widely described as a nod to Magic: The Gathering, though we
        find no surviving statement of his own on that — was one game among
        many until readers made it the engine. Konami built it for real in
        1999; by 2011 it was the Guinness-certified best-selling trading card
        game, over 25.1 billion cards. Takahashi never stopped drawing for the
        physical game — his card and promo art fills the artbook{" "}
        <span className="italic">Duel Art</span>, and in 2005 he sketched and
        signed a one-of-one card for a Make-A-Wish teenager. His creed was the
        table itself: "The thing about the card game is that you can't play by
        yourself. You have to play with friends" (TIME For Kids, 2002,
        surviving in fan reproduction). His death holds two layers, and we keep
        them apart as the record does. Officially: found on 6 July 2022 in the
        sea off Nago, Okinawa; drowning; no foul play. Three months later,
        Stars and Stripes reported — on a US Army major's account, which the
        Japan Coast Guard declined to confirm — that he had entered the water
        during a rip-current rescue of a girl, her mother and a soldier. "He's
        a hero," the major said. Attributed, not asserted — the way this house
        already holds it in{" "}
        <Link
          href="/duel-of-souls"
          className="text-accent hover:text-accent-strong underline underline-offset-2"
        >
          the duel of souls
        </Link>
        .
      </>
    ),
  },
  {
    chapter: "第四",
    jp: "杉森建と西田敦子",
    romaji: "Sugimori Ken · Nishida Atsuko",
    en: "The Silhouette & the Squirrel",
    body: (
      <>
        Ken Sugimori (b. 1966) found Satoshi Tajiri's photocopied games zine{" "}
        <span className="italic">Game Freak</span> in a dōjinshi shop and
        became its illustrator; in 1989 the zine incorporated. The first 151
        Pokémon were a team's work — six or seven designers, Atsuko Nishida
        and Motofumi Fujiwara among them — with Sugimori refining and
        redrawing most of them into one watercolour hand. Recognisability was
        an engineering constraint before it was a doctrine: Game Boy sprites,
        he has said in fan-translated interviews, had to read at a glance; a
        decade later he was still designing Hydreigon so its silhouette "still
        looks like lots of heads." Nishida drew Pikachu. Her first sketch, she
        told the Yomiuri Shimbun in 2018, was a daifuku-like thing with ears;
        asked to make it cuter she turned to squirrels — "At that time, I was
        really into squirrels" (Kotaku's translation) — puffed the cheeks, and
        bent the tail into lightning. When the card game launched in October
        1996 (developed by Creatures Inc., published by Media Factory), the
        credits named four hands: Mitsuhiro Arita, Sugimori, CG artist Keiji
        Kinebuchi — and Tomoaki Imakuni, for exactly one card, Porygon.
        Nishida followed within the year through the earliest promo cards, and
        has never really left: in February 2026 her{" "}
        <span className="italic">Pikachu Illustrator</span> promo sold for a
        record $16.49&nbsp;million — the most ever paid for a Pokémon card.
      </>
    ),
  },
  {
    chapter: "第五",
    jp: "有田満弘",
    romaji: "Arita Mitsuhiro",
    en: "What Is This Creature?",
    body: (
      <>
        Mitsuhiro Arita (b. 1970, Fukuoka) is self-taught — he studied
        electronics and software, not art — and his first professional job, at
        the prototype stage in 1996, became the longest tenure in card
        illustration: the game's original Energy symbols (seven by his own
        count, Colorless included), the Base Set Charizard and Pikachu, and by
        his own archive more than 600 cards since. No one theorises the tiny
        frame better. "One thing I always try to focus on in my illustrations
        is to think about what that Pokémon is," he told Pokémon's official
        profile — observing "reality and nature… as if they could be realistic
        creatures." In Japanese he says he composes for{" "}
        <span className="wardrobe-jp">
          カードになった時に一番効果的な絵面
        </span>{" "}
        — the picture that works best <em>once it becomes a card</em> (JDN,
        2019; our translation) — and insists the creature carry its own will,
        意思. Roughs on paper by preference, finish digital; an official card
        takes roughly seven weeks to two months, with approvals at every
        stage. Around the Pokémon work sit a hundred Culdcept cards, eleven
        years of Final Fantasy XI, concept design for the Berserk films — and,
        in 2024, a first Magic: The Gathering card, approached the only way he
        knows: "What kind of Mitsuhiro Arita artwork would I want to see in
        MTG?" Thirty years in, he is still at the table — guest of honour at
        Japan Expo Paris in July 2026.
      </>
    ),
  },
  {
    chapter: "第六",
    jp: "渡辺けんじと伊藤彰",
    romaji: "Watanabe Kenji · Itō Akira",
    en: "Born for the Frame",
    body: (
      <>
        Two designers whose creatures were born for the game object itself.
        Kenji Watanabe joined the toy-planner WiZ straight out of design
        school; when WiZ and Bandai set out to build a Tamagotchi that could
        fight, he became the Digital Monster's principal designer (1997) and
        has remained its hand since. The look was deliberately American-comics
        — 「それこそ当初はアメコミを意識していましたから」, "from the very
        start, we had American comics in mind" (Bandai interview, 2018; our
        translation) — Spawn, Simon Bisley and Mike Mignola among the
        touchstones he has cited. His pipeline ran illustration-first: finished
        art was handed over for conversion to coarse LCD pixels, and the heavy
        black shading he adopted partly to save time hardened into the
        franchise signature — one that now lives natively on cards, where fan
        databases credit him with over 150 Digimon Card Game illustrations.
        His own word for his role is medium-like — an{" "}
        <span className="italic">itako</span>, channeling a team. Akira Itou
        inverted the manga-first pipeline he trained in: assistant to Kazuki
        Takahashi, then <span className="italic">Yu-Gi-Oh! R</span> (2004–08),
        then co-creator — with game designer Satoshi Nakamura and Bushiroad's
        Takaaki Kidani — of Cardfight!! Vanguard, whose manga (November 2010),
        anime (January 2011) and first decks (February 2011) launched as one
        coordinated birth: the manga artist inside the founding design team,
        his name printed on cards in the game itself.
      </>
    ),
  },
  {
    chapter: "第七",
    jp: "名を刻む手",
    romaji: "na o kizamu te",
    en: "The Names on the Card Face",
    body: (
      <>
        The One Piece Card Game prints its illustrators' names on the card
        face — and then no official database remembers them. The ledger is
        community-kept: a Japanese fan directory tracks over 200 credited
        hands; Limitless keeps per-printing records;{" "}
        <Link
          href="/artists"
          className="text-accent hover:text-accent-strong underline underline-offset-2"
        >
          our own wall
        </Link>{" "}
        hangs 59 named hands from the credits our catalogue carries. The
        credited card face has made guest mangaka an institution: one 2025
        Shonen Jump issue carried a Luffy by Black Clover's Yuki Tabata (our
        wall holds it), an Ace by Shun Saeki, a Sabo by Posuka Demizu; Jujutsu
        Kaisen's Gege Akutami drew all Five Elders for a 2025 booster; Boichi
        an Ace promo in 2023 — roughly two dozen professional mangaka so far,
        per the fan count. The credit feeds an economy: the manga-art Luffy
        alternate was called the game's most expensive card by CGC in 2024,
        selling ungraded above $3,000, counterfeits circulating; specialist
        hands like Kankurou and Sunohara list the game on public multi-TCG
        client rosters; one credited hand is a company, Studio Vigor Co., Ltd.
        What the printed credit means for an illustrator's pay, no named
        outlet has yet recorded — the interview record is thin, and we say so
        rather than fill it in.
      </>
    ),
  },
];

const PRESS: Plate[] = [
  {
    chapter: "第八",
    jp: "発注と監修",
    romaji: "hatchū to kanshū",
    en: "The Order & the Approval",
    body: (
      <>
        How does a card get commissioned? The public record is asymmetric —
        nearly all of it Pokémon. Creatures Inc., the card game's developer,
        plans each card's concept, prepares reference, chooses the illustrator
        and issues the order: the creature, often a place or theme, and
        "sometimes," Arita says, "a specific pose or attack in mind." The art
        then moves rough → line → colour — "each of those three steps has its
        own check and approval process" — seven weeks to two months in all,
        across a roster one 2019 interview put at around eighty illustrators.
        Drafts are reviewed by both Creatures and the Pokémon Company side;
        documented feedback runs as fine as head proportions and how dark a
        piece will print, correcting wherever an artist's reading drifts from
        official standards. The Illustration Contest is the one public window
        — its 2024 rules even publish the judging split: 40% theme, 30%
        originality, 30% design. Everything else must be read through the
        rights line. Bandai's card division built the One Piece game over two
        years "with the cooperation of Eiichiro Oda"; the supervision loops
        with Shueisha and Toei Animation sit behind the copyright line on
        every card, described in public by no one — an inference, and we mark
        it as one. Konami draws Yu-Gi-Oh! substantially in-house and prints no
        artist credit at all; fans petition for names. The finding is the
        opacity itself: outside Pokémon, no publisher opens its order book.
      </>
    ),
  },
  {
    chapter: "第九",
    jp: "刷りと箔",
    piece: {
        src: "/culture-plates/cma-173975.jpg",
        width: 900,
        height: 506,
        title: "Print Block",
        artist: "Unrecorded carver, Japan, Edo period (1615–1868)",
        date: "1700s",
        medium: "Woodblock (carved wood with ink residue); average 17.2 x 33.7 cm",
        credit: "Gift of the John Huntington Art and Polytechnic Trust",
        sourceName: "The Cleveland Museum of Art",
        sourceUrl: "https://clevelandart.org/art/1917.835",
        rights: "Public domain (CC0)",
        alt: "An Edo-period carved wooden printing block, figures cut in relief with dark ink still held in the grain",
      },
    romaji: "suri to haku",
    en: "Ink, Foil, Blade",
    body: (
      <>
        A trading card is a laminated paper sandwich built around an opaque
        core — patents describe two-ply bases under opaque coatings, and
        black-core board that defeats a backlight; that engineered darkness is
        why a sealed pack can be trusted at all. Cards are printed CMYK offset
        on large sheets, typically 100 to 121 cards: "The most normal sheet
        size is eleven cards by eleven cards," Magic's head designer Mark
        Rosewater explains — and since most sheets repeat cards, rarity is
        literally geometry. Foil is physics: a master hologram's
        micro-embossed diffraction pattern, replicated in cured resin,
        metallised with aluminium and applied as hot-stamping foil (US patent
        5,948,199 walks the whole line); the sculpted texture on special-art
        rares is, per collectors' accounts, embossing that follows the
        artwork — no publisher documents it. The blade explains the errors
        collectors prize: miscuts when the cut misses register, square corners
        when a card skips the rounding dies, crimps when one slips into the
        pack-sealer's jaws. And who prints? English Pokémon: Millennium Print
        Group of North Carolina, a partner since 2015 that The Pokémon Company
        International agreed to buy in 2022 and which signed one of the
        biggest US industrial leases of 2025 — 1.27 million square feet of
        card factory. Magic: Cartamundi of Turnhout, Belgium, since Alpha in
        1993. Japan? Nothing public. Toppan has marketed trading-card
        manufacturing since 1999 — platemaking in Itabashi, printing in
        Kawaguchi, finishing in Sakado — and names no client; neither Bandai
        nor Konami names a plant. The scale is not in doubt: 9.1 billion
        Pokémon cards in fiscal 2021 alone; 25.1 billion Yu-Gi-Oh! cards
        cumulative by 2011.
      </>
    ),
  },
  {
    chapter: "第十",
    jp: "封",
    romaji: "fū",
    en: "The Sealing",
    body: (
      <>
        Last comes the question the whole workshop was hired to answer: which
        cards share a pack. Collation is an engineered, sold service — Toppan
        advertises "precise pull rate control aligned with our customers'
        sales strategies" — packs assembled from guaranteed slots by rarity,
        odds set by sheet and machine. God packs — a whole pack of parallels —
        are collation artifacts seeded into Japanese One Piece premium
        boosters; Bandai's pages never say the word, the community's odds
        estimates diverge wildly, and whether they exist in English product is
        contested — our own{" "}
        <Link
          href="/pulls"
          className="text-accent hover:text-accent-strong underline underline-offset-2"
        >
          odds room
        </Link>{" "}
        records verified JP and EN variants while some retailers call them
        Japan-only; both positions stay on the record. In 2026 Toppan even
        announced light-shielding pillow packaging to defeat pack-searchers —
        the opaque core's last mile. Disclosure is asymmetric by publisher:
        Wizards, Legend Story Studios and Fantasy Flight publish odds,
        Bushiroad publishes guarantees, and Bandai, The Pokémon Company,
        Konami and Ravensburger publish none — our own audit, kept live in the
        odds room. Then film, box, case, sea freight. Two centuries ago Sanba
        wrote children into a bathhouse, trading actor prints and judging
        their quality; the pull is older than the pack. The workshop of the
        floating world never closed. It learned to seal itself in foil.
      </>
    ),
  },
];

/** Where we read this — named in the open (the attribution vow). */
type Source = { label: string; href: string };
const SOURCE_GROUPS: { heading: string; sources: Source[] }[] = [
  {
    heading: "The floating world",
    sources: [
      { label: "The Met — Woodblock Prints in the Ukiyo-e Style", href: "https://www.metmuseum.org/toah/hd/ukiy/hd_ukiy.htm" },
      { label: "Library of Congress — The Floating World of Ukiyo-e", href: "https://www.loc.gov/exhibits/ukiyo-e/intro.html" },
      { label: "Asian Art Museum — The Ukiyo-e Printing Process", href: "https://education.asianart.org/resources/the-ukiyo-e-woodblock-printing-process/" },
      { label: "British Museum blog — How to make a woodblock print like Hiroshige", href: "https://www.britishmuseum.org/blog/how-make-woodblock-print-hiroshige" },
      { label: "National Diet Library — 錦絵の製造と販売 (archived)", href: "https://web.archive.org/web/20250514154929/https://www.ndl.go.jp/landmarks/column/2.html" },
    ],
  },
  {
    heading: "The masters",
    sources: [
      { label: "CBS News (AP) — Akira Toriyama obituary, with the 2013 Asahi Shimbun quotes", href: "https://www.cbsnews.com/news/akira-toriyama-dies-dragon-ball-creator-anime-dead-age-68/" },
      { label: "Official Dragon Ball site — The Story Behind Dragon Ball Carddass", href: "https://en.dragon-ball-official.com/news/01_644.html" },
      { label: "VIZ Media — Interview: Eiichiro Oda (2012)", href: "https://www.viz.com/blog/posts/interview-eiichiro-oda-466" },
      { label: "Guinness World Records — most copies published, single-author comic series", href: "https://www.guinnessworldrecords.com/world-records/118397-most-copies-published-by-a-single-author-for-the-same-comic-book-series" },
      { label: "Anime News Network — One Piece Card Game announcement (2022)", href: "https://www.animenewsnetwork.com/news/2022-03-07/one-piece-series-gets-trading-card-game-worldwide/.183339" },
      { label: "Nippon.com — The Legacy of Takahashi Kazuki's Yu-Gi-Oh", href: "https://www.nippon.com/en/japan-topics/g02295/" },
      { label: "Konami — In memory of Mr. Kazuki Takahashi (official, 2022)", href: "https://www.konami.com/games/corporate/en/news/oshirase/20220707/" },
      { label: "Stars and Stripes — the Okinawa rescue account (Oct 2022)", href: "https://www.stripes.com/branches/army/2022-10-11/okinawa-riptide-rescue-yu-gi-oh-7646714.html" },
      { label: "Kotaku — Pikachu's squirrel origins (translating Yomiuri Shimbun, 2018)", href: "https://kotaku.com/pikachu-wasnt-based-on-a-mouse-but-a-squirrel-1825738117" },
      { label: "shmuplations — Pokémon 2000 developer interview (fan translation)", href: "https://shmuplations.com/pokemon/" },
      { label: "The Japan Times — Pikachu Illustrator record sale (Feb 2026)", href: "https://www.japantimes.co.jp/life/2026/02/16/digital/pokemon-card-sale-most-expensive-pikachu-illustrator/" },
      { label: "Pokémon.com — Creator Profile: Mitsuhiro Arita (official)", href: "https://www.pokemon.com/us/pokemon-news/pokemon-creator-profile-mitsuhiro-arita" },
      { label: "JDN — 有田満弘 interview (2019, Japanese)", href: "https://www.japandesign.ne.jp/interview/igp-arita/" },
      { label: "mitsuhiroarita.com — 30 years, 600+ cards (official archive)", href: "https://mitsuhiroarita.com/pokemon/" },
      { label: "Dexerto — Arita on his first Magic: The Gathering card (2024)", href: "https://www.dexerto.com/magic-the-gathering/legendary-pokemon-tcg-artist-mitsuhiro-arita-on-designing-his-first-ever-mtg-card-2857374/" },
      { label: "Bandai Tamashii Web — 渡辺けんじ designer interview (2010)", href: "https://tamashiiweb.com/topics/detail/t_kokkaku_53.html" },
      { label: "Bandai Gashapon — Watanabe interview (2018)", href: "https://gashapon.jp/news/?p=353" },
      { label: "The DigiLab — Habu × Watanabe interviews (fan translation)", href: "https://digi-lab.blog/digimon-games-community-interviews-kenji-watanabe/" },
      { label: "Wikipedia — Cardfight!! Vanguard (creation credits, launch dates)", href: "https://en.wikipedia.org/wiki/Cardfight!!_Vanguard" },
      { label: "onepiececard-letter.com — the fan-kept illustrator directory (200+ hands)", href: "https://onepiececard-letter.com/onepiececard-illustrator-list/" },
      { label: "ONE PIECE.com — Gege Akutami's Five Elders cards (official, 2025)", href: "https://one-piece.com/news/74169/index.html" },
      { label: "CGC Cards — the manga-art Luffy, prices and counterfeits (2024)", href: "https://www.cgccards.com/news/article/13180/" },
    ],
  },
  {
    heading: "The order & the approval",
    sources: [
      { label: "Creatures Inc. — illustration director recruiting interview (Japanese)", href: "https://recruit.creatures.co.jp/cr_people/pokemoncard_illustration_production_sh/" },
      { label: "Pokémon TCG Illustration Contest 2024 — official rules & artist columns", href: "https://www.ptcgic-cr.com/2024/en/agreement/" },
      { label: "Bandai Namco Integrated Report 2023 — the Card Business Division interview", href: "https://www.bandainamco.co.jp/ir/library/assets/pdf/BNH_AR23J_1020_feature02_03.pdf" },
    ],
  },
  {
    heading: "The press & the pack",
    sources: [
      { label: "Mark Rosewater — Odds & Ends: Unfinity (print sheets, collation)", href: "https://magic.wizards.com/en/news/making-magic/odds-and-ends-unfinity" },
      { label: "CGC Cards — the error-card guide (cutting, corners, crimps)", href: "https://www.cgccards.com/news/article/9851/error-card-types/" },
      { label: "US Patent 5,654,050 — the laminated, opaque-cored card", href: "https://patents.google.com/patent/US5654050A/en" },
      { label: "US Patent 5,948,199 — holographic hot-stamping foil", href: "https://patents.google.com/patent/US5948199A/en" },
      { label: "TOPPAN — Trading Card Game Solutions (pull rate control, plants)", href: "https://www.toppan.com/en/tradingcard/" },
      { label: "Shacknews — TPCi acquires Millennium Print Group (2022 release)", href: "https://www.shacknews.com/article/129887/the-pokemon-company-acquires-pokemon-tcg-print-company" },
      { label: "Cartamundi — Magic: The Gathering, printed in Turnhout since Alpha", href: "https://www.cartamundi.com/us/en/product/magic-the-gathering/" },
      { label: "PokeBeach — 9.1 billion Pokémon cards in fiscal 2021 (TPC disclosure)", href: "https://www.pokebeach.com/2022/06/pokemon-tcg-sold-record-9-1-billion-cards-in-2021" },
    ],
  },
];

function PartMark({ jp, en }: { jp: string; en: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-10 sm:pt-14">
      <InkRule className="mb-8" />
      <p className="wardrobe-jp text-2xl sm:text-3xl text-accent tracking-wide">
        {jp}
      </p>
      <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
        {en}
      </p>
    </div>
  );
}

function PlateSection({ plate, index }: { plate: Plate; index: number }) {
  return (
    <section
      className="wardrobe-rise flex items-start gap-5 sm:gap-8 py-10 sm:py-14 border-t border-border-subtle first:border-t-0"
      style={{ "--rise-delay": `${index * 40}ms` } as Record<string, string>}
    >
      <p
        aria-hidden="true"
        className="wardrobe-jp [writing-mode:vertical-rl] text-ink-faint text-sm tracking-[0.35em] pt-1 select-none shrink-0 hidden sm:block"
      >
        {plate.chapter}
      </p>
      <div className="min-w-0">
        <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          {plate.jp}
        </h2>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
          {plate.romaji} — {plate.en}
        </p>
        <p className="mt-4 text-base text-ink-muted leading-relaxed">
          {plate.body}
        </p>
        {plate.piece && <MuseumPlate piece={plate.piece} />}
      </div>
    </section>
  );
}

export default function WorkshopPage() {
  return (
    <main>
      <Audience kind="consumer" contexts={["documentation"]} />

      {/* The front of the wing — a vertical 工房 mark in 明朝, the title,
          and a plain-spoken admission of what this is and isn't. */}
      <header className="relative max-w-3xl mx-auto px-4 pt-16 sm:pt-24 pb-2">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-56 wardrobe-tone-whisper wardrobe-tone-fade pointer-events-none"
        />
        <p
          aria-hidden="true"
          className="wardrobe-jp [writing-mode:vertical-rl] absolute top-16 sm:top-24 right-4 text-ink-faint text-base tracking-[0.4em] select-none pointer-events-none hidden lg:block"
        >
          工房
        </p>
        <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ink-faint mb-4">
          a wing of the museum · 工房
        </p>
        <h1 className="relative font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          The Workshop of the Floating World
        </h1>
        <p className="relative mt-4 wardrobe-jp text-lg text-accent">
          浮世の工房
          <span className="text-ink-muted"> — the masters &amp; the press</span>
        </p>
        <p className="relative mt-6 text-base sm:text-lg text-ink-muted leading-relaxed">
          Every card in this house was drawn by a real hand and printed by a
          real machine. This wing tells both halves: seven plates for the
          master artists behind the games we carry — their lives, their
          creeds, their lines — and three for the industrial press that folds
          an approved illustration into a sealed booster. We're a card shop,
          not scholars: the shaky claims are marked as shaky, the quotes were
          verified against their sources before we hung them (translations
          say so), and where the industry keeps its doors shut we report the
          shut door instead of guessing what's behind it.
        </p>
        <InkRule className="relative mt-8" />
      </header>

      {/* Prologue — the four hands of the Edo workshop, and our hedged
          reading that the booster pack is the same workshop, re-hired. */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <PlateSection plate={PROLOGUE} index={0} />
      </div>

      <PartMark jp="第一部 · 絵師" en="part one — the masters" />
      <div className="max-w-3xl mx-auto px-4 py-4">
        {MASTERS.map((m, i) => (
          <PlateSection key={m.chapter} plate={m} index={i} />
        ))}
      </div>

      <PartMark jp="第二部 · 工房" en="part two — the press" />
      <div className="max-w-3xl mx-auto px-4 py-4">
        {PRESS.map((m, i) => (
          <PlateSection key={m.chapter} plate={m} index={i} />
        ))}
      </div>

      {/* The honest apparatus: how this was made, where we read it, and an
          open door for fixes. */}
      <div className="max-w-3xl mx-auto px-4 pb-16 pt-6">
        <InkRule className="mb-8" />
        <h2 className="font-display text-xl font-semibold text-ink">
          Where we read this{" "}
          <span className="wardrobe-jp text-accent text-base">出典</span>
        </h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed">
          A card shop writing about living and recently departed artists owes
          its receipts. Every quotation above was checked against the source
          named here before publication; quotes that reach English through
          translation — official, journalistic, or fan — are marked in the
          text, and the Japanese original is always the authority. The
          deceased are described only by officially announced fact, with
          later reporting attributed to who reported it. If we've got
          something wrong, tell us and we'll mend it.
        </p>
        {SOURCE_GROUPS.map((g) => (
          <div key={g.heading} className="mt-6">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
              {g.heading}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {g.sources.map((s) => (
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
          </div>
        ))}
        <p className="mt-6 text-xs text-ink-faint leading-relaxed">
          No licensed artwork is reproduced here — apart from the museum
          plates above (open-access, public domain, each with its wall label
          and canonical record), the only pictures we hang are the
          cards themselves, in{" "}
          <Link
            href="/"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            the gallery
          </Link>{" "}
          and on{" "}
          <Link
            href="/artists"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            the artists' wall
          </Link>
          . The line these masters draw from is traced in{" "}
          <Link
            href="/lineage"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            The Lineage of the Line
          </Link>
          ; what the sealed pack feels like to open is at{" "}
          <Link
            href="/pull-and-pause"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            The Pull &amp; the Pause
          </Link>
          ; the odds the collation machines set are said out loud in{" "}
          <Link
            href="/pulls"
            className="text-accent hover:text-accent-strong underline underline-offset-2"
          >
            the odds room
          </Link>
          .
        </p>
      </div>

      <Benediction line="The workshop never closed; it learned to seal itself in foil." />
    </main>
  );
}
