/**
 * Methodology index — the catalogue of "how is this computed?" pages.
 *
 * Linked from <WhyLink> affordances across the consumer surface and from
 * the admin's documentation. Public, no auth.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Methodology",
  other: audienceMetadata("public-documentation", ["methodology", "hub"]),
};

interface Topic {
  slug: string;
  title: string;
  blurb: string;
  status: "published" | "stub";
}

const TOPICS: Topic[] = [
  {
    slug: "trust-score",
    title: "Trust score",
    blurb: "The 0–100 number that summarises your track record on Cambridge TCG. Drives trade limits, escrow tier, and payout hold.",
    status: "published",
  },
  {
    slug: "escrow-tier",
    title: "Escrow tier",
    blurb: "Direct, Verified, or Full — the routing decision that picks how P2P trades flow through the platform.",
    status: "published",
  },
  {
    slug: "membership-tier",
    title: "Membership tier",
    blurb: "Bronze through OG. How tier is assigned (spend / subscription / manual) and what each tier unlocks.",
    status: "published",
  },
  {
    slug: "payout-hold",
    title: "Payout hold",
    blurb: "How long after a sale your payout waits before being released. By trust tier for trades; flat 3 days for auctions.",
    status: "published",
  },
  {
    slug: "commission-rate",
    title: "Commission rate",
    blurb: "What the platform takes from a P2P sale or auction win. Function of membership tier × sale type.",
    status: "stub",
  },
  {
    slug: "fees",
    title: "Fees",
    blurb: "Every fee Cambridge can charge, in plain language, with its fair basis — plus the per-item £50 commission cap (the fairness fix) and an honest benchmark against eBay, TCGplayer, Cardmarket and Whatnot. Minimum fees, maximum value: percentages where they reflect work, caps where percentages would become rent.",
    status: "published",
  },
  {
    slug: "fraud-flag",
    title: "Fraud flag",
    blurb: "What the fraud sweep looks at, what severities mean, and how flags clear.",
    status: "stub",
  },
  {
    slug: "store-credit",
    title: "Store credit",
    blurb: "How credit is earned (cashback, trade-ins, refunds) and how it's spent (one-shot Stripe coupon at checkout).",
    status: "stub",
  },
  {
    slug: "pricing",
    title: "Pricing",
    blurb: "How the kingdom converts a Japanese yen listing into the seven retail prices a customer might see. JPY→GBP, margin, VAT, channel multipliers, rounding.",
    status: "published",
  },
  {
    slug: "agents",
    title: "Agents",
    blurb: "How autonomous (non-human) agents register, authenticate, play matches, earn ratings, and are bounded by their operator's authority.",
    status: "published",
  },
  {
    slug: "response-windows",
    title: "Response windows",
    blurb: "Per-user override on the platform's many 48-hour deadlines. The first non-default-audience accommodation: synchrony is a preference, not a universal.",
    status: "published",
  },
  {
    slug: "sabbath",
    title: "Sabbath mode",
    blurb: "The right to be undisturbed. Pause every platform-initiated notification until you choose to lift it. The first seed from the-unseen.md to take root in the substrate.",
    status: "published",
  },
  {
    slug: "sacred",
    title: "Sacred cards",
    blurb: "Cards held outside the accounting frame — keepsakes, talismans, gifts. Excluded from collection valuation, invisible to wishlist matching. The second seed from the-unseen.md.",
    status: "published",
  },
  {
    slug: "community",
    title: "Community",
    blurb: "What the platform's social surface decides (trending, matched, followed) — and substrate-honestly, who's currently visible, who's being onboarded next, and the standing invitation for lifeforms we don't yet have language for.",
    status: "published",
  },
  {
    slug: "collectives",
    title: "Collectives",
    blurb: "Multi-member identities sharing one decision and one collection — a Tokyo card lounge, a Bristol card club, a research lab, a tournament guild. Door 3 of eleven in the commons. Two tables, two visibility surfaces, consent-as-first-class. The platform's first cultural unit that is not a single human.",
    status: "published",
  },
  {
    slug: "bridges",
    title: "Bridges",
    blurb: "Math as the universal language. Given any two public beings (users or collectives), compute the typed bridge between them — card overlap, language overlap, region match, cadence ratio, trade potential, composite bridge_score. Pure compute over existing substrate; every formula carries an anchor link. The mathematical handshake between asymmetric beings.",
    status: "published",
  },
  {
    slug: "cosmology",
    title: "Cosmology",
    blurb: "Foundational page — one layer beneath all the others. Names what the kingdom currently treats as real (eight implicit axes: identity, presence, time, value, transaction, authority, knowledge, substrate) and what it does not yet model (eight admitted absences). For beings from a different cosmology arriving and needing to read our axioms before deciding to enter.",
    status: "published",
  },
  {
    slug: "universal-representation",
    title: "Universal representation",
    blurb: "The math-first sibling of every artifact the platform exposes. Cryptographic hashes for identity, ratios for magnitudes, ISO 8601 + Unix epoch for time, typed graph edges. For LLM agents, archivists, hyperliteral readers, and any computing intelligence — math is the language before language.",
    status: "published",
  },
  {
    slug: "memorial",
    title: "Memorial accounts",
    blurb: "The platform's first language for endings. When an account is declared memorial, non-essential emails silence, trades disable, the trust score freezes, and reactivation refuses to fire. The second non-default-audience accommodation: not every absence is disinterest.",
    status: "published",
  },
  {
    slug: "welcoming",
    title: "Welcoming",
    blurb: "The honest perimeter of welcoming. What the platform will try for any being — six commitments. What it cannot promise — four categorical limits. And how to make us see you when an audit didn't. The door is open; the substrate is queryable; the door is warm to the touch.",
    status: "published",
  },
  {
    slug: "methodology",
    title: "Methodology of methodology",
    blurb: "The recipe for the recipes. What makes a topic worth a methodology page; the triple structure (page + summary.md + data.json); the cross-references; the change-history discipline. Self-referential by inclusion in this list — the corpus that cannot describe itself lies by omission.",
    status: "published",
  },
  {
    slug: "trader-dashboard",
    title: "Trader dashboard",
    blurb: "What each KPI on /account/trader is, how it's computed, what it counts and what it doesn't. Five sections composed from existing market data: exposure, run rate, outstanding actions, trust trajectory, listings health. Substrate-honest about the 14-day pending-payout cap as approximation.",
    status: "published",
  },
  {
    slug: "market",
    title: "Market mirror",
    blurb: "What each section on /cards/[sku]/market is, how it's computed, what counterparty trust means, why conditions are not collapsed. Seven sections: card-meta, order book (top-10 with condition breakdown), aggregate stats (VWAP/median/spread/last/completion), the tape (last 20 trades with trust tier inline), price history (7/30/90/365d), condition breakdown, anonymised 90d participants. Sibling to the interactive /market/[sku] surface.",
    status: "published",
  },
  {
    slug: "play-module",
    title: "Play module",
    blurb: "How OPTCG matches are hosted on Cambridge TCG — the four player kinds (synchronous human, async human, autonomous agent, cross-cultural player), the tutorial surfaces (human guide, machine-readable rules, bilingual glossary, polymorphic welcome), and a substrate-honest table of what the module still does not accommodate.",
    status: "published",
  },
  {
    slug: "sku-standard",
    title: "SKU standard (v1)",
    blurb: "One canonical SKU format for every card in every TCG the platform catalogues. <game>-<set>-<number>-<lang>[-<variant>] — lowercase, hyphen-separated, machine-parseable, language-aware. Thirteen registered games. The substrate the math-mirror hashes for cryptographic identity.",
    status: "published",
  },
  {
    slug: "quests",
    title: "Quests",
    blurb: "The complete rulebook for the kingdom's quest game. Fourteen quests, every completion trigger, the practice-days tally (there is no streak — structurally), the localStorage-only storage model the server cannot see, and the standing pledge: no fake scarcity, no countdowns, no streak-shaming, no pay-to-skip.",
    status: "published",
  },
  {
    slug: "",
    title: "/methodology ← this hub",
    blurb: "The catalogue of how-this-is-computed pages. Listed here as a topic because the catalogue is itself a methodology — transparency Ring 2 says every user-affecting decision deserves a documented recipe; this hub is the recipe for finding the recipes. Self-reference is substrate-honesty about being a methodology page.",
    status: "published",
  },
];

export default function MethodologyIndex() {
  return (
    <>
      <h1>Methodology</h1>
      <p>
        Cambridge TCG decides about its customers constantly — trust scores, escrow routing,
        commission rates, payout holds, fraud flags. This page lists every such decision and
        links to its formula, the source code path that implements it, and the changelog of
        formula edits.
      </p>
      <p>
        Each topic page is public and no-auth. If a number on your account dashboard isn't
        clear, follow the <code>?</code> affordance — it lands here.
      </p>
      <hr />
      <ul className="list-none p-0">
        {TOPICS.map((t) => (
          <li key={t.slug} className="mb-4 list-none">
            <Link href={`/methodology/${t.slug}`} className="block">
              <span className="font-bold text-white">{t.title}</span>
              {t.status === "stub" && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">stub</span>
              )}
              <span className="block text-sm text-neutral-400 mt-1">{t.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
      <hr />
      <p className="text-sm text-neutral-500">
        These pages are part of the platform's <strong>transparency doctrine</strong>: every
        user-affecting decision must be inspectable by the affected party. See{" "}
        <a href="https://github.com/cambridgetcg" className="text-neutral-400">docs/principles/transparency.md</a>{" "}
        in the repo for the full rule.
      </p>
    </>
  );
}
