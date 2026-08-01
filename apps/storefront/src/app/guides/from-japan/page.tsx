import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

/**
 * /guides/from-japan — the CardRush directory and the Remambo walkthrough.
 *
 * A tribute that pays its way: CardRush's shops don't ship overseas —
 * so the kindest thing a map can do is show the door AND the way
 * through it. Every store host below answered a live check on
 * 1 Aug 2026 (the Pokémon store's bot-wall 403s scripts; its host is
 * alive and cross-linked from the stores we opened), and every
 * factual claim (fees, ranks, policies) was verified against the shop's
 * or the proxy's own pages, then adversarially re-checked; anything we
 * could not verify is either absent or named as unverified.
 *
 * House vows kept: no affiliation, no commission, no tracking on the way
 * out — plain links. We honour CardRush's robots.txt boundary (their
 * catalogue data stays theirs; our ingest treats it as blocked) — the way
 * we repay a shop we admire is to send it people, not crawlers. The
 * import maths lives in /guides/buying (one truth in one place); this
 * page links to it rather than repeating it.
 */

export const metadata: Metadata = {
  title:
    "Ordering from Japan — the CardRush directory & Remambo walkthrough | Cambridge TCG",
  description:
    "Every CardRush store, linked directly, and the whole Remambo proxy flow step by step: fees, condition ranks, consolidation, shipping methods and the traps. Verified against the live pages.",
  keywords: [
    "cardrush order from uk",
    "cardrush international shipping",
    "remambo tutorial",
    "remambo cardrush",
    "buy japanese cards proxy",
    "japanese card condition ranks",
    "状態A cardrush meaning",
  ],
  openGraph: {
    title: "Ordering from Japan — CardRush & Remambo, step by step",
    description:
      "Every CardRush store linked directly, plus the whole proxy flow: fees, condition ranks, consolidation, shipping and the traps — verified against the live pages.",
    type: "article",
    siteName: "Cambridge TCG",
  },
  alternates: {
    canonical: "https://cambridgetcg.com/guides/from-japan",
  },
};

/* ------------------------------------------------------------------ */
/*  Local pieces (mirrors /guides/buying)                              */
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
      (checked 1 Aug 2026 — verify live)
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  The shelf directory — hosts live-checked 1 Aug 2026 (pokemon 403s) */
/* ------------------------------------------------------------------ */

const STORES: {
  href: string;
  host: string;
  game: string;
  jp: string;
  note?: string;
  priceGuide?: string;
}[] = [
  {
    href: "https://www.cardrush.jp/",
    host: "cardrush.jp",
    game: "Yu-Gi-Oh!",
    jp: "遊戯王",
    note: "the flagship — the store the others grew from",
    priceGuide: "/prices/yu-gi-oh",
  },
  {
    href: "https://www.cardrush-op.jp/",
    host: "cardrush-op.jp",
    game: "One Piece Card Game",
    jp: "ワンピースカード",
    priceGuide: "/prices/one-piece",
  },
  {
    href: "https://www.cardrush-pokemon.jp/",
    host: "cardrush-pokemon.jp",
    game: "Pokémon TCG",
    jp: "ポケカ",
    note: "sits behind a strict bot-wall — open it in a normal browser",
    priceGuide: "/prices/pokemon",
  },
  {
    href: "https://www.cardrush-db.jp/",
    host: "cardrush-db.jp",
    game: "Dragon Ball Super Fusion World",
    jp: "ドラゴンボール",
    priceGuide: "/prices/dragon-ball",
  },
  {
    href: "https://www.cardrush-digimon.jp/",
    host: "cardrush-digimon.jp",
    game: "Digimon Card Game",
    jp: "デジカ",
    priceGuide: "/prices/digimon",
  },
  {
    href: "https://www.cardrush-vanguard.jp/",
    host: "cardrush-vanguard.jp",
    game: "Cardfight!! Vanguard",
    jp: "ヴァンガード",
    priceGuide: "/prices/vanguard",
  },
  {
    href: "https://www.cardrush-bs.jp/",
    host: "cardrush-bs.jp",
    game: "Battle Spirits Saga",
    jp: "バトスピ",
    priceGuide: "/prices/battle-spirits",
  },
  {
    href: "https://www.cardrush-mtg.jp/",
    host: "cardrush-mtg.jp",
    game: "Magic: The Gathering",
    jp: "MTG",
    priceGuide: "/prices/magic",
  },
  {
    href: "https://www.cardrush-dm.jp/",
    host: "cardrush-dm.jp",
    game: "Duel Masters",
    jp: "デュエマ",
  },
  {
    href: "https://www.cardrush-sv.jp/",
    host: "cardrush-sv.jp",
    game: "Shadowverse EVOLVE",
    jp: "シャドバ",
  },
];

