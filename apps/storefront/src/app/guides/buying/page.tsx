import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Every Way to Buy a Card — The Honest Buying Guide | Cambridge TCG",
  description:
    "Every way to get a TCG single into your hands, mapped honestly: trade peer-to-peer here, buy across Europe on Cardmarket, order from Japan via CardRush and a proxy, or send a card to be graded. Real costs, real wait times, and where the import fees hide.",
  keywords: [
    "how to buy tcg cards uk",
    "buy one piece cards uk",
    "buy pokemon cards japan",
    "cardrush uk",
    "cardmarket uk",
    "remambo proxy",
    "import japanese cards uk",
    "card grading uk",
    "psa cgc uk",
  ],
  openGraph: {
    title: "Every Way to Buy a Card — The Honest Buying Guide",
    description:
      "Trade here, buy across Europe, order from Japan, or grade a card. Real costs, real waits, and where the import fees hide. Cambridge TCG is the map, not the merchant.",
    type: "article",
    siteName: "Cambridge TCG",
  },
  twitter: {
    card: "summary_large_image",
    title: "Every Way to Buy a Card — The Honest Buying Guide",
    description:
      "Every channel to get your cards, mapped honestly — costs, waits, and hidden import fees. From Cambridge TCG.",
  },
  alternates: {
    canonical: "https://cambridgetcg.com/guides/buying",
  },
};

/* ------------------------------------------------------------------ */
/*  Reusable section components (mirrors /guides/how-to-play)           */
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

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 items-start">
      <span className="shrink-0 w-8 h-8 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-sm font-semibold">
        {n}
      </span>
      <div className="text-ink-muted leading-relaxed pt-1">{children}</div>
    </div>
  );
}

