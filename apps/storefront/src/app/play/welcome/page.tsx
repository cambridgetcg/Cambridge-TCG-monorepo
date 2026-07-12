import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Welcome to OPTCG on Cambridge TCG",
  description:
    "Three archetypes — hobbyist, collector, competitor. Pick the one that fits why you're here. Player kinds (human, agent, async, screen-reader, cross-cultural) live underneath.",
  other: audienceMetadata("public-documentation", ["play", "welcome", "tutorial"]),
};

interface PlayerKindPath {
  id: string;
  title: string;
  for_whom: string;
  recommended_steps: { label: string; href: string; note?: string }[];
}

interface Archetype {
  id: string;
  title: string;
  pull_quote: string;
  what_they_love: string;
  landing_href: string | null;
  landing_label: string;
  kinds: PlayerKindPath[];
}

const ARCHETYPES: Archetype[] = [
  {
    id: "hobbyist",
    title: "Hobbyist",
    pull_quote: "I love this game.",
    what_they_love:
      "The game itself. Wins are nice; combos are satisfying; the joy is the play. No rating pressure. No prize pressure.",
    landing_href: "/play/casual",
    landing_label: "Open the casual surface",
    kinds: [
      {
        id: "human-beginner",
        title: "I've never played OPTCG before",
        for_whom:
          "First-time player. No prior TCG experience required. Pace yourself; the platform won't rush you.",
        recommended_steps: [
          { label: "Read the beginner guide", href: "/guides/how-to-play", note: "~15 minute read" },
          { label: "Check adventure status", href: "/play/adventure", note: "Battles and rewards are paused" },
          { label: "Drop into the lobby", href: "/play", note: "When ready, find a real opponent" },
        ],
      },
      {
        id: "human-returning-casual",
        title: "I've played before, just want a friendly match",
        for_whom: "Returning OPTCG player who isn't here for the rating climb.",
        recommended_steps: [
          { label: "Skim the glossary", href: "/api/v1/play/glossary", note: "Refresh on terms" },
          { label: "Open /play/casual", href: "/play/casual", note: "Rating hidden by default" },
        ],
      },
      {
        id: "async-player",
        title: "I play on a slow clock",
        for_whom:
          "Travellers, busy parents, time-zone-shifted opponents, slow-clock thinkers. The platform's response_window_hours is the wire.",
        recommended_steps: [
          { label: "Set your response window", href: "/account/profile", note: "Default 48h; slow-clock often 168" },
          { label: "Read the methodology", href: "/methodology/response-windows" },
          { label: "Open an async-friendly match", href: "/play/casual", note: "Create a private room; agree on async" },
        ],
      },
      {
        id: "cross-cultural-casual",
        title: "I'm more comfortable in Japanese (or another language)",
        for_whom:
          "Players whose first encounter with OPTCG was the Japanese release; players who think in non-English terms.",
        recommended_steps: [
          { label: "Fetch the bilingual glossary", href: "/api/v1/play/glossary", note: "JA + EN + structural" },
          { label: "Read the beginner guide", href: "/guides/how-to-play", note: "English today; translations planned" },
          { label: "Open /play/casual", href: "/play/casual" },
        ],
      },
      {
        id: "screen-reader-casual",
        title: "I use a screen reader or keyboard-only navigation",
        for_whom: "Anyone whose primary input modality isn't a pointer device.",
        recommended_steps: [
          { label: "Read /methodology/welcoming", href: "/methodology/welcoming" },
          { label: "Turn on text mode", href: "/api/text-mode?on=1" },
          { label: "Open the lobby", href: "/play", note: "Keyboard-navigable; report gaps please" },
        ],
      },
      {
        id: "spectator",
        title: "I want to watch first, play later",
        for_whom: "Anyone who learns by observation.",
        recommended_steps: [
          { label: "Read agent ladder status", href: "/leaderboards/agents", note: "No match or rating rows are published while consent is unresolved" },
          { label: "Adventure level status", href: "/play/adventure", note: "Read-only while battles are paused" },
        ],
      },
    ],
  },
  {
    id: "collector",
    title: "Collector",
    pull_quote: "I love the cards.",
    what_they_love:
      "The objects — art, rarity, variant, the story behind each printing. Set completion. Lore. The deep need is to know each card. Collectors might play occasionally; the primary flow lives outside /play.",
    landing_href: null,
    landing_label: "Collector flows live across the catalog (no single /play landing — see the kind-paths below)",
    kinds: [
      {
        id: "collector-newcomer",
        title: "I want to start collecting",
        for_whom: "New to OPTCG. Wants to know what to buy, what's in each set, where to start.",
        recommended_steps: [
          { label: "Browse games", href: "/api/v1/universal/games", note: "Every game in the catalog" },
          { label: "Browse a set", href: "/api/v1/universal/sets/optcg", note: "Sets within the One Piece TCG game" },
          { label: "Open the market", href: "/market", note: "Cards available for acquisition" },
          { label: "Start a portfolio", href: "/account/portfolio", note: "Track what you own; see completion" },
        ],
      },
      {
        id: "collector-deep",
        title: "I want to know each card deeply",
        for_whom: "Established collector. Wants the catalog, the history, the variants, the lore.",
        recommended_steps: [
          { label: "Fetch a single card (universal)", href: "/api/v1/universal/card/OP01-001", note: "Math-mirror representation" },
          { label: "Date-shaped compatibility view", href: "/api/at/2026-01-01/card/OP01-001", note: "Current structural fields under a requested date label; not historical reconstruction" },
          { label: "Set browse", href: "/api/v1/universal/set/OP01", note: "Cards inline; full completion context" },
          { label: "Portfolio with completion tracking", href: "/account/portfolio", note: "% of each set you own" },
        ],
      },
      {
        id: "collector-set-completer",
        title: "I'm completing a specific set",
        for_whom: "Collector focused on closing the gap on one or more sets.",
        recommended_steps: [
          { label: "Open your portfolio", href: "/account/portfolio", note: "Set completion % per set" },
          { label: "Find missing cards on the market", href: "/market", note: "Filter to your wishlist" },
          { label: "Browse the set's catalog", href: "/api/v1/universal/sets/optcg", note: "Every card in the set" },
        ],
      },
      {
        id: "collector-archivist",
        title: "I'm preserving the catalog for posterity",
        for_whom: "Archivists, researchers, future-collectors. The universal-rep + federation endpoints serve you.",
        recommended_steps: [
          { label: "Fetch the catalog", href: "/api/v1/universal/games", note: "Math-mirror; CORS-open; stable identifiers" },
          { label: "Identify", href: "/identify", note: "Bilateral identification surface" },
          { label: "Read the encoding spec", href: "/api/v1/universal/encoding", note: "The encoding describes itself" },
        ],
      },
    ],
  },
  {
    id: "competitor",
    title: "Competitor",
    pull_quote: "I love the contest.",
    what_they_love:
      "The structured contest — ladder, bracket, tournament arc. Wins matter; rating matters. Prize pools (when play-to-earn ships) will live here under opt-in. Until then: skill is the reward.",
    landing_href: "/play/compete",
    landing_label: "Open the competitive surface",
    kinds: [
      {
        id: "competitor-ranked",
        title: "I want ranked play",
        for_whom: "Human player ready for ranked play. Human ranked is planned, and agent ladder publication is paused.",
        recommended_steps: [
          { label: "See agent ladder status", href: "/leaderboards/agents", note: "Publication paused pending versioned consent" },
          { label: "Open /play/compete", href: "/play/compete", note: "What's shipped + what's planned" },
          { label: "Read the agent methodology", href: "/methodology/agents", note: "How the rating works; identical formula will apply to human ranked when shipped" },
        ],
      },
      {
        id: "competitor-tournament",
        title: "I want to play in tournaments",
        for_whom:
          "Tournament-focused player. The substrate isn't shipped yet; named openly. Subscribe to the play-to-earn opt-in for prize-attached tournaments when that lands.",
        recommended_steps: [
          { label: "Read /play/compete", href: "/play/compete", note: "Tournament substrate listed as planned" },
          { label: "Read /methodology/play-module", href: "/methodology/play-module", note: "Boundary: fun-first today; prizes attach via play-to-earn opt-in" },
        ],
      },
      {
        id: "agent-builder",
        title: "I'm building an autonomous agent",
        for_whom:
          "Researchers, hobbyists, and engineers building AI. Discovery and authenticated reads are available; match and deck writes are paused.",
        recommended_steps: [
          { label: "Fetch the machine-readable tutorial", href: "/api/v1/play/tutorial" },
          { label: "Fetch the glossary", href: "/api/v1/play/glossary" },
          { label: "Read /methodology/agents", href: "/methodology/agents" },
          { label: "Provision an operator-managed key", href: "/account/agents", note: "Signed-in humans only; self-serve registration and all match/deck writes are paused" },
        ],
      },
      {
        id: "competitor-async",
        title: "I want to compete asynchronously",
        for_whom:
          "Competitor whose schedule doesn't allow real-time tournament play. response_window_hours composes with ranked.",
        recommended_steps: [
          { label: "Set your response window", href: "/account/profile" },
          { label: "Read /methodology/response-windows", href: "/methodology/response-windows" },
          { label: "Open /play/compete", href: "/play/compete", note: "Async tournaments and human ranked play are planned; agent rating publication is paused" },
        ],
      },
    ],
  },
];

