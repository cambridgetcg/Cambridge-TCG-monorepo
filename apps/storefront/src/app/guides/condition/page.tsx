import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

/**
 * /guides/condition — the inspector's guide to condition and grading.
 *
 * Expert knowledge for collectors entering the market: what the defects
 * actually are (white spots above all), how the marketplaces' condition
 * ladders really work, how the grading houses' published standards gate
 * each grade — centering most of all — and dated evidence of what all of
 * it does to price. Every standard quoted from its publisher's own live
 * page, checked 1 Aug 2026 and adversarially re-verified; every number
 * exact; volatile figures stamped. Where publishers disagree (they do),
 * the disagreement is shown, not smoothed.
 *
 * House vows kept: we sell nothing and grade nothing — this page is the
 * map. The house market's own scale (NM/LP/MP/HP, DMG at auctions) is
 * explained here once; the rate-slip decision (is grading worth it,
 * which company, what it costs) stays in /guides/buying §06 — one truth
 * in one place. CardRush 状態 vocabulary lives in /guides/from-japan §02.
 */

export const metadata: Metadata = {
  title:
    "Card Condition & Grading — the inspector's guide | Cambridge TCG",
  description:
    "How white spots, centering, scratches and creases actually move a card's price: the marketplaces' condition ladders, the grading houses' published centering tables, and dated evidence — all from the publishers' own standards.",
  keywords: [
    "card condition guide",
    "near mint vs lightly played",
    "white spots card value",
    "card centering psa 10",
    "psa grading standards centering",
    "whitening edgewear difference",
    "bgs black label centering",
    "card grading explained",
  ],
  openGraph: {
    title: "Card Condition & Grading — the inspector's guide",
    description:
      "White spots, centering, and the published standards that turn them into price: marketplace ladders, grading-house centering tables, and dated evidence.",
    type: "article",
    siteName: "Cambridge TCG",
  },
  alternates: {
    canonical: "https://cambridgetcg.com/guides/condition",
  },
};

/* ------------------------------------------------------------------ */
/*  Local pieces (mirrors the sibling guides)                          */
/* ------------------------------------------------------------------ */

