import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

export const metadata: Metadata = {
  title: "How to Play One Piece TCG — Complete Beginner's Guide | Cambridge TCG",
  description:
    "Learn how to play One Piece TCG from scratch. Card types, game setup, turn structure, attacking, DON!! mechanics, colours, keywords, and deck building. The definitive beginner's guide.",
  keywords: [
    "one piece tcg",
    "how to play one piece tcg",
    "one piece card game rules",
    "one piece tcg beginner guide",
    "one piece tcg tutorial",
    "one piece tcg deck building",
    "one piece tcg don cards",
    "one piece trading card game",
  ],
  openGraph: {
    title: "How to Play One Piece TCG — Complete Beginner's Guide",
    description:
      "Learn how to play One Piece TCG from scratch. Card types, setup, turn structure, combat, and deck building basics.",
    type: "article",
    siteName: "Cambridge TCG",
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Play One Piece TCG — Complete Beginner's Guide",
    description:
      "Learn how to play One Piece TCG from scratch. The definitive beginner's guide from Cambridge TCG.",
  },
  alternates: {
    canonical: "https://cambridgetcg.com/guides/how-to-play",
  },
};

/* ------------------------------------------------------------------ */
/*  Reusable section components                                        */
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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface rounded-lg p-5 border border-border-subtle ${className}`}>
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

/* ------------------------------------------------------------------ */
/*  Table of contents data                                             */
/* ------------------------------------------------------------------ */

const toc = [
  { id: "what-you-need", label: "What You Need to Start" },
  { id: "card-types", label: "Card Types" },
  { id: "game-setup", label: "Game Setup" },
  { id: "turn-structure", label: "Turn Structure" },
  { id: "playing-cards", label: "How to Play Cards" },
  { id: "attacking", label: "How Attacking Works" },
  { id: "don", label: "DON!! Mechanics" },
  { id: "how-to-win", label: "How to Win" },
  { id: "colours", label: "Colours Explained" },
  { id: "keywords", label: "Key Keywords" },
  { id: "deck-building", label: "Deck Building Basics" },
  { id: "ready-to-play", label: "Ready to Play?" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HowToPlayPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://cambridgetcg.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Guides",
        item: "https://cambridgetcg.com/guides",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "How to Play One Piece TCG",
        item: "https://cambridgetcg.com/guides/how-to-play",
      },
    ],
  };

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "How to Play One Piece TCG — Complete Beginner's Guide",
    description:
      "Learn how to play One Piece TCG from scratch. Card types, game setup, turn structure, attacking, DON!! mechanics, colours, keywords, and deck building.",
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
    mainEntityOfPage: "https://cambridgetcg.com/guides/how-to-play",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What do I need to start playing One Piece TCG?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "You need 1 Leader card, a 50-card deck (all matching your Leader's colour), and 10 DON!! cards. A starter deck includes everything you need to play right away.",
        },
      },
      {
        "@type": "Question",
        name: "How do you win in One Piece TCG?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Reduce your opponent to 0 Life cards, then land one more attack on their Leader. Alternatively, a player loses the moment their deck reaches 0 cards (deck out).",
        },
      },
      {
        "@type": "Question",
        name: "What are DON!! cards in One Piece TCG?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "DON!! cards are your energy resource. You rest (tap) them to pay card costs, or attach them to your Leader or Characters to give +1000 power each. You add 2 DON!! to your field each turn, up to 10 total.",
        },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-page">
      <Script
        id="how-to-play-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Script
        id="how-to-play-article-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <Script
        id="how-to-play-faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ============================================================ */}
      {/*  HERO                                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
          {/* Breadcrumb */}
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
              <li className="text-ink font-medium">How to Play</li>
            </ol>
          </nav>

          <h1 className="font-display font-semibold text-3xl text-ink leading-tight">
            How to Play One Piece TCG
            <br />
            <span className="text-accent">Complete Beginner&apos;s Guide</span>
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-2xl leading-relaxed">
            Everything you need to know to play your first game of the One Piece
            Trading Card Game. From opening your starter deck to landing your
            winning attack.
          </p>

          {/* Table of Contents */}
          <nav
            aria-label="Table of contents"
            className="mt-10 bg-surface rounded-lg p-6 border border-border-subtle"
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
      {/*  1. WHAT YOU NEED TO START                                    */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="what-you-need" number="01">
            What You Need to Start
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Every game of One Piece TCG uses three things. A starter deck comes
            with all of them ready to go.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">1 Leader</p>
              <p className="text-sm text-ink-muted">
                Your main character. Determines your deck&apos;s colour and stays
                in play all game.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">50-Card Deck</p>
              <p className="text-sm text-ink-muted">
                Your crew, events, and stages. All cards must match your
                Leader&apos;s colour.
              </p>
            </Card>
            <Card>
              <p className="text-accent font-display font-semibold text-lg mb-1">10 DON!! Cards</p>
              <p className="text-sm text-ink-muted">
                Your energy. You draw 2 each turn and use them to pay costs or
                boost power.
              </p>
            </Card>
          </div>

          <Card className="mt-6">
            <p className="text-ink font-bold mb-1">
              Don&apos;t have cards yet?
            </p>
            <p className="text-sm text-ink-muted mb-3">
              A starter deck includes a Leader, a pre-built 50-card deck, and 10
              DON!! cards. It is the fastest way to start playing.
            </p>
            <Link
              href="/catalog?game=one-piece&type=starter"
              className="inline-block px-5 py-2 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
            >
              Browse Starter Decks &rarr;
            </Link>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  2. CARD TYPES                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="card-types" number="02">
            Card Types
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            There are five types of card in One Piece TCG. Each card displays its
            Cost, Power, Counter value, Colour, and any Keywords.
          </p>

          <div className="space-y-4">
            {/* Leader */}
            <Card>
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-accent-wash flex items-center justify-center text-lg font-semibold text-accent-strong">
                  L
                </span>
                <div>
                  <h3 className="text-ink font-bold text-lg mb-1">Leader Cards</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Your main character. The Leader sits in your Leader Area for
                    the entire game. It determines your deck&apos;s colour, has its
                    own Power value, and can attack every turn. When your Leader
                    takes damage you lose Life cards. Protect your Leader to stay
                    in the game.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Power</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Life Value</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Colour</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Keywords</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Character */}
            <Card>
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-accent-wash flex items-center justify-center text-lg font-semibold text-accent-strong">
                  C
                </span>
                <div>
                  <h3 className="text-ink font-bold text-lg mb-1">Character Cards</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Your crew. Pay their Cost in DON!! to play them to your
                    Character Area. Characters can attack and defend. You can
                    have a maximum of 5 Characters on the field at any time.
                    Characters go to the Trash when KO&apos;d.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Cost</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Power</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Counter</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Colour</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Keywords</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Event */}
            <Card>
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-accent-wash flex items-center justify-center text-lg font-semibold text-accent-strong">
                  E
                </span>
                <div>
                  <h3 className="text-ink font-bold text-lg mb-1">Event Cards</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    One-time effects. Pay the Cost, resolve the effect, then the
                    card goes straight to the Trash. Events can be played during
                    your Main Phase and some can be activated as Counter cards
                    during your opponent&apos;s attack.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Cost</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Counter</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Colour</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Trigger</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Stage */}
            <Card>
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-accent-wash flex items-center justify-center text-lg font-semibold text-accent-strong">
                  S
                </span>
                <div>
                  <h3 className="text-ink font-bold text-lg mb-1">Stage Cards</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Ongoing location effects. A Stage stays in play and provides
                    a continuous benefit. You can only have 1 Stage on the field
                    at a time. Playing a new Stage replaces your existing one.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Cost</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Colour</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Effect</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* DON!! */}
            <Card>
              <div className="flex items-start gap-4">
                <span className="shrink-0 w-10 h-10 rounded-lg bg-accent-wash flex items-center justify-center text-lg font-semibold text-accent-strong">
                  D
                </span>
                <div>
                  <h3 className="text-ink font-bold text-lg mb-1">DON!! Cards</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    Your energy and power source. Rest (tap) DON!! to pay card
                    costs. Or attach DON!! to your Leader or Characters to give
                    them +1000 Power per attached DON!!. You start with 0 and
                    add 2 per turn, up to a maximum of 10.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">Pay Costs</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">+1000 Power</span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-ink-muted">10 Total</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  3. GAME SETUP                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="game-setup" number="03">
            Game Setup
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Setting up takes less than a minute. Follow these six steps — in
            this order, per the official rules — and you are ready to play.
          </p>

          <div className="space-y-5">
            <Step n={1}>
              <p className="text-ink font-bold">Shuffle and place your deck</p>
              <p className="text-sm text-ink-muted mt-1">
                Shuffle your 50-card deck thoroughly and place it face-down in
                your Deck Area. Stack your 10 DON!! cards face-down beside it.
              </p>
            </Step>
            <Step n={2}>
              <p className="text-ink font-bold">Place your Leader face-up</p>
              <p className="text-sm text-ink-muted mt-1">
                Your Leader goes in the Leader Area in front of you. It stays
                there for the entire game.
              </p>
            </Step>
            <Step n={3}>
              <p className="text-ink font-bold">Decide who goes first</p>
              <p className="text-sm text-ink-muted mt-1">
                Rock-paper-scissors (or any method you agree on) — and here is
                the detail most people miss: the winner doesn&apos;t
                automatically go first, the winner <em>chooses</em> whether to
                go first or second.
              </p>
            </Step>
            <Step n={4}>
              <p className="text-ink font-bold">Draw 5 cards</p>
              <p className="text-sm text-ink-muted mt-1">
                Draw 5 cards from the top of your deck. If you do not like your
                hand, you get one mulligan: shuffle all 5 back and draw 5 new
                cards, deciding in turn order (first player first). You must
                keep the second hand.
              </p>
            </Step>
            <Step n={5}>
              <p className="text-ink font-bold">Set your Life cards</p>
              <p className="text-sm text-ink-muted mt-1">
                After the mulligan window closes, take cards from the top of
                your deck equal to your Leader&apos;s Life value and place them
                face-down in your Life Area — the card from the top of the deck
                goes to the bottom of the pile. When an attack gets through
                your Leader, you reveal the top one and add it to your hand.
              </p>
            </Step>
            <Step n={6}>
              <p className="text-ink font-bold">The first player begins</p>
              <p className="text-sm text-ink-muted mt-1">
                The first player adds only 1 DON!! on their first turn (instead
                of 2) and skips their first draw. Neither player can attack on
                their own first turn — the battling starts from each
                player&apos;s second turn.
              </p>
            </Step>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  4. TURN STRUCTURE                                            */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="turn-structure" number="04">
            Turn Structure — The 5 Phases
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Every turn follows the same five phases in order.
          </p>

          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-xs font-semibold">
                  1
                </span>
                <h3 className="text-ink font-bold">Refresh Phase</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Untap (set active) all your rested cards: your Leader, all
                Characters, and all DON!! cards. Everything is ready to use
                again.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-xs font-semibold">
                  2
                </span>
                <h3 className="text-ink font-bold">Draw Phase</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Draw 1 card from the top of your deck. The first player skips
                this on their very first turn.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-xs font-semibold">
                  3
                </span>
                <h3 className="text-ink font-bold">DON!! Phase</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Add 2 DON!! cards from your DON!! deck to your Cost Area. On the
                first player&apos;s first turn, they only add 1. DON!! cards
                enter active (untapped), ready to use immediately.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-xs font-semibold">
                  4
                </span>
                <h3 className="text-ink font-bold">Main Phase</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                This is where the action happens. You can do any of the following
                in any order, as many times as you are able:
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Play Character, Event, or Stage cards (pay their DON!! cost)
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Attach active DON!! to your Leader or Characters for a power
                  boost
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Attack with your Leader and/or Characters
                </li>
                <li className="flex gap-2">
                  <span className="text-accent">&bull;</span>
                  Activate card abilities marked &ldquo;Main&rdquo;
                </li>
              </ul>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-wash text-accent-strong flex items-center justify-center text-xs font-semibold">
                  5
                </span>
                <h3 className="text-ink font-bold">End Phase</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Your turn is over. Return any attached DON!! back to your Cost
                Area (they stay active). Play passes to your opponent.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  5. HOW TO PLAY CARDS                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="playing-cards" number="05">
            How to Play Cards
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            During your Main Phase you can play cards from your hand by paying
            their cost.
          </p>

          <div className="space-y-5">
            <Step n={1}>
              <p>
                <span className="text-ink font-bold">Check the cost.</span>{" "}
                The number in the top-left of the card is how many DON!! you
                need to rest (tap) to play it.
              </p>
            </Step>
            <Step n={2}>
              <p>
                <span className="text-ink font-bold">Rest DON!! cards.</span>{" "}
                Turn that many active DON!! sideways (rested). This is your
                payment.
              </p>
            </Step>
            <Step n={3}>
              <p>
                <span className="text-ink font-bold">Place the card.</span>{" "}
                Characters go to your Character Area (maximum 5 on the field).
                Events resolve their effect immediately and go to the Trash.
                Stages go to your Stage Area, replacing any Stage already there.
              </p>
            </Step>
          </div>

          <Card className="mt-8">
            <p className="text-accent font-bold mb-1">Remember</p>
            <p className="text-sm text-ink-muted">
              Characters played this turn cannot attack unless they have the{" "}
              <span className="text-ink font-semibold">Rush</span> keyword.
              They are said to have &ldquo;summoning sickness.&rdquo;
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  6. HOW ATTACKING WORKS                                       */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="attacking" number="06">
            How Attacking Works
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Combat is the core of One Piece TCG. Here is how a single attack
            plays out, step by step.
          </p>

          <div className="space-y-5">
            <Step n={1}>
              <p>
                <span className="text-ink font-bold">
                  Rest your attacker.
                </span>{" "}
                Choose your Leader or an active Character and turn it sideways
                (rest it). This declares the attack.
              </p>
            </Step>
            <Step n={2}>
              <p>
                <span className="text-ink font-bold">Choose a target.</span>{" "}
                You can attack your opponent&apos;s{" "}
                <span className="text-accent">Leader</span> (always a valid
                target) or any of their{" "}
                <span className="text-accent">rested Characters</span> (you
                cannot attack active Characters).
              </p>
            </Step>
            <Step n={3}>
              <p>
                <span className="text-ink font-bold">
                  Opponent may Block.
                </span>{" "}
                If your opponent has a Character with the{" "}
                <span className="text-ink font-semibold">Blocker</span>{" "}
                keyword, they can rest it to redirect the attack to that
                Character instead.
              </p>
            </Step>
            <Step n={4}>
              <p>
                <span className="text-ink font-bold">Counter Step.</span> The
                defending player can discard cards from their hand that have a
                Counter value. Each card adds its Counter to the defender&apos;s
                Power for this battle. Event cards with a Counter cost can also
                be played here.
              </p>
            </Step>
            <Step n={5}>
              <p>
                <span className="text-ink font-bold">Compare Power.</span> If
                the attacker&apos;s Power is greater than or equal to the
                defender&apos;s Power, the attack succeeds.
              </p>
            </Step>
            <Step n={6}>
              <p>
                <span className="text-ink font-bold">
                  Resolve the result.
                </span>
              </p>
              <ul className="mt-2 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-accent font-bold shrink-0">vs Leader:</span>
                  <span className="text-ink-muted">
                    The opponent takes 1 damage. They move the top card of their
                    Life pile to their hand. If that card has a{" "}
                    <span className="text-ink font-semibold">Trigger</span>{" "}
                    effect, they may activate it for free.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent font-bold shrink-0">vs Character:</span>
                  <span className="text-ink-muted">
                    That Character is KO&apos;d and sent to the Trash.
                  </span>
                </li>
              </ul>
            </Step>
          </div>

          <Card className="mt-8">
            <p className="text-accent font-bold mb-1">Key Concept</p>
            <p className="text-sm text-ink-muted">
              Your opponent&apos;s Leader is always a valid target, even when
              active. But you can only attack their Characters if those
              Characters are rested. This means Characters that attacked on the
              previous turn are vulnerable.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  7. DON!! — THE HEART OF THE GAME                             */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="don" number="07">
            DON!! &mdash; The Heart of the Game
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            DON!! cards are the resource that drives everything. Understanding
            how to use them is the single biggest factor in winning games.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-ink font-bold mb-2">Pay Costs</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Rest (tap) DON!! equal to a card&apos;s cost to play it. A
                5-cost Character means you rest 5 DON!!.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-2">Boost Power</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Attach active DON!! to your Leader or Characters. Each attached
                DON!! gives +1000 Power for the rest of the turn.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-2">Strategic Choice</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Every DON!! is a decision. Spend it to play cards now? Or attach
                it for a power boost that could win a crucial battle?
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-2">Growth Curve</p>
              <p className="text-sm text-ink-muted leading-relaxed">
                You gain 2 DON!! per turn. By turn 5 you have all 10. Early
                turns play cheap cards; later turns play your biggest threats.
              </p>
            </Card>
          </div>

          <Card className="mt-6">
            <p className="text-accent font-bold mb-2">
              DON!! Turn-by-Turn Breakdown
            </p>
            <div className="grid grid-cols-5 gap-2 text-center text-sm">
              {[
                { turn: "T1", don: "1-2" },
                { turn: "T2", don: "3-4" },
                { turn: "T3", don: "5-6" },
                { turn: "T4", don: "7-8" },
                { turn: "T5", don: "9-10" },
              ].map((t) => (
                <div key={t.turn} className="bg-surface-subtle rounded-lg py-2">
                  <p className="text-ink-faint text-xs">{t.turn}</p>
                  <p className="text-accent font-mono font-medium text-lg">{t.don}</p>
                  <p className="text-ink-faint text-xs">DON!!</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-faint mt-3">
              First player gets 1 DON!! on turn 1. Second player gets 2. After
              that, both players add 2 per turn until they reach 10.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  8. HOW TO WIN                                                */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="how-to-win" number="08">
            How to Win
          </SectionHeading>

          <div className="space-y-4 mb-8">
            <Card>
              <p className="text-ink font-bold mb-2">
                Primary Win Condition: Knock Out the Leader
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                Reduce your opponent to 0 Life cards, then land one more
                successful attack on their Leader. With no Life left to absorb
                the hit, their Leader is knocked out and you win.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-2">
                Alternate Win Condition: Deck Out
              </p>
              <p className="text-sm text-ink-muted leading-relaxed">
                The moment a player has 0 cards left in their deck, they lose —
                drawing your last card ends the game on the spot. This is rare
                but can happen in long games or against mill strategies.
              </p>
            </Card>
          </div>

          <Card className="border-accent/30">
            <p className="text-accent font-bold mb-2">
              Key Insight: Damage Gives Your Opponent Cards
            </p>
            <p className="text-sm text-ink-muted leading-relaxed">
              When your opponent takes damage, their top Life card moves to
              their hand. This means attacking their Leader actually gives them
              more resources. A player at low Life has a huge hand and lots of
              Counter options. This is intentional — the game has a natural
              comeback mechanic. Do not mindlessly rush the Leader. Sometimes
              it is better to KO their Characters first and strip away their
              board before going for the finish.
            </p>
          </Card>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  9. COLOURS EXPLAINED                                         */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="colours" number="09">
            Colours Explained
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Your Leader&apos;s colour determines which cards you can put in your
            deck. Each colour has a distinct play style. Some Leaders are
            dual-colour, giving access to two colour pools.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <h3 className="text-ink font-semibold">Red</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Rush aggression. Red decks attack fast and hit hard. They excel
                at playing Characters with Rush and pushing damage early before
                the opponent can set up.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <h3 className="text-ink font-semibold">Blue</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Defensive control. Blue decks protect their Leader, bounce
                opponent&apos;s Characters back to hand or deck, and grind out
                advantages over a long game.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-green-500" />
                <h3 className="text-ink font-semibold">Green</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Resource ramp. Green decks gain extra DON!! or cheat high-cost
                Characters into play early. Slow start, overwhelming late game.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-purple-500" />
                <h3 className="text-ink font-semibold">Purple</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Explosive power. Purple decks spend their own DON!! or Life for
                powerful burst plays. High risk, high reward. They convert
                resources into speed.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-ink" />
                <h3 className="text-ink font-semibold">Black</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Removal and disruption. Black decks reduce opponent&apos;s
                Characters&apos; Power to 0 to KO them, trash cards from the
                opponent&apos;s hand, and control the board.
              </p>
            </Card>

            <Card>
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400" />
                <h3 className="text-ink font-semibold">Yellow</h3>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                Life management and endurance. Yellow decks manipulate the Life
                pile, trigger powerful effects when taking damage, and outlast
                opponents through resilience.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  10. KEY KEYWORDS                                             */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="keywords" number="10">
            Key Keywords
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Keywords appear on cards and give them special abilities. Here are
            the most important ones to know as a beginner.
          </p>

          <div className="space-y-3">
            {[
              {
                keyword: "Rush",
                color: "text-ink",
                desc: "This Character can attack on the same turn it is played. Normally Characters have to wait one turn before attacking.",
              },
              {
                keyword: "Blocker",
                color: "text-ink",
                desc: "When your opponent attacks, you can rest this Character to redirect the attack to it. The Blocker takes the hit instead of the original target.",
              },
              {
                keyword: "Double Attack",
                color: "text-ink",
                desc: "When this card's attack on a Leader succeeds, the opponent loses 2 Life instead of 1. Extremely powerful for closing out games.",
              },
              {
                keyword: "Banish",
                color: "text-ink",
                desc: "When this card's attack deals damage to a Leader, the Life card is removed from the game entirely instead of going to the opponent's hand. It also cannot trigger any Trigger effects.",
              },
              {
                keyword: "Counter",
                color: "text-ink",
                desc: "A value on the card (usually +1000 or +2000). During the Counter Step, discard this card from your hand to add its Counter value to the defending card's Power.",
              },
              {
                keyword: "Trigger",
                color: "text-ink",
                desc: "When this card is revealed from your Life pile as damage, you can activate its Trigger effect for free before adding it to your hand. A powerful comeback mechanic.",
              },
            ].map((kw) => (
              <Card key={kw.keyword}>
                <div className="flex items-start gap-3">
                  <p className={`font-semibold ${kw.color} shrink-0 w-32`}>
                    {kw.keyword}
                  </p>
                  <p className="text-sm text-ink-muted leading-relaxed">
                    {kw.desc}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  11. DECK BUILDING BASICS                                     */}
      {/* ============================================================ */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <SectionHeading id="deck-building" number="11">
            Deck Building Basics
          </SectionHeading>

          <p className="text-ink-muted leading-relaxed mb-8">
            Once you understand the game, you will want to build your own deck.
            Here are the rules and guidelines.
          </p>

          <Card className="mb-6">
            <p className="text-accent font-bold mb-3">Deck Construction Rules</p>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">1.</span>
                <span>
                  <span className="text-ink font-semibold">1 Leader card</span>{" "}
                  + <span className="text-ink font-semibold">50 card deck</span>{" "}
                  + <span className="text-ink font-semibold">10 DON!! cards</span>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">2.</span>
                <span>
                  All 50 deck cards must match your Leader&apos;s colour(s). If
                  your Leader is Red/Green, you can use Red cards, Green cards,
                  or both.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">3.</span>
                <span>
                  Maximum <span className="text-ink font-semibold">4 copies</span>{" "}
                  of any card with the same card number.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent font-bold shrink-0">4.</span>
                <span>Check the official ban list for any restricted cards.</span>
              </li>
            </ul>
          </Card>

          <h3 className="font-display font-semibold text-ink text-lg mb-4">
            Building Tips for Beginners
          </h3>

          <div className="space-y-4">
            <Card>
              <p className="text-ink font-bold mb-1">Balance your cost curve</p>
              <p className="text-sm text-ink-muted">
                Include a mix of low-cost cards (1-3 DON!!) you can play early
                and high-cost cards (5-8 DON!!) that are your late-game power
                plays. You do not want a hand full of expensive cards on turn 1.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Include Counter cards for defence
              </p>
              <p className="text-sm text-ink-muted">
                Cards with Counter values (+1000 or +2000) can be discarded from
                your hand to protect your Leader during attacks. Having at least
                12-16 Counter cards ensures you can survive long enough to
                execute your strategy.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Choose cards that support your Leader&apos;s ability
              </p>
              <p className="text-sm text-ink-muted">
                Your Leader has a unique ability. Build around it. If your Leader
                powers up Characters of a specific type, fill your deck with
                that type. Synergy wins games.
              </p>
            </Card>
            <Card>
              <p className="text-ink font-bold mb-1">
                Think about Trigger cards
              </p>
              <p className="text-sm text-ink-muted">
                Cards with Trigger effects activate for free when revealed from
                your Life pile. Including strong Trigger cards gives you
                automatic value whenever you take damage.
              </p>
            </Card>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/deck-builder"
              className="px-5 py-2.5 bg-ink text-page font-semibold rounded-lg text-sm hover:opacity-90 transition"
            >
              Open Deck Builder &rarr;
            </Link>
            <Link
              href="/catalog?game=one-piece"
              className="px-5 py-2.5 border border-border-subtle bg-surface text-ink font-semibold rounded-lg text-sm hover:bg-surface-subtle transition"
            >
              Browse All Cards
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  12. READY TO PLAY?                                           */}
      {/* ============================================================ */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          <h2
            id="ready-to-play"
            className="font-display font-semibold text-3xl text-ink mb-4 scroll-mt-24"
          >
            Ready to Play?
          </h2>
          <p className="text-ink-muted mb-10 max-w-lg mx-auto leading-relaxed">
            You know the rules. Now it is time to build a deck, find an
            opponent, and set sail. Here are your next steps.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 max-w-xl mx-auto">
            <Link
              href="/deck-builder"
              className="block bg-surface rounded-lg p-5 border border-border-subtle hover:border-accent/50 transition group"
            >
              <p className="text-ink font-bold group-hover:text-accent transition mb-1">
                Build Your First Deck
              </p>
              <p className="text-sm text-ink-faint">
                Use our deck builder tool to create and save custom decks.
              </p>
            </Link>

            <Link
              href="/catalog?game=one-piece&type=starter"
              className="block bg-surface rounded-lg p-5 border border-border-subtle hover:border-accent/50 transition group"
            >
              <p className="text-ink font-bold group-hover:text-accent transition mb-1">
                Browse Starter Decks
              </p>
              <p className="text-sm text-ink-faint">
                Grab a ready-to-play starter deck and start your first game
                today.
              </p>
            </Link>

            <Link
              href="https://www.optcgsim.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-surface rounded-lg p-5 border border-border-subtle hover:border-accent/50 transition group"
            >
              <p className="text-ink font-bold group-hover:text-accent transition mb-1">
                Play Online
              </p>
              <p className="text-sm text-ink-faint">
                Practice on OPTCGSim, the free online One Piece TCG simulator.
              </p>
            </Link>

            <Link
              href="/community"
              className="block bg-surface rounded-lg p-5 border border-border-subtle hover:border-accent/50 transition group"
            >
              <p className="text-ink font-bold group-hover:text-accent transition mb-1">
                Join Our Community
              </p>
              <p className="text-sm text-ink-faint">
                Connect with other players, find trade matches, and stay up to
                date.
              </p>
            </Link>
          </div>

          <div className="mt-10">
            <Link
              href="/guides"
              className="text-sm text-ink-faint hover:text-accent transition"
            >
              &larr; Back to All Guides
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