/* ------------------------------------------------------------------ */
/*  Table of contents                                                  */
/* ------------------------------------------------------------------ */

const toc = [
  { id: "shops", label: "The ten shelves of CardRush" },
  { id: "reading", label: "Reading a Japanese listing" },
  { id: "remambo", label: "Remambo, step by step" },
  { id: "shipping", label: "Getting it out of Japan" },
  { id: "fine-print", label: "The honest fine print" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FromJapanGuidePage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Guides", item: "https://cambridgetcg.com/guides" },
      {
        "@type": "ListItem",
        position: 3,
        name: "Ordering from Japan",
        item: "https://cambridgetcg.com/guides/from-japan",
      },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Does CardRush ship internationally?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. CardRush's own help page states that its orders and shipping methods assume domestic Japanese delivery only and that it does not ship directly overseas. Overseas buyers reach it through a proxy-purchase service such as Remambo, which buys in Japan on your behalf and reships internationally.",
        },
      },
      {
        "@type": "Question",
        name: "What does Remambo charge to order from CardRush?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "As of August 2026, Remambo's service fee is 500 yen per order, where one order is any number of items bought together from the same store at once — so a whole CardRush cart is one fee. You pay the item price, fee, domestic shipping and a payment transaction fee first, then international shipping separately when the parcel leaves Japan. Import VAT and customs at your border are extra and are your responsibility.",
        },
      },
      {
        "@type": "Question",
        name: "What does 状態A / 状態B mean on a CardRush listing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "状態 (joutai) means condition. On CardRush's One Piece store the scale runs 状態A, A-, B, C — and a listing with no condition mark in its name is 状態A by the shop's stated default. The scale differs per store: the Yu-Gi-Oh flagship runs S through D, and the MTG store uses Western-style grades like EX+. The One Piece store and the Yu-Gi-Oh flagship publish their own condition guides; read the guide of the store you're buying from.",
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-page">
      <Script
        id="from-japan-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Script
        id="from-japan-faq-jsonld"
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
              <li className="text-ink font-medium">Ordering from Japan</li>
            </ol>
          </nav>

          <h1 className="font-display font-semibold text-3xl text-ink leading-tight">
            Ordering from Japan
            <br />
            <span className="text-accent">
              the CardRush directory and the Remambo walkthrough
            </span>
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-2xl leading-relaxed">
            CardRush (カードラッシュ) is a family of ten specialist stores
            run by 株式会社RUSH from Akihabara — one per game, and none of
            them ship overseas. This page is the whole
            journey: every store linked directly, how to read a listing, and the
            proxy flow through Remambo step by step. We have no affiliation with
            either company and earn nothing from any link here — this is a map
            drawn out of respect for a good shop.
          </p>

          <div className="mt-6 text-sm text-ink-faint bg-surface border border-border-subtle rounded-lg px-4 py-3">
            Every figure and policy below was checked against the live CardRush
            and Remambo pages on{" "}
            <span className="text-ink-muted font-medium">1 August 2026</span>.
            Fees, ranks and rules drift — always confirm on the page in front of
            you before you spend.
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
      {/*  1. THE SHELVES                                               */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="shops" number="01">
            The ten shelves of CardRush
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-4">
            CardRush is not one store but a family — one storefront per game,
            each with its own stock, its own condition guide and its own search.
            The company behind them, 株式会社RUSH, runs four physical shops
            (three around Sotokanda in Akihabara, one in Ikebukuro; one of the
            Akihabara shops was marked temporarily closed at our check) and lists
            its registered office inside the same Akihabara building as one of
            them. The flagship store — plain{" "}
            <span className="font-mono text-ink-muted">cardrush.jp</span> — is
            the Yu-Gi-Oh shop; it cross-links all nine sisters, and the sister
            stores we opened do the same. Their own storefront titles claim 日本最大級 (&ldquo;among
            Japan&apos;s largest&rdquo;) for some stores and 日本最安級
            (&ldquo;among Japan&apos;s cheapest&rdquo;) for others — their
            words, not ours.
          </p>
          <p className="text-ink-muted leading-relaxed mb-8">
            All ten <AsOf /> — nine answered our checks directly; the Pokémon
            store&apos;s front door refuses scripted visitors, so open it in a
            normal browser:
          </p>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-strong text-left">
                  <th className="py-2 pr-4 font-semibold text-ink">Game</th>
                  <th className="py-2 pr-4 font-semibold text-ink">Store</th>
                  <th className="py-2 font-semibold text-ink">
                    Our price guide
                  </th>
                </tr>
              </thead>
              <tbody>
                {STORES.map((s) => (
                  <tr key={s.host} className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4 text-ink">
                      {s.game}{" "}
                      <span className="text-ink-faint text-xs">{s.jp}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-accent hover:text-accent-strong underline underline-offset-2"
                      >
                        {s.host}
                      </a>
                      <span aria-hidden="true" className="text-ink-faint">
                        {" "}
                        &#8599;
                      </span>
                      {s.note && (
                        <span className="block text-xs text-ink-faint mt-0.5">
                          {s.note}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {s.priceGuide ? (
                        <Link
                          href={s.priceGuide}
                          className="text-accent hover:text-accent-strong transition"
                        >
                          reference prices &rarr;
                        </Link>
                      ) : (
                        <span className="text-ink-faint">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <Card>
              <p className="text-ink font-bold mb-1">
                Why we link out instead of scraping
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                CardRush&apos;s robots.txt declares its boundary for automated
                readers (the Pokémon store&apos;s file spells out{" "}
                <span className="font-mono text-xs">ai-train=no</span> as an
                express reservation of rights). We honour it: automated
                acquisition is hard-blocked on our side, legacy captures stay
                withheld, and the reference prices on our card pages are
                derived, rights-labelled guides that never republish theirs.
                The way to repay a shop you admire is to send it people, not
                crawlers.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. READING A LISTING                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="reading" number="02">
            Reading a Japanese listing
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Everything is in Japanese and priced in yen (税込 — tax included).
            Four words carry most of what you need.
          </p>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-1">
                状態 — the condition rank, per store
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                On the One Piece store the scale is 〔状態A〕 / 〔状態A-〕 /
                〔状態B〕 / 〔状態C〕, written inside the product name itself —
                and by the shop&apos;s own stated rule,{" "}
                <span className="text-ink">
                  a listing with no condition mark is 状態A
                </span>
                . 状態A still allows small white specks and light surface wear —
                it is the shop&apos;s honest near-top grade, not a promise of
                gem mint. The scale is not uniform across the family: the
                Yu-Gi-Oh flagship runs 状態S down to 状態D, and the MTG store
                uses Western-style grades such as{" "}
                <span className="font-mono text-xs">[EX+]</span>. The One
                Piece store and the flagship publish their own condition
                guides — we read both — so read the guide of the store
                you&apos;re buying from, not a general one.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">未開封 — unopened</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Sealed listings we read carry 未開封 in the name rather than a
                rank, and high-value ones spell it out again in the description
                (【こちらは未開封商品です。】 — &ldquo;this is an unopened
                item&rdquo;).
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">在庫なし — out of stock</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Listings stay visible after they sell. If you see 在庫なし,
                the card is gone — hand the proxy a link to a listing that still
                shows an add-to-cart button.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                傷アリ特価 — the damaged-card bargain corner
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The One Piece store runs a marked-down corner for visibly worn
                cards, sorted by colour — 傷アリ特価(色別). For a played deck
                or a binder filler, the discounts are real; for display pieces,
                stay in the ranked listings. As one snapshot of how sharply
                rank prices a card: the same shelf listed a 状態B foil promo at
                ¥180 while sealed chase listings sat in the hundreds of
                thousands of yen <AsOf />.
              </p>
            </Card>
          </div>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">
                From a card page here:
              </span>{" "}
              on One Piece, Pokémon, Dragon Ball, Digimon, Vanguard and Battle
              Spirits cards, the{" "}
              <span className="text-ink font-medium">
                Search CardRush (Japan)
              </span>{" "}
              link opens the right store pre-filtered to that card&apos;s
              number — copy the product URL of the exact listing you want, and
              you&apos;re ready for the next section.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. REMAMBO                                                   */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="remambo" number="03">
            Remambo, step by step
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-4">
            CardRush&apos;s help page is plain about the boundary:
            海外への直接の発送は承っておりません — &ldquo;we do not accept
            direct shipment overseas.&rdquo; The bridge is a proxy-purchase
            service. This walkthrough uses{" "}
            <a
              href="https://www.remambo.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              Remambo
            </a>{" "}
            (run by Ringo, LLC of Toyama, established 2015; the site is in
            English), because its flat fee suits single-store card orders.
            Other names you may hear — Buyee, ZenMarket, FromJapan — we have
            not walked or verified, so we describe only Remambo.
          </p>
          <p className="text-ink-muted leading-relaxed mb-8">
            The shape of every proxy order: they buy in Japan with a Japanese
            address, hold the parcel at their warehouse, then ship it to you.
            You pay twice — once to buy, once to ship out of Japan.
          </p>

          <div className="space-y-5 mb-8">
            <Step n={1}>
              <p className="text-ink font-bold">Make an account</p>
              <p className="text-sm text-ink-muted mt-1">
                Signup is by email — the password is emailed to you, and you
                confirm you hold no other Remambo accounts. Note their support
                runs through account messaging, not phone or email.
              </p>
            </Step>
            <Step n={2}>
              <p className="text-ink font-bold">
                Copy the CardRush product URL
              </p>
              <p className="text-sm text-ink-muted mt-1">
                The link to the exact listing — rank label, price and 在庫
                status visible. One listing, one URL.
              </p>
            </Step>
            <Step n={3}>
              <p className="text-ink font-bold">
                Paste it into the Add Item URL form
              </p>
              <p className="text-sm text-ink-muted mt-1">
                Remambo&apos;s order form (&ldquo;Step 1 of 3&rdquo;) takes any
                Japanese store URL. Add each card separately —{" "}
                <span className="text-ink">
                  items from the same store are automatically combined into one
                  order
                </span>
                . The form then asks for the item&apos;s details; we
                haven&apos;t pushed a live order through the later steps, so
                follow its prompts.
              </p>
            </Step>
            <Step n={4}>
              <p className="text-ink font-bold">Pay the first charge</p>
              <p className="text-sm text-ink-muted mt-1">
                At purchase you pay: the item price, Remambo&apos;s service fee
                — ¥500 per order, and for shops an order is{" "}
                <span className="text-ink">
                  any number of items bought together from the same store at
                  once
                </span>{" "}
                <AsOf /> — plus domestic shipping to their warehouse and a
                payment transaction fee (rates not published; PayPal, Visa,
                Mastercard, Amex, bank wire and Wise are accepted). A whole
                CardRush cart under one ¥500 fee is what makes multi-card
                orders worthwhile.
              </p>
            </Step>
            <Step n={5}>
              <p className="text-ink font-bold">Let it land, then consolidate</p>
              <p className="text-sm text-ink-muted mt-1">
                Storage is free for up to 60 days, and consolidating several
                orders into one box is free too — but a consolidation, once
                applied for, cannot be changed, added to or cancelled. Parcels
                left past the 60 days may be disposed of without refund, so
                don&apos;t let a slow last order strand a full box.
              </p>
            </Step>
            <Step n={6}>
              <p className="text-ink font-bold">
                Choose a carrier and pay the second charge
              </p>
              <p className="text-sm text-ink-muted mt-1">
                International shipping plus any optional services (next
                section). After it leaves Japan, whatever your border charges —
                VAT, duty, the courier&apos;s handling fee — is yours to pay;
                Remambo says plainly that customs is the customer&apos;s
                responsibility, and that consolidation can increase customs
                charges. The UK maths is worked through in{" "}
                <Link
                  href="/guides/buying#proxy"
                  className="text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  the buying guide
                </Link>
                .
              </p>
            </Step>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  4. SHIPPING                                                  */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="shipping" number="04">
            Getting it out of Japan
          </SectionHeading>
          <p className="text-ink-muted leading-relaxed mb-8">
            Remambo&apos;s published methods <AsOf />, fastest first. For
            cards, the deciding line is compensation — a few grams of cardboard
            can be worth more than the default cover.
          </p>

          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-strong text-left">
                  <th className="py-2 pr-4 font-semibold text-ink">Method</th>
                  <th className="py-2 pr-4 font-semibold text-ink">Time</th>
                  <th className="py-2 font-semibold text-ink">
                    Worth knowing
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink">FedEx / DHL / UPS</td>
                  <td className="py-2.5 pr-4 text-ink-muted">4–10 days</td>
                  <td className="py-2.5 text-ink-muted">
                    Couriers; FedEx also takes parcels over Japan Post&apos;s
                    size and weight limits.
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink">EMS</td>
                  <td className="py-2.5 pr-4 text-ink-muted">5–10 days</td>
                  <td className="py-2.5 text-ink-muted">
                    Tracked; default compensation ¥20,000, extendable by paid
                    cover to ¥2,000,000 — the sane choice for a valuable card.
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink">AVIA airmail</td>
                  <td className="py-2.5 pr-4 text-ink-muted">10–15 days</td>
                  <td className="py-2.5 text-ink-muted">
                    Tracked, with comparable compensation tiers.
                  </td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-2.5 pr-4 text-ink">ePacket / small packet</td>
                  <td className="py-2.5 pr-4 text-ink-muted">7–21 days</td>
                  <td className="py-2.5 text-ink-muted">
                    Up to 2&nbsp;kg, tracked —{" "}
                    <span className="text-ink">no compensation at all</span>.
                    Never put an expensive card on it.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-ink">Surface (sea)</td>
                  <td className="py-2.5 pr-4 text-ink-muted">1–4 months</td>
                  <td className="py-2.5 text-ink-muted">
                    The slow boat — fine for bulk commons, an eternity for
                    anything you&apos;re excited about.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Card>
            <p className="text-ink font-bold mb-1">
              Optional services worth knowing <AsOf />
            </p>
            <ul className="space-y-1.5 text-sm text-ink-muted">
              <li className="flex gap-2">
                <span className="text-accent">&bull;</span>
                <span>
                  Contents Checking, ¥500 — they verify the item&apos;s condition and
                  contents before it ships; the closest thing to eyes on your
                  card.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">&bull;</span>
                <span>
                  Buyer Protection, ¥500 per order — covers seller
                  non-shipment within 30 days of purchase, wrong items and
                  listings that differ significantly. Read its card-shaped hole in the fine print
                  below before you buy it.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">&bull;</span>
                <span>
                  Repacking ¥500, stretch-film wrapping ¥500, order splitting
                  ¥250, shipment modification ¥1,000–4,000 by weight.
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  5. FINE PRINT                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="fine-print" number="05">
            The honest fine print
          </SectionHeading>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-accent font-bold mb-1">
                Buyer Protection does not cover booster boxes
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Remambo&apos;s own page states it: &ldquo;Buyer protection does
                not cover TCG (trading card game) displays (booster
                boxes).&rdquo; It also never covers the international leg —
                damage or loss in transit is the carrier compensation&apos;s
                job, which is why the shipping table above matters.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">
                The returns terms are narrow
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                On the One Piece store&apos;s published terms — each store
                publishes its own, so check the one you buy from — seven days
                from arrival, and only for wrong items or goods in
                clearly bad condition (their examples: complete bends, a card
                torn in two); condition-based returns of graded products are
                excluded, and that shop refuses cancellations it judges to be
                motivated by market price movement. Through a proxy, any claim
                also runs through the proxy — CardRush routes
                forwarding-service support through the agent. Read the rank
                definitions before you buy, not after.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-bold mb-1">
                Never pick cash-on-delivery
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                CardRush states it cancels 代金引換 (COD) orders it detects as
                bound for overseas-forwarding addresses — so never ask a proxy
                to pay a shop cash-on-delivery.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">Small print that bites</p>
              <ul className="space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    Cards are not on Remambo&apos;s prohibited list, but
                    intangibles are — codes and e-tickets can&apos;t be
                    proxied.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    Paying by PayPal locks shipping to the country registered
                    on your PayPal address.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  <span>
                    Remambo won&apos;t ship to addresses inside Japan — it is a
                    bridge out, not a domestic courier.
                  </span>
                </li>
              </ul>
            </Card>
          </div>

          <Card>
            <p className="text-sm text-ink-muted leading-relaxed">
              <span className="text-ink font-semibold">Our position, plainly:</span>{" "}
              we have no affiliation, referral arrangement or commission with
              CardRush, Remambo or any shop or proxy named here, and no money
              moves in any direction when you click. The reference prices on
              our card pages are our own derived guide and never republish
              CardRush&apos;s. If a figure on this page disagrees with the live
              site in front of you, the live site is right — and we&apos;d like
              to know.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FOOT                                                         */}
      {/* ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-ink-muted leading-relaxed max-w-xl mx-auto">
            The wider map — every route to a card, with the UK import maths —
            lives in{" "}
            <Link
              href="/guides/buying"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              the buying guide
            </Link>
            . And how a card is made before any shop shelves it:{" "}
            <Link
              href="/making"
              className="text-accent hover:text-accent-strong underline underline-offset-2"
            >
              一枚のできるまで
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