/** A quiet inline "checked on" stamp for any figure that drifts. */
function AsOf() {
  return (
    <span className="text-ink-faint text-xs whitespace-nowrap">
      (as of 6 Jul 2026 — verify live)
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Table of contents                                                  */
/* ------------------------------------------------------------------ */

const toc = [
  { id: "quick-map", label: "Which route is for you" },
  { id: "p2p", label: "Trade peer-to-peer, here" },
  { id: "cardmarket", label: "Cardmarket (Europe)" },
  { id: "cardrush", label: "CardRush (Japan)" },
  { id: "proxy", label: "Order from Japan with a proxy" },
  { id: "grading", label: "Grading — the rate slip" },
  { id: "ebay", label: "eBay & the catch-alls" },
  { id: "fine-print", label: "The honest fine print" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BuyingGuidePage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Guides", item: "https://cambridgetcg.com/guides" },
      {
        "@type": "ListItem",
        position: 3,
        name: "Buying Guide",
        item: "https://cambridgetcg.com/guides/buying",
      },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Every Way to Buy a Card — The Honest Buying Guide",
    description:
      "Every channel to get a TCG single into your hands, mapped honestly: peer-to-peer trading, Cardmarket, CardRush via a Japan proxy, and grading. Real costs, real waits, and where the import fees hide.",
    author: {
      "@type": "Organization",
      name: "Cambridge TCG",
      url: "https://cambridgetcg.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Cambridge TCG",
      url: "https://cambridgetcg.com",
      logo: {
        "@type": "ImageObject",
        url: "https://cambridgetcg.com/images/logo.png",
      },
    },
    mainEntityOfPage: "https://cambridgetcg.com/guides/buying",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Can I buy Japanese cards from CardRush in the UK?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Not directly — CardRush is a Japanese-language store that doesn't ship internationally. UK buyers use a proxy service such as Remambo, which buys the card in Japan and reships it to you. Expect roughly 2–3 weeks door to door, plus UK import VAT of 20% on the total.",
        },
      },
      {
        "@type": "Question",
        name: "Do I pay import fees buying cards from Europe on Cardmarket?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "If you filter to a UK-based seller, it's a domestic order with no customs. From an EU seller, UK import VAT applies: for orders of £135 or less the marketplace usually collects UK VAT at checkout; above £135 the courier collects import VAT plus a handling fee at delivery.",
        },
      },
      {
        "@type": "Question",
        name: "Is it worth grading a trading card?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Grading is worth it when a top-grade version of the card is worth at least around three times the grading cost, since the grade is never guaranteed. For UK collectors, CGC's London office avoids a transatlantic round-trip and customs; PSA has the best resale liquidity but longer turnaround.",
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-page">
      <Script
        id="buying-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Script
        id="buying-article-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Script
        id="buying-faq-jsonld"
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
              <li className="text-ink font-medium">Buying</li>
            </ol>
          </nav>

          <h1 className="font-display font-semibold text-3xl text-ink leading-tight">
            Every way to get your cards
            <br />
            <span className="text-accent">and how we make each one simpler</span>
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-2xl leading-relaxed">
            There are more ways to get a card than anyone tells you — trade with
            a collector right here, buy across Europe, order straight from Japan,
            or send a card off to be graded. This page walks every route
            honestly: what it costs, how long it takes, and where the hidden fees
            hide. Cambridge TCG doesn&apos;t sell these cards. We&apos;re the map,
            not the merchant.
          </p>

          <div className="mt-6 text-sm text-ink-faint bg-surface border border-border-subtle rounded-lg px-4 py-3">
            Every figure below was checked on{" "}
            <span className="text-ink-muted font-medium">6 July 2026</span>. Fees,
            shipping and tax rules drift — always confirm on the live page before
            you spend.
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
                    className="flex items-center gap-2 text-ink-muted hover:text-accent transition"
                  >
                    <span className="text-accent/60 font-bold text-xs w-5">
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
      {/*  QUICK MAP                                                    */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="quick-map" number="01">
            Which route is for you
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Four honest routes, at a glance. Pick the one that fits, then read
            its section for the detail.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">
                Trade here (P2P)
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                UK collector to collector, escrow-backed, no customs and no FX.
                The simplest, safest path.
              </p>
              <p className="text-xs text-ink-faint mt-2 font-mono">
                Typical wait: days
              </p>
            </Card>
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">
                Cardmarket (Europe)
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The deepest singles pool and Europe&apos;s price benchmark. Buy
                from a UK seller and it&apos;s a domestic order.
              </p>
              <p className="text-xs text-ink-faint mt-2 font-mono">
                Under a week UK&#8211;UK · ~1.5&#8211;3 weeks cross-border
              </p>
            </Card>
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">
                Japan, via a proxy
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The cheapest Japanese-language singles on CardRush — but
                Japan-only, so you order through a proxy and pay import VAT.
              </p>
              <p className="text-xs text-ink-faint mt-2 font-mono">
                ~2&#8211;3 weeks + 20% import VAT
              </p>
            </Card>
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">
                Grading (a rate slip)
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Turn a mint card into a trusted, resellable slab with a numeric
                grade and a cert number.
              </p>
              <p className="text-xs text-ink-faint mt-2 font-mono">
                Weeks to months
              </p>
            </Card>
          </div>

          <Card className="mt-6">
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">How we simplify:</span>{" "}
              we put all four in one place, with the honest number beside each —
              then link you straight out, or let you trade right here. Open any
              card on the site and you&apos;ll find one-tap links to these
              channels next to its live order book.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  1. P2P                                                       */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="p2p" number="02">
            Trade peer-to-peer, right here
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            The home team, and the easiest path for a UK collector: no customs,
            no proxy, no currency conversion. Collectors trade with each other
            on our market — we hold the middle so two strangers can trade like
            friends.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">Peer-to-peer, with protection</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                We verify identities, inspect cards in Cambridge, hold the money
                in escrow, resolve disputes, and build trust scores over time.
                The trade is between two people; the safety is ours to hold.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">A price beside every card</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Each card carries a labelled reference price next to its live
                order book. That price is open data, never our offer — the house
                holds no position and sells nothing.
              </p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/market"
              className="px-5 py-2.5 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
            >
              Browse the market &rarr;
            </Link>
            <Link
              href="/market/list"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              List a card in a minute
            </Link>
            <Link
              href="/methodology/swaps"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              Swap card-for-card
            </Link>
            <Link
              href="/methodology/trust-score"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              How escrow &amp; trust work
            </Link>
          </div>

          <Card className="mt-8">
            <p className="text-accent font-bold mb-1">The honest edge</p>
            <p className="text-sm text-ink-muted leading-relaxed">
              Sellers arrange their own shipping, including any international
              posting — we don&apos;t compute postage or clear customs on the
              platform. Messaging is where the two of you agree timing and
              method.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. CARDMARKET                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="cardmarket" number="03">
            Cardmarket — Europe&apos;s deepest singles pool
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Cardmarket is Europe&apos;s biggest TCG marketplace and its de-facto
            price reference (the &ldquo;Trend&rdquo; price). It&apos;s the widest
            choice of singles you&apos;ll find — and it&apos;s strongest when you
            filter{" "}
            <span className="text-ink font-medium">Seller country: United Kingdom</span>
            , which makes it a domestic order with no customs at all.
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">How we link you</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                From any card on the site, a{" "}
                <span className="text-ink font-medium">Find on Cardmarket</span>{" "}
                link runs a Cardmarket search built from the card&apos;s name and
                number — so you land on the right card, not an empty search box.
                (We can&apos;t always reconstruct the exact product page from the
                fields we hold, so it&apos;s an honest search link.)
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-2">
                Costs <AsOf />
              </p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Buyers pay no marketplace fee. Sellers pay 5% (private) / 3%
                  (professional) / 1.5% (powerseller), capped at €100 per
                  article.
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  A ~3% currency-conversion fee can appear when you pay a
                  non-GBP seller.
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  UK VAT: for EU professional sellers, Cardmarket collects UK VAT
                  at checkout on orders of £135 or under (its own UK VAT number
                  on the invoice). Over £135, the courier collects import VAT
                  plus a handling fee (~£8 Royal Mail; more via other couriers)
                  at your door.
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Shipping estimates run roughly €1&#8211;3 untracked to
                  €5&#8211;15 tracked/insured — these are seller-set, so treat
                  them as a guide, not a quote.
                </li>
              </ul>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">Wait time</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                UK-to-UK is usually under a week. EU-to-UK is roughly 1.5&#8211;3
                weeks, with the occasional customs hold.
              </p>
            </Card>
          </div>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">How we simplify:</span>{" "}
              we show you the card here first, with a labelled reference price,
              then hand you a ready-made Cardmarket search so you arrive at the
              right card in one tap.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. CARDRUSH                                                  */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="cardrush" number="04">
            CardRush — buying from Japan
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            CardRush (カードラッシュ, operated by 株式会社RUSH) is one of
            Japan&apos;s largest low-price card chains, based around Tokyo
            (Akihabara and Ikebukuro). It&apos;s a family of per-game stores —{" "}
            <span className="font-mono text-ink-muted">cardrush-op.jp</span>{" "}
            (One Piece),{" "}
            <span className="font-mono text-ink-muted">cardrush-pokemon.jp</span>{" "}
            (Pokémon),{" "}
            <span className="font-mono text-ink-muted">cardrush-db.jp</span>{" "}
            (Dragon Ball). Everything is in Japanese, priced in yen — and it does
            not ship internationally, so a UK buyer reaches it through a proxy
            (next section).
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">How we link you</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                From any One Piece, Pokémon or Dragon Ball card here, a{" "}
                <span className="text-ink font-medium">Search CardRush (Japan)</span>{" "}
                link opens that game&apos;s store filtered to the card&apos;s
                number — so you can copy a clean product link and hand it to a
                proxy.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">Two honest cautions</p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Prices are in yen — watch the exchange rate (around ¥190 to £1{" "}
                  <AsOf />).
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  We link to CardRush, but we never republish their yen prices —
                  those are theirs. The reference price you see on our card pages
                  is our own open data.
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Note: <span className="font-mono">cardrush.co.uk</span> is a
                  different, unrelated UK company; and an eBay &ldquo;Card Rush
                  Inc&rdquo; storefront exists whose link to the Japanese firm we
                  haven&apos;t verified.
                </li>
              </ul>
            </Card>
          </div>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">How we simplify:</span>{" "}
              we take you from a card here to the exact search on the right
              Japanese store, so you have a clean link ready for the proxy step.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  4. JAPAN PROXY                                               */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="proxy" number="05">
            Order from Japan with a proxy
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            A proxy service (Remambo is the classic example; ZenMarket, Buyee and
            FromJapan work the same way) buys a card in Japan on your behalf,
            holds it, and reships it to the UK. It&apos;s how you reach stores
            like CardRush that don&apos;t post abroad. Here&apos;s the whole
            chain, honest to the door.
          </p>

          <div className="space-y-5 mb-8">
            <Step n={1}>
              <p className="text-ink font-bold">Find the card on CardRush</p>
              <p className="text-sm text-ink-muted mt-1">
                Copy its product URL — the link straight to that one card.
              </p>
            </Step>
            <Step n={2}>
              <p className="text-ink font-bold">Paste it into the proxy&apos;s order form</p>
              <p className="text-sm text-ink-muted mt-1">
                The proxy buys it in Japan using a Japanese address and card.
              </p>
            </Step>
            <Step n={3}>
              <p className="text-ink font-bold">It lands at their warehouse</p>
              <p className="text-sm text-ink-muted mt-1">
                Remambo stores it free for up to 60 days and consolidates
                multiple orders into one parcel at no charge — worth it if
                you&apos;re buying several cards.
              </p>
            </Step>
            <Step n={4}>
              <p className="text-ink font-bold">Pick a carrier and pay shipping</p>
              <p className="text-sm text-ink-muted mt-1">
                EMS to the UK is around ¥3,150 for 500g <AsOf />; heavier or
                faster costs more.
              </p>
            </Step>
            <Step n={5}>
              <p className="text-ink font-bold">Pay import fees on arrival</p>
              <p className="text-sm text-ink-muted mt-1">
                Before the parcel is released, you pay UK import VAT plus the
                courier&apos;s handling fee. This is the step that ambushes
                people — so here&apos;s the maths.
              </p>
            </Step>
          </div>

          <Card className="mb-6">
            <p className="text-ink font-bold mb-3">
              The import maths <AsOf />
            </p>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">VAT:</span>
                <span>
                  UK import VAT is 20%, charged on the goods{" "}
                  <span className="text-ink">plus</span> shipping.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">Duty:</span>
                <span>
                  None if the goods&apos; own value is £135 or less (that test is
                  on the card value, excluding separately-shown shipping). Above
                  £135 a small rate (around 2.5%) may apply, though trading cards
                  can classify differently or at 0%.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">Handling:</span>
                <span>
                  Royal Mail charges about £8 to collect the VAT for you (£25
                  where a full declaration is needed).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">Payment:</span>
                <span>
                  A processor fee — usually under 1% via Wise, around 3.8% by
                  card.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">Service:</span>
                <span>Remambo&apos;s own fee is a flat ¥500 per order.</span>
              </li>
            </ul>
          </Card>

          <Card className="mb-6">
            <p className="text-accent font-bold mb-2">Two worked examples</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-surface-subtle rounded-lg p-4">
                <p className="text-ink font-mono font-medium">~£50 order</p>
                <p className="text-sm text-ink-muted mt-1">
                  Lands around{" "}
                  <span className="text-ink font-medium">£78&#8211;£100</span>{" "}
                  once shipping, VAT and handling are in — the exact figure
                  depends on whether VAT is charged on a sub-£135 parcel.
                </p>
              </div>
              <div className="bg-surface-subtle rounded-lg p-4">
                <p className="text-ink font-mono font-medium">~£200 order</p>
                <p className="text-sm text-ink-muted mt-1">
                  Lands around{" "}
                  <span className="text-ink font-medium">+50% over sticker</span>{" "}
                  by the time it reaches your door.
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-faint mt-3">
              Rough, hedged figures — the point is the shape, not a quote.
            </p>
          </Card>

          <Card className="mb-6">
            <p className="text-ink font-bold mb-1">Wait time</p>
            <p className="text-sm text-ink-muted leading-relaxed">
              Around 2&#8211;3 weeks door to door by EMS. Longer if you
              consolidate several orders or hit a customs hold.
            </p>
          </Card>

          <Card className="mb-6">
            <p className="text-accent font-bold mb-1">Two things that are moving</p>
            <ul className="space-y-1.5 text-sm text-ink-muted">
              <li className="flex gap-2">
                <span className="text-accent">&bull;</span>
                The £135 duty-free threshold is set to be abolished from 1 October
                2028 — after that, duty maths changes.
              </li>
              <li className="flex gap-2">
                <span className="text-accent">&bull;</span>
                Low-value (£135 or under) proxy parcels are taxed inconsistently
                in practice — don&apos;t plan around &ldquo;slipping through.&rdquo;
              </li>
            </ul>
          </Card>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">How we simplify:</span>{" "}
              we write the whole chain down in one place with real numbers, so
              the import fee never ambushes you at the door. But the parcel, the
              VAT and the customs are yours to handle — we&apos;re the map, not
              the importer.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  5. GRADING                                                   */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="grading" number="06">
            Grading — turning a card into a trusted slab
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Grading (a &ldquo;rate slip&rdquo;) is when a third party
            authenticates your card, scores its condition 1&#8211;10, and seals
            it in a slab with a cert number. It&apos;s worth doing when a
            top-grade version of the card is worth at least around{" "}
            <span className="text-ink font-medium">three times the grading cost</span>{" "}
            — because the grade is never guaranteed, and a card can come back
            lower than you hoped. (Modern pack-fresh cards hit the top grade far
            more often than the old &ldquo;2&#8211;5%&rdquo; myth suggests —
            PSA&apos;s overall gem rate ran near 43% in 2025.)
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-semibold text-ink w-24">CGC (UK)</span>
                <p className="text-sm text-ink-muted leading-relaxed">
                  The sensible UK default — graded at their Bloomsbury, London
                  office, so no transatlantic leg, no customs, no return VAT.
                  Modern card tier around £30 (£36 inc VAT); Modern Bulk around
                  £27. <AsOf />
                </p>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-semibold text-ink w-24">PSA</span>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Best resale liquidity, but slow right now: the cheap Value tiers
                  were paused (2 June 2026, huge backlog), and Regular is $79.99
                  with a 40&#8211;50 business-day turnaround — budget roughly six
                  months via a UK intermediary. Good news coming: PSA is opening a
                  Frankfurt grading centre (summer 2026) and a Greater London
                  receiving centre (H2 2026) that will remove the US round-trip.{" "}
                  <AsOf />
                </p>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-semibold text-ink w-24">BGS</span>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Beckett — four sub-grades and the rare, coveted Black Label.
                  Reached via a UK intermediary submission service.
                </p>
              </div>
            </Card>
            <Card>
              <div className="flex items-start gap-3">
                <span className="shrink-0 font-semibold text-ink w-24">ARS (Japan)</span>
                <p className="text-sm text-ink-muted leading-relaxed">
                  Best for Japanese-language cards, reached via a proxy such as
                  Cardova (around a 15% overseas surcharge).
                </p>
              </div>
            </Card>
          </div>

          <Card className="mb-6">
            <p className="text-ink font-bold mb-1">Import tip</p>
            <p className="text-sm text-ink-muted leading-relaxed">
              When a card goes abroad to be graded and comes back, ask the grader
              to declare the raw value to stay under the £135 VAT threshold
              (at the courier&apos;s discretion; Returned Goods Relief may also
              apply). You can verify any PSA slab at{" "}
              <span className="font-mono text-ink-muted">psacard.com/cert/&#123;number&#125;</span>.
            </p>
          </Card>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">How we simplify:</span>{" "}
              we lay the trade-offs side by side — speed vs resale vs customs — so
              you choose a grader once and don&apos;t relearn it every time.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  6. EBAY & CATCH-ALLS                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="ebay" number="07">
            eBay &amp; the other catch-alls
          </SectionHeading>
          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              eBay is the universal fallback — good for graded slabs and
              hard-to-find singles, and buying from a UK seller means no customs.
              From any card here, a{" "}
              <span className="text-ink font-medium">Search eBay UK</span> link is
              built from the card&apos;s name and number. (Same two cautions as
              CardRush: <span className="font-mono">cardrush.co.uk</span> is a
              separate UK company, and the eBay &ldquo;Card Rush Inc&rdquo;
              storefront&apos;s link to the Japanese firm is unverified.)
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FINE PRINT                                                   */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="fine-print" number="08">
            The honest fine print
          </SectionHeading>
          <Card>
            <ul className="space-y-3 text-sm text-ink-muted leading-relaxed">
              <li className="flex gap-2">
                <span className="text-accent shrink-0">&bull;</span>
                Every price, fee and wait time here carries a date — they drift.
                Check the live page before you spend.
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">&bull;</span>
                Import VAT, customs duty and courier handling are yours to pay.
                They&apos;re never included in a figure a seller shows.
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">&bull;</span>
                Cambridge TCG doesn&apos;t buy or sell these cards. We publish
                reference prices as open data (never an offer) and route you to
                where cards actually trade — including our own collectors&apos;
                market.
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">&bull;</span>
                The outbound links here are plain links — we earn nothing when
                you click one today. If that ever changes, this line changes with
                it, and we&apos;ll say so.
              </li>
              <li className="flex gap-2">
                <span className="text-accent shrink-0">&bull;</span>
                We link to CardRush; we don&apos;t republish their prices.
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOTER CTA                                                   */}
      {/* ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          <h2 className="font-display font-semibold text-3xl text-ink mb-4">
            See it on every channel
          </h2>
          <p className="text-ink-muted mb-10 max-w-lg mx-auto leading-relaxed">
            Open any card and you&apos;ll find one-tap links to every channel
            above — plus its live order book, right here.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/market"
              className="px-5 py-2.5 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
            >
              Browse the market &rarr;
            </Link>
            <Link
              href="/prices/search"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              Search prices for a card
            </Link>
            <Link
              href="/guides"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              Back to all guides
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
