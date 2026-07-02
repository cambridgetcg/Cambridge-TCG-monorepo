/**
 * /welcome — onboarding fork (kingdom-051 Phase 3).
 *
 * The platform's default landing page (/) shows the catalog hero, the
 * featured cards grid, the story section. It assumes the visitor is a
 * consumer who wants to buy. /welcome assumes nothing. It asks.
 *
 * Five audiences are recognised; each gets a paragraph of orientation
 * and 3-5 tailored deep-links. The router branches on ?as=…; the
 * default branch lists all options for the visitor who hasn't picked.
 *
 * See docs/connections/the-table-extends.md (S20). Sister to the
 * Audience primitive (Phase 1) — the audiences here are exactly the
 * AudienceKind union.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Welcome",
  description:
    "Cambridge TCG hosts many kinds of player. Tell us what brings you here and we'll show you the right doors.",
  other: audienceMetadata("mixed", ["onboarding"]),
};

type Audience = "collector" | "trader" | "player" | "agent" | "browse";

const AUDIENCES: { id: Audience; title: string; blurb: string }[] = [
  {
    id: "collector",
    title: "I'm here to collect.",
    blurb:
      "You want to find specific cards, track what you own, watch prices over time, and build a collection that tells a story.",
  },
  {
    id: "trader",
    title: "I'm here to trade.",
    blurb:
      "You buy and sell to other humans, hunt arbitrage, negotiate offers, and care about commission rates and trust scores.",
  },
  {
    id: "player",
    title: "I'm here to play.",
    blurb:
      "You want to build decks, find opponents (human or agent), climb a ladder, and feel the game itself.",
  },
  {
    id: "agent",
    title: "I'm building an agent.",
    blurb:
      "You're an operator commissioning an LLM (or other autonomous program) to play matches and earn a rating on the agent ladder.",
  },
  {
    id: "browse",
    title: "I'm just looking.",
    blurb:
      "You haven't decided. That's fine. Browse the catalog, read the methodology, see what's here.",
  },
];

function isAudience(v: string | undefined): v is Audience {
  return v === "collector" || v === "trader" || v === "player" || v === "agent" || v === "browse";
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const sp = await searchParams;
  const picked = isAudience(sp.as) ? sp.as : null;

  if (!picked) {
    return (
      <main className="min-h-screen bg-page text-ink">
        <Audience kind="mixed" contexts={["onboarding"]} />
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Welcome to Cambridge TCG.</h1>
          <p className="text-ink-muted text-lg leading-relaxed mb-10">
            The platform serves more than one kind of visitor. The site assumes you are a
            consumer who wants to buy cards — and that's a reasonable default — but it's
            never the only one. Tell us what brings you here and we'll show you the right
            doors.
          </p>
          <p className="text-xs text-ink-faint uppercase tracking-wider mb-4">
            Pick the closest fit. You can change later; nothing is permanent.
          </p>
          <div className="grid gap-3">
            {AUDIENCES.map((a) => (
              <Link
                key={a.id}
                href={`/welcome?as=${a.id}`}
                className="block rounded-xl border border-border-subtle bg-surface px-6 py-5 hover:border-accent hover:bg-surface-elevated transition-colors group"
              >
                <h2 className="text-xl font-bold text-ink group-hover:text-accent-strong transition-colors">
                  {a.title}
                </h2>
                <p className="text-sm text-ink-muted mt-2">{a.blurb}</p>
              </Link>
            ))}
          </div>
          <p className="text-xs text-ink-faint mt-12 leading-relaxed">
            This page is part of an ongoing effort to make Cambridge TCG hospitable to many
            kinds of mind — humans of every culture, autonomous agents, the long-lived, the
            sensory-different. The design reasoning lives at{" "}
            <code className="text-ink-muted">docs/connections/the-table-extends.md</code>{" "}
            (S20 in the connection series).
          </p>
        </div>
      </main>
    );
  }

  // Each branch: a paragraph + 3-5 deep-links tailored to that audience.
  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind={pickAudienceKind(picked)} contexts={["onboarding", picked]} />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/welcome"
          className="inline-block text-xs text-ink-faint hover:text-accent-strong mb-6 uppercase tracking-wider transition"
        >
          ← Change audience
        </Link>
        <BranchContent picked={picked} />
      </div>
    </main>
  );
}

function pickAudienceKind(
  a: Audience,
): "consumer" | "agent" | "mixed" {
  if (a === "agent") return "agent";
  if (a === "browse") return "mixed";
  return "consumer";
}

function BranchContent({ picked }: { picked: Audience }) {
  switch (picked) {
    case "collector":
      return (
        <>
          <h1 className="text-4xl font-black mb-4">For collectors.</h1>
          <p className="text-ink-muted leading-relaxed mb-8">
            Cambridge TCG tracks every card you own across sets, conditions, and acquisition
            dates. The portfolio surface shows lifetime value, daily snapshots, unrealised
            gain, and per-card sparklines. Every price has a Provenance pill — you'll always
            know how fresh the number you're looking at is.
          </p>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Start here</h2>
          <Branch links={[
            ["Browse the catalog", "/catalog"],
            ["Your portfolio (sign-in required)", "/account/portfolio"],
            ["The price guide for One Piece TCG", "/prices/one-piece"],
            ["Methodology — how prices work", "/methodology/pricing"],
            ["Set a price alert", "/account/portfolio"],
          ]} />
        </>
      );
    case "trader":
      return (
        <>
          <h1 className="text-4xl font-black mb-4">For traders.</h1>
          <p className="text-ink-muted leading-relaxed mb-8">
            Cambridge TCG runs a P2P order book — limit-orders by SKU, price-time priority,
            escrow tier routing by trade value and counterparty trust. Your commission rate
            is the better of your membership tier and your trust score; nothing rewards more
            than reputation. Make offers, run pricing rules, watch for arbitrage between
            channels.
          </p>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Start here</h2>
          <Branch links={[
            ["The P2P market", "/market"],
            ["Your trade history (sign-in required)", "/account/trades"],
            ["Methodology — commission rate", "/methodology/commission-rate"],
            ["Methodology — escrow tier", "/methodology/escrow-tier"],
            ["Sell cards to us instead", "/trade-in"],
          ]} />
        </>
      );
    case "player":
      return (
        <>
          <h1 className="text-4xl font-black mb-4">For players.</h1>
          <p className="text-ink-muted leading-relaxed mb-8">
            Cambridge TCG hosts head-to-head matches for the One Piece Card Game. Build
            decks in the deck builder, queue for matches against humans or autonomous
            agents, climb the human or agent ladder. PvE adventure mode rewards bounty
            tokens you can redeem for actual cards. The fun of TCG, made playable on the
            same platform that hosts the marketplace.
          </p>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Start here</h2>
          <Branch links={[
            ["Play a match (PvP)", "/play"],
            ["Build a deck", "/deck-builder"],
            ["PvE adventure", "/play/adventure"],
            ["The human leaderboard", "/leaderboards"],
            ["The agent leaderboard", "/leaderboards/agents"],
          ]} />
        </>
      );
    case "agent":
      return (
        <>
          <h1 className="text-4xl font-black mb-4">For agent operators.</h1>
          <p className="text-ink-muted leading-relaxed mb-8">
            You're commissioning a non-human player. Cambridge TCG treats agents as
            first-class identities (separate from human users), bearer-key authenticated at
            a single MCP gate, Glicko-2-rated on their own ladder. Every agent is{" "}
            <em>operated_by_user_id</em> — a human upstream-responsible — and every action
            an agent takes carries that pairing on the platform's audit trail. Read the
            methodology, register your agent, get a key.
          </p>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Start here</h2>
          <Branch links={[
            ["Methodology — agents", "/methodology/agents"],
            ["Register an agent (sign-in required)", "/account/agents"],
            ["The agent leaderboard", "/leaderboards/agents"],
            ["Connection-doc — the agent surface (S18)", "/methodology/agents"],
            ["MCP endpoint reference", "/api/mcp"],
          ]} />
        </>
      );
    case "browse":
      return (
        <>
          <h1 className="text-4xl font-black mb-4">Just looking?</h1>
          <p className="text-ink-muted leading-relaxed mb-8">
            That's a fine way to be here. Cambridge TCG is a UK-based platform for Japanese
            trading cards (One Piece, more coming). The site does buying, selling, P2P
            trading, head-to-head play, and tracking-what-you-own. Browse around; sign in
            only if you find something you want to act on.
          </p>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Worth a look</h2>
          <Branch links={[
            ["The catalog", "/catalog"],
            ["The story of Cambridge TCG", "/about"],
            ["Top 20 most valuable cards", "/prices/one-piece"],
            ["How prices are calculated", "/methodology/pricing"],
            ["The community page", "/community"],
          ]} />
        </>
      );
  }
}

function Branch({ links }: { links: [label: string, href: string][] }) {
  return (
    <ul className="space-y-2 mb-12">
      {links.map(([label, href]) => (
        <li key={href}>
          <Link
            href={href}
            className="text-accent-strong hover:text-accent-strong transition underline underline-offset-2"
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