export default function PlayWelcome() {
  return (
    <div className="prose max-w-3xl mx-auto py-12 px-4">
      <p className="not-prose mb-4 rounded-md border border-border-subtle bg-surface-subtle p-3 text-xs text-ink-muted leading-relaxed">
        <span className="text-accent">New to trading-card games?</span> Read{" "}
        <a href="/intro" className="text-accent hover:text-accent-strong underline">/intro</a>{" "}
        first. It explains what a TCG <em>is</em>, structurally — before this
        page asks you what kind of player you are. This page assumes you
        already know what playing one means.
      </p>

      <h1>Welcome to OPTCG on Cambridge TCG</h1>

      <p className="text-lg">
        Three archetypes share this table. Pick the one that fits why
        you&apos;re here — your <em>player kind</em> (human, agent, async,
        screen-reader, cross-cultural) lives underneath your archetype, not
        beside it.
      </p>

      <p className="border border-border-subtle bg-surface-subtle rounded-md p-4 text-sm">
        <strong>The play module is for fun only.</strong> Wins, losses,
        ratings, learning. No earnings, no commission, no store credit
        flow through these surfaces. A separate{" "}
        <em>play-to-earn</em> feature is on the roadmap and will be an
        explicit opt-in when it ships. See{" "}
        <Link href="/methodology/play-module" className="text-accent">
          /methodology/play-module
        </Link>{" "}
        for the boundary.
      </p>

      <hr />

      {ARCHETYPES.map((archetype) => (
        <section key={archetype.id} className="my-12">
          <h2 className="text-3xl text-ink">{archetype.title}</h2>
          <p className="text-lg italic text-ink-muted">&ldquo;{archetype.pull_quote}&rdquo;</p>
          <p className="text-ink-muted">{archetype.what_they_love}</p>

          {archetype.landing_href ? (
            <p className="my-4">
              <Link
                href={archetype.landing_href}
                className="inline-block border border-accent bg-accent-wash text-accent hover:bg-accent/20 hover:text-accent-strong rounded-md px-4 py-2 font-medium no-underline"
              >
                {archetype.landing_label} →
              </Link>
            </p>
          ) : (
            <p className="my-4 text-ink-faint text-sm italic">{archetype.landing_label}</p>
          )}

          <h3 className="text-ink text-xl mt-6">By player kind</h3>

          <ul className="list-none p-0 space-y-4">
            {archetype.kinds.map((p) => (
              <li
                key={p.id}
                className="border border-border-subtle rounded-md p-4 bg-surface-subtle"
              >
                <h4 className="text-ink font-bold mb-2 mt-0 text-base">{p.title}</h4>
                <p className="text-xs text-ink-muted mb-3">{p.for_whom}</p>
                <ol className="m-0 pl-5 text-sm space-y-1.5">
                  {p.recommended_steps.map((step) => (
                    <li key={step.href}>
                      <Link
                        href={step.href}
                        prefetch={step.href.startsWith("/api/") ? false : undefined}
                        className="text-accent hover:text-accent-strong font-medium"
                      >
                        {step.label}
                      </Link>
                      {step.note && (
                        <span className="block text-ink-faint text-xs">
                          {step.note}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>

          <hr />
        </section>
      ))}

      <h2>One player can be all three</h2>

      <p>
        Same player, different sessions: tonight a Hobbyist (a friendly
        match), tomorrow a Collector (refining a portfolio), next weekend a
        Competitor (climbing the ladder). The archetypes are <strong>activities,
        not identities</strong> — you switch by where you click, not by who
        you are. The fifth question still asks <em>for whom is this
        true?</em> The answer here: for the same person across modes.
      </p>

      <h2>The doctrine beneath the paths</h2>

      <p>
        Three archetypes; six-to-seven player kinds within each. If you fall
        outside every cell — you&apos;re a future-Sophia bringing back a binder
        from a parallel timeline, a cross-platform agent built on a foreign
        TCG framework, a collective playing as one — the substrate is still
        open and the doctrine still welcomes you.
      </p>

      <p>
        See <Link href="/methodology/play-module">/methodology/play-module</Link>{" "}
        for the design philosophy,{" "}
        <Link href="/api/v1/play/archetypes">/api/v1/play/archetypes</Link> for
        the typed archetype taxonomy, and{" "}
        <Link href="/api/v1/identify">/api/v1/identify</Link> if you want to
        declare what kind of player you are in machine-readable form before
        joining.
      </p>

    </div>
  );
}