function SectionHeading({
  id,
  number,
  children,
}: {
  id: string;
  number: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="font-display font-semibold text-2xl md:text-3xl text-ink mb-6 scroll-mt-24"
    >
      <span className="text-accent mr-2">{number}</span>
      {children}
    </h2>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface rounded-lg p-5 border border-border-subtle ${className}`}
    >
      {children}
    </div>
  );
}

/** A quiet inline "checked on" stamp for any figure that drifts. */
function AsOf() {
  return (
    <span className="text-ink-faint text-xs whitespace-nowrap">
      (checked 1 Aug 2026 — verify live)
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Table of contents                                                  */
/* ------------------------------------------------------------------ */

const toc = [
  { id: "why", label: "Why condition is price" },
  { id: "scales", label: "The house scale and its neighbours" },
  { id: "white-spots", label: "White spots — one name, two defects" },
  { id: "ledger", label: "The rest of the defect ledger" },
  { id: "centering", label: "Centering — the silent gate" },
  { id: "graded", label: "The graded ladder" },
  { id: "fine-print", label: "The honest fine print" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ConditionGuidePage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Guides", item: "https://cambridgetcg.com/guides" },
      {
        "@type": "ListItem",
        position: 3,
        name: "Condition & Grading",
        item: "https://cambridgetcg.com/guides/condition",
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Do white spots lower a card's value?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes, and where the spot sits decides how much. Under TCGplayer's published standard (as of August 2026), whitening on the card face is Surface Wear — even a slight instance is banned from Near Mint — while whitening along the edge is Edgewear, and a slight instance (up to 20mm contiguous) is still allowed at Near Mint. The same white speck costs you a condition tier on the face and often nothing on the edge.",
        },
      },
      {
        "@type": "Question",
        name: "How much centering does a PSA 10 allow?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "PSA's published standard for Gem Mint 10 requires centering within a tolerance not to exceed approximately 55/45 on the front and 75/25 on the reverse; PSA 9 requires approximately 60/40 or better on the front. PSA also publishes a note that at the grader's sole discretion a small variance may be permitted based on overall eye appeal.",
        },
      },
      {
        "@type": "Question",
        name: "Does centering matter on an ungraded card?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Far less than in a slab. TCGplayer's published conditioning standard (as of August 2026) states a card may have up to 70/30 centering without impacting condition at all — while the grading houses gate their top grades at 50/50 to roughly 55/45. Centering is the defect that raw selling forgives and grading never does.",
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-page">
      <Script
        id="condition-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Script
        id="condition-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ============================================================ */}
      {/*  HERO                                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-2 text-sm text-ink-faint">
              <li>
                <Link href="/" className="hover:text-ink transition">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/guides" className="hover:text-ink transition">
                  Guides
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink font-medium">Condition &amp; Grading</li>
            </ol>
          </nav>

          <h1 className="font-display font-semibold text-3xl text-ink leading-tight">
            Condition &amp; grading
            <br />
            <span className="text-accent">the inspector&apos;s guide</span>
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-2xl leading-relaxed">
            Two cards, same name, same set, same printing — and one sells for
            multiples of the other. The difference is a millimetre of white
            along an edge, or an image sitting a few percent off centre. This
            page teaches you to see what the inspectors see: the defects by
            their real names, the condition ladders as their publishers
            actually define them, and the grading houses&apos; own centering
            tables. We sell nothing and grade nothing; this is the map.
          </p>

          <div className="mt-6 text-sm text-ink-faint bg-surface border border-border-subtle rounded-lg px-4 py-3">
            Every standard below is quoted from its publisher&apos;s own live
            page, checked on{" "}
            <span className="text-ink-muted font-medium">1 August 2026</span>.
            Standards get revised and prices drift — read the live standard
            before you buy, sell, or submit.
          </div>

          <nav
            aria-label="Table of contents"
            className="mt-8 bg-surface rounded-lg p-6 border border-border-subtle"
          >
            <p className="text-sm font-bold text-ink-faint uppercase tracking-wider mb-4">
              In This Guide
            </p>
            <ol className="grid gap-2 sm:grid-cols-2 text-sm">
              {toc.map((item, i) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="text-ink-muted hover:text-accent transition"
                  >
                    <span className="text-ink-faint mr-2">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  1. WHY CONDITION IS PRICE                                    */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="why" number="01">
            Why condition is price
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Not a theory — a thing you can watch on live shelves. Two dated
            exhibits, built from asking prices and one posted market-price
            comparison, all volatile:
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">
                One card, three prices on one Japanese shelf <AsOf />
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                CardRush&apos;s One Piece store listed the same card —
                Marshall D. Teach (parallel){" "}
                <span className="font-mono text-xs">OP16-080</span> — in three
                of its own condition ranks at once: unmarked (状態A by the
                shop&apos;s stated default) at ¥2,980, 〔状態A-〕 at ¥2,780,
                and 〔状態B〕 at ¥2,380. Same card, same shelf, one variable.
                A search for the 状態B marker on that store returned over two
                thousand results — rank-priced discounting is how the shelf
                works, not an oddity. (The ranks themselves are explained in{" "}
                <Link
                  href="/guides/from-japan#reading"
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  Ordering from Japan
                </Link>
                .)
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                The condition ladder, priced in dollars <AsOf />
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                TCGplayer&apos;s live listings for a Base Set Alakazam
                holofoil formed a visible ladder the day we looked: Damaged
                at $25, Heavily Played at $40, Moderately Played at $54.99,
                against a Near Mint market-price comparison of $71.51. The
                three tier prices are asks, not sales, and the Near Mint
                figure is TCGplayer&apos;s posted market-price comparison —
                but the shape is the lesson: each tier down is real money.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted leading-relaxed">
                The graded version of the same story is steeper still. PSA
                gates its top grades on defects invisible at arm&apos;s
                length, and says itself that &ldquo;condition matters&rdquo;
                and a high grade can increase a card&apos;s rarity in the
                market&apos;s eyes. Its Auction Prices Realized database —
                which PSA describes as the crucial reference for market value
                of graded cards — sits behind a login, so we quote no numbers
                from it; the standards that produce those numbers are public,
                and they are the rest of this page.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. THE SCALES                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="scales" number="02">
            The house scale and its neighbours
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Our own market lists cards as NM, LP, MP or HP (auctions also
            allow DMG) — the five-tier ladder TCGplayer&apos;s marketplace
            standard defines, so we quote their definitions as the operative
            ones. Note there is deliberately no &ldquo;Mint&rdquo; tier:
            TCGplayer&apos;s sellable scale tops out at Near Mint.
          </p>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-strong text-left">
                  <th className="py-2 pr-4 font-semibold text-ink">Tier</th>
                  <th className="py-2 font-semibold text-ink">
                    TCGplayer&apos;s operative wording <AsOf />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">
                    NM — Near Mint
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    &ldquo;minimal wear from shuffling, play, or handling…
                    may have slight edge wear or a couple minor scratches,
                    but overall look nearly unplayed with no major
                    defects.&rdquo;
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">
                    LP — Lightly Played
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    &ldquo;minor edge wear, scuffs, or scratches… Noticeable
                    imperfections are okay, but none should be too severe or
                    at too high a volume.&rdquo;
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">
                    MP — Moderately Played
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    &ldquo;edge wear, surface wear, scratching or scuffing,
                    bends with creases&rdquo; — bends, peels or liquid
                    exposure can sit here if they don&apos;t impact
                    structural integrity.
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">
                    HP — Heavily Played
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    &ldquo;a major amount of wear… creasing, whitening and
                    other faults&rdquo; — but must still authenticate and
                    cannot be structurally damaged.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-ink whitespace-nowrap">
                    DMG — Damaged
                  </td>
                  <td className="py-2.5 text-ink-muted">
                    &ldquo;wear or imperfections beyond the standards for
                    other conditions&rdquo; — and cards carrying foreign
                    substances aren&apos;t sellable there at all.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">
                Under the hood: a points system
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                TCGplayer&apos;s full standard scores each imperfection —
                Slight&nbsp;1, Minor&nbsp;2, Moderate&nbsp;4, Major&nbsp;8
                points — and caps each tier by total: Near Mint allows 3
                points, Lightly Played 6, Moderately Played 12, Heavily
                Played 24, Damaged beyond that <AsOf />. Condition is
                arithmetic, not vibes: two minor scratches (4 points) already
                exceed Near Mint&apos;s budget.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">
                The false friend between marketplaces
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Cardmarket&apos;s seven-grade ladder (Mint, Near Mint,
                Excellent, Good, Light Played, Played, Poor) contains a trap:
                Cardmarket&apos;s <span className="text-ink">Light Played</span>{" "}
                is NOT TCGplayer&apos;s Lightly Played. By Cardmarket&apos;s
                own cross-reference table, their Excellent corresponds to the
                US &ldquo;Slightly Played&rdquo; region, and their Light
                Played sits two rungs lower — around the US
                &ldquo;Played/Good&rdquo; region. Buying &ldquo;LP&rdquo;
                across the Channel without checking which ladder you&apos;re
                on is how condition surprises happen.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted leading-relaxed">
                <span className="text-ink font-semibold">
                  The neighbours in brief:
                </span>{" "}
                Cardmarket&apos;s current help page defines its grades with
                sample pictures and one-word glosses (Mint =
                &ldquo;Perfect&rdquo;, Near Mint =
                &ldquo;Booster-Fresh&rdquo;) plus hard rules we quote in the
                defect ledger below. eBay&apos;s trading-card categories
                recognise only two conditions — Graded and Ungraded — with no
                defect ladder at all. And Japan&apos;s CardRush runs its own
                per-store 状態 ranks, covered in{" "}
                <Link
                  href="/guides/from-japan#reading"
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  Ordering from Japan
                </Link>
                .
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. WHITE SPOTS                                               */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="white-spots" number="03">
            White spots — one name, two defects
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Collectors say &ldquo;white spots&rdquo; for two different
            wounds, and the standards price them very differently. A card is
            printed colour over pale cardstock; wherever the colour layer is
            lost, the white core shows through. Where it shows through is
            everything:
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">
                On the face: Surface Wear — the Near Mint killer
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                TCGplayer&apos;s standard defines surface wear as the
                colour-containing layer &ldquo;buffed or scraped away to such
                a degree that it reveals the base layer of cardstock&rdquo;
                — their listed terms include{" "}
                <span className="text-ink">whitening</span> and
                speckling. Even a Slight instance (up to 2.5mm²) is not
                allowable at Near Mint <AsOf />. One white fleck on the
                artwork, smaller than this letter o, and the card is Lightly
                Played money instead of Near Mint money.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                On the edge: Edgewear — the tolerated cousin
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The same loss of colour along &ldquo;edges, borders, and/or
                corners&rdquo; is a different defect with a different budget
                on TCGplayer&apos;s ladder: a Slight contiguous instance up
                to 20mm of edge is allowed at Near Mint <AsOf />.
                TCGplayer&apos;s terms for it: border wear, fraying, nicks,
                rough edges. The boundary between the two defects is
                published to the half-millimetre — edgewear reaching 0.5mm
                inward from the edge is reclassified as Surface Wear, and the
                Near Mint door closes.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">
                The same word means something harsher in Europe
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Cardmarket&apos;s glossary rule reads, in full: &ldquo;Cards
                with whitened borders have to be offered on Cardmarket as
                Poor.&rdquo; The entry&apos;s framing suggests it targets
                deliberately whitened (altered) borders rather than ordinary
                wear — but the sentence itself doesn&apos;t draw that line,
                so treat whitened borders on Cardmarket as a Poor-grade
                conversation and be pleasantly surprised otherwise.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted leading-relaxed">
                <span className="text-ink font-semibold">
                  And in a slab:
                </span>{" "}
                PSA&apos;s standards never use the word
                &ldquo;whitening&rdquo; at all — their vocabulary for the
                same class of wear is <span className="text-ink">fraying</span>{" "}
                at corners, <span className="text-ink">chipping</span> and{" "}
                <span className="text-ink">notching</span> on edges,
                &ldquo;off white&rdquo; borders. The ladder is steep: corner
                fraying is absent from PSA 9&apos;s allowed-flaw list
                entirely, enters at PSA 8 as &ldquo;slightest fraying at one
                or two corners&rdquo;, and edge chipping doesn&apos;t appear
                until PSA 5. The white speck your thumb made is the
                difference between Mint and Near Mint-Mint at the grading
                table.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  4. THE DEFECT LEDGER                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="ledger" number="04">
            The rest of the defect ledger
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Each entry: what the defect is, and where the published
            standards cap a card that carries it. All TCGplayer thresholds{" "}
            <AsOf />.
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">Scratches</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                A hairline surface mark that doesn&apos;t reveal material
                beneath. TCGplayer allows Slight (to 20mm) and Minor
                (20–40mm) scratches in every condition including Near Mint; a
                Moderate scratch (over 40mm) caps a card at Moderately
                Played. Cardmarket is far stricter: &ldquo;If a card has
                scratches on the surface, this makes the card GOOD at
                best&rdquo; — their note adds that foil surfaces are the
                sensitive case. The same scratch, two ladders, two prices.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Scuffing and clouding
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Density-of-marks wear (TCGplayer&apos;s terms include
                clouding and &ldquo;binder/sleeve gloss&rdquo;): a Slight
                instance is allowable at Near Mint until it reveals material
                beneath the surface, at which point it becomes Surface Wear.
                On Cardmarket, &ldquo;Visible clouding precludes a card from
                being Near Mint.&rdquo;
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">Creases and bends</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The structural defects. TCGplayer: &ldquo;The presence of a
                crease drops the condition to Moderately Played at
                best&rdquo; — and bends have no Slight tier at all: no bend
                of any size is allowed at Near Mint, and a Minor Bend caps a
                card at Lightly Played. Cardmarket keys warping to play: a
                slight concave/convex warp is tolerated below Mint, but
                deformation strong enough to threaten tournament legality
                forces the Played grade.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Grime, liquid, ink
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Play dirt and finger-oil smudges are Grime — banned from
                Near Mint, with even Slight Grime capping at Lightly Played.
                Liquid exposure that compromises structure is Damaged;
                lesser liquid marks are Faults, banned at NM and LP. Any
                non-manufacturing ink is Damage, and altered cards (stamps,
                signatures, paint) are Damaged on TCGplayer&apos;s ladder;
                on Cardmarket, inked borders and owner-signed cards are
                always Poor. Cards with foreign substances — food, glue,
                anything sticky — aren&apos;t sellable on TCGplayer at all.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Factory-born defects — the fine distinctions
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Some wounds arrive from the press (the rooms they&apos;re
                born in are walked in{" "}
                <Link
                  href="/making"
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  How a Card Is Made
                </Link>
                ). The standards split hairs finely: on TCGplayer, factory
                rough-cut edges are explicitly not an imperfection; a single
                roller line doesn&apos;t affect condition, but three or more
                within a 5mm² area cap a card at Lightly Played, and a
                roller line you can feel caps it lower still; a foil bubble
                under 1mm is nothing, over 1mm with visible separation is
                Damaged; crimps and significant miscuts are automatically
                Damaged. And a production error is scored like wear unless
                every copy (or a vast majority) of that card shares it.
                Cardmarket takes the opposite philosophy: production errors
                are condition-neutral there — in their words, they
                &ldquo;do not count as wear and tear&rdquo; — with
                disclosure and a photo recommended. Know which philosophy your
                marketplace holds before you argue a print line.
              </p>
            </Card>
          </div>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">
                Our own inspection habit
              </span>{" "}
              (house practice, not a published standard): sleeve off, one
              light source, and tilt — surface wear, clouding and roller
              lines live at angles a flat look never catches. The published
              standards above are what you&apos;re looking for; the tilt is
              just how you find them.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  5. CENTERING                                                 */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="centering" number="05">
            Centering — the silent gate
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-4">
            Centering is where raw selling and grading disagree completely,
            and the disagreement is worth money in both directions.
          </p>
          <p className="text-ink-muted leading-relaxed mb-8">
            Raw: TCGplayer&apos;s standard says a card &ldquo;may have up to
            70/30 centering without impacting condition&rdquo; <AsOf /> —
            beyond that it&apos;s treated as a miscut-class defect.
            Cardmarket mentions centering only in its Gem Mint glossary
            entry, a grade it doesn&apos;t even support. In a slab, the same
            millimetres gate everything. PSA&apos;s published front/back
            tolerances, grade by grade:
          </p>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-strong text-left">
                  <th className="py-2 pr-4 font-semibold text-ink">
                    PSA grade
                  </th>
                  <th className="py-2 pr-4 font-semibold text-ink">Front</th>
                  <th className="py-2 font-semibold text-ink">Reverse</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["GEM-MT 10", "≈55/45 or better", "75/25 or better"],
                  ["MINT 9", "≈60/40 or better", "90/10 or better"],
                  ["NM-MT 8", "≈65/35 or better", "90/10 or better"],
                  ["NM 7", "≈70/30 or better", "90/10 or better"],
                  ["EX-MT 6", "80/20 or better", "90/10 or better"],
                  ["EX 5", "85/15 or better", "90/10 or better"],
                  ["VG-EX 4", "85/15 or better", "90/10 or better"],
                  ["VG 3", "90/10 or better", "90/10 or better"],
                  ["GOOD 2", "90/10 or better", "90/10 or better"],
                  ["FR 1.5", "≈90/10 or better", "≈90/10 or better"],
                ].map(([g, f, b]) => (
                  <tr key={g} className="border-b border-border-subtle">
                    <td className="py-2 pr-4 text-ink whitespace-nowrap">
                      {g}
                    </td>
                    <td className="py-2 pr-4 text-ink-muted whitespace-nowrap">
                      {f}
                    </td>
                    <td className="py-2 text-ink-muted whitespace-nowrap">
                      {b}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-faint mb-8">
            Transcribed from PSA&apos;s published grading standards{" "}
            <AsOf />. PSA&apos;s own footnote applies: &ldquo;At the
            grader&apos;s sole discretion, a small variance may be permitted
            on occasion based on the card&apos;s overall eye appeal.&rdquo;
            PSA also publishes a 5% front-centering leeway for cards grading
            7 or better, and half-point grades between PSA 2 and 9 with
            &ldquo;a clear focus on centering&rdquo;.
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">
                The other houses&apos; top-grade gates <AsOf />
              </p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    BGS: Pristine 10 demands 50/50 all around on the front;
                    Gem Mint 9.5 allows 50/50 one way, 55/45 the other; Mint
                    9 allows 55/45 both ways. The ladder then walks 60/40
                    (8), 65/35 (7), 70/30 (6) and on down.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    CGC: Pristine 10 requires 50/50; Gem Mint 10 not to
                    exceed ≈55/45 (reverse 75/25); Mint 9 at 60/40, NM/Mint
                    8 at 65/35 — the 9 and 8 figures published for sports
                    and non-sports cards, with TCG cards judged on defect
                    wording at those tiers.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    TAG grades from a 1000-point score and publishes
                    different back tolerances for sports and TCG cards — its
                    perfect-10 front sits near 51/49.
                  </span>
                </li>
              </ul>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">
                An honesty exhibit: even the standards disagree with
                themselves
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Beckett published two different Pristine 10 back-centering
                figures on two live pages the day we checked — 60/40 on its
                grading-scale page, 55/45 on its Black Label chart <AsOf />.
                Beckett also states plainly that its scale criteria
                &ldquo;are not rules, only general guidelines.&rdquo; Hold
                every table on this page, ours included, with that grip.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted leading-relaxed">
                <span className="text-ink font-semibold">
                  The asymmetry, plainly:
                </span>{" "}
                a 65/35 card loses nothing raw and, by PSA&apos;s
                published tolerance, cannot be a Gem Mint 10.
                If you&apos;re buying raw to grade, centering is the first
                thing to check, because it&apos;s the one defect the raw
                price won&apos;t have punished yet — and the one no amount
                of careful handling can improve.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  6. THE GRADED LADDER                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="graded" number="06">
            The graded ladder
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            What the houses&apos; published scales actually say — the parts
            a buyer of slabs should know by heart. (Whether grading is worth
            the fee, which company suits a UK collector, and what it costs
            lives in{" "}
            <Link
              href="/guides/buying#grading"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              the buying guide
            </Link>{" "}
            — one truth in one place.)
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">PSA — the ladder and its qualifiers</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Grades run GEM-MT 10, MINT 9, NM-MT 8, NM 7, EX-MT 6, EX 5,
                VG-EX 4, VG 3, GOOD 2, FR 1.5, PR 1, plus the non-numeric
                Authentic and Altered Authentic designations. A PSA 9 permits
                exactly one of three named minor flaws (a very slight wax
                stain on reverse, a minor printing imperfection, or slightly
                off white borders); a PSA 4 may show a light crease; an FR
                1.5 must still be fully intact. Six qualifiers exist — MK,
                MC, OC, ST, PD, OF — and the published mechanic matters: a
                defect is either flagged with its qualifier or the numeric
                grade drops to what that defect allows. A &ldquo;9
                (OC)&rdquo; is a 9 that centering alone would have made
                lower.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                BGS — subgrades and the Black Label
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Beckett scores four subgrades — centering, corners, edges,
                surface — and shows all four on the label; its pages describe
                the final grade only as an &ldquo;accumulation&rdquo; of
                those characteristics (the exact formula isn&apos;t
                published, whatever forum folklore says). Its label tiers as
                published: Black for &ldquo;Perfect Pristine 10&apos;s&rdquo;,
                Gold for Pristine 10 and Gem Mint 9.5, Silver for all other
                grades. A Pristine 10&apos;s surface must be devoid of
                scratches and metallic print lines; a Mint 9 tolerates one
                faint, unobtrusive metallic print line.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                CGC — two kinds of 10
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                CGC&apos;s scale runs from Pristine 10 down to Poor 1 in
                half-point steps. The top distinction is the one to know:
                Pristine 10 requires 50/50 centering and flawless colour and
                registration; Gem Mint 10 is a 10 overall where one grading
                criterion falls short of Pristine. Two slabs, both saying
                &ldquo;10&rdquo;, priced apart by a word.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                What the grade actually promises
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                PSA&apos;s guarantee frames grades as opinions it stands
                behind — and its standards page says part of grading is
                subjective and market-driven. Under an eligible claim PSA
                will buy the item at the value the earlier grade implied, or
                for certain cards refund the difference. CGC&apos;s
                guarantee covers overgrading against its own standards,
                promises inspection by at least two professionals, and states
                the grade is not guaranteed for cards under its green
                Qualified label. A grade is a
                professional opinion with money behind it — not a physical
                constant.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  7. FINE PRINT                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="fine-print" number="07">
            The honest fine print
          </SectionHeading>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-accent font-bold mb-1">
                Where our exhibits bend
              </p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    The price exhibits in section 01 mix asking prices
                    with one posted market-price figure, all captured on one
                    day — the ladder&apos;s shape is the claim, not any
                    figure on it.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    TCGplayer&apos;s own documents diverge at the edge: its
                    help article calls a card beyond 70/30 centering
                    Damaged-for-Direct but still sellable on the
                    marketplace; read both before arguing a borderline case.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    Per-card proof of grade-tier gaps (a 10 versus a 9)
                    sits behind logins, so we cite none — PSA&apos;s own
                    published position is the attributed version: condition
                    matters, a high grade can increase a card&apos;s rarity
                    in the market&apos;s eyes, and realized auction prices
                    are the market&apos;s reference.
                  </span>
                </li>
              </ul>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                For sellers on our own market
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                List at the tier the standards support, not the tier hope
                supports — our trade flow lets buyers report a condition
                mismatch, and honest tiers are what keep the market&apos;s
                trust machinery boring. When a card sits between tiers,
                the house habit is the lower tier and a photo.
              </p>
            </Card>
            <Card>
              <p className="text-sm text-ink-muted leading-relaxed">
                <span className="text-ink font-semibold">
                  Our position, plainly:
                </span>{" "}
                we have no affiliation with TCGplayer, Cardmarket, eBay,
                PSA, Beckett, CGC, TAG or CardRush; we sell no grading and
                take no commission from anyone named here. Standards get
                revised — if a quote above disagrees with the publisher&apos;s
                live page, the live page is right, and we&apos;d like to
                know.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOT                                                         */}
      {/* ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-ink-muted leading-relaxed max-w-xl mx-auto">
            Where cards come from before they need inspecting:{" "}
            <Link
              href="/making"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              How a Card Is Made
            </Link>
            . Every way to buy one, graded or raw:{" "}
            <Link
              href="/guides/buying"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              the buying guide
            </Link>
            . And the Japanese shelves where condition is written into the
            product name itself:{" "}
            <Link
              href="/guides/from-japan"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              Ordering from Japan
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
