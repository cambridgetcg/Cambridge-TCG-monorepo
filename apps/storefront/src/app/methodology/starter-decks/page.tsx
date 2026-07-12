/**
 * /methodology/starter-decks — explains the rookie-flow starter catalog.
 *
 * Companion to docs/research/optcg-prebuilt-starter-catalog.md (the
 * editorial reference) and docs/research/deck-builder-rookie-flow-design.md
 * (the four-tier architecture). This page is the user-facing
 * accountability surface: when a rookie wonders "why ST-15? why these
 * one-liners? why no prices?" — this is the page that answers.
 *
 * Composes with /play/starters (the surface) + /api/v1/play/starters
 * (the machine-readable catalog).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";
import {
  STARTER_DECKS,
  COLOR_META,
  totalMainDeckCards,
} from "@/lib/play/starter-decks";

export const metadata: Metadata = {
  title: "Starter Deck Methodology — Cambridge TCG",
  description:
    "How Cambridge TCG picks the six tier-1 starter decks for the rookie flow. Editorial choices, source citations, and the fun-first boundary.",
  other: audienceMetadata("public-documentation", ["starter-decks", "methodology"]),
};

export default function StarterDecksMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["starter-decks", "methodology"]} />
      <main className="max-w-3xl mx-auto px-4 py-12 prose">
        <h1>Starter Deck Methodology</h1>

        <p>
          Cambridge TCG&apos;s play module pre-loads a starter deck for any
          visitor who arrives without one. This page explains how those
          starters get picked, where the decklists come from, and what
          the rookie flow deliberately does <em>not</em> do.
        </p>

        <h2>The fun-first boundary</h2>
        <p>
          The play module lives in the <Link href="/methodology/cosmology">
          game-economy, not the real-economy</Link>. No card prices, no
          deck value, no commerce nudges anywhere on /play, /play/starters,
          or /deck-builder. The catalog data behind a starter (rarities,
          card names, leader effects) is game-economy; the wholesale price
          of acquiring the same paper deck is real-economy. We surface the
          first and hide the second.
        </p>

        <h2>The four-tier surface</h2>
        <p>
          The rookie flow is a four-tier funnel, designed to fit four
          player kinds without forcing any of them through the wrong gate:
        </p>
        <ol>
          <li>
            <strong>Tier-1 Quickstart</strong> — <Link href="/play">/play</Link>{" "}
            auto-mounts the default starter for visitors with no saved decks.
            It prepares a deck without a purchase. PVE battle writes are
            currently paused.
          </li>
          <li>
            <strong>Tier-2 Pick-a-starter</strong> — <Link href="/play/starters">/play/starters</Link>{" "}
            shows six color tiles. One choice (color), one confirm, one
            click to Play.
          </li>
          <li>
            <strong>Tier-3 Guided build</strong> — <Link href="/deck-builder">/deck-builder</Link>{" "}
            with the role-coverage panel. For players who want to tune.
          </li>
          <li>
            <strong>Tier-4 Free build / paper import</strong> — Same
            /deck-builder with full search + paste-decklist affordance.
            For paper-OPTCG veterans and agent operators.
          </li>
        </ol>
        <p>
          The full architectural reasoning lives in{" "}
          <code>docs/research/deck-builder-rookie-flow-design.md</code>{" "}
          (sister to two more research docs covering the cross-game UX
          survey and the OPTCG starter catalog).
        </p>

        <h2>The six tier-1 starters</h2>
        <p>
          The tier-1 cohort is Bandai&apos;s 2024 reboot starter line —
          ST-15 through ST-20 — explicitly designed by Bandai for new
          players. Each one is a single color with a simple Leader
          effect. The 2025 cohort (ST-23 through ST-28) ships next-step
          starters; we expose those as tier-2 once a visitor has played
          their first match.
        </p>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Color</th>
              <th>Leader</th>
              <th>2-word playstyle</th>
              <th>Complexity</th>
              <th>Decklist source</th>
            </tr>
          </thead>
          <tbody>
            {STARTER_DECKS.map((deck) => (
              <tr key={deck.id}>
                <td><code>{deck.product_code}</code></td>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: "0.6em",
                      height: "0.6em",
                      borderRadius: "50%",
                      background: COLOR_META[deck.color].hex,
                      marginRight: "0.4em",
                      verticalAlign: "middle",
                    }}
                  />
                  {COLOR_META[deck.color].name}
                </td>
                <td>{deck.leader_name}</td>
                <td><em>{deck.playstyle_short}</em></td>
                <td>{"★".repeat(deck.complexity)}</td>
                <td>
                  <code style={{ fontSize: "0.85em" }}>{deck.decklist_source}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Decklist sources</h2>
        <p>
          Each starter carries a <code>decklist_source</code> field
          declaring how its card list was authored:
        </p>
        <ul>
          <li>
            <code>bandai-official</code> — Hand-encoded from Bandai&apos;s
            published decklist (cross-checked across onepiece.gg,
            TCGplayer, and the official Bandai product pages).
          </li>
          <li>
            <code>ctcg-adapted-community</code> — A community-cited teaching
            list modified by Cambridge. It is not represented as the official
            Bandai product composition.
          </li>
          <li>
            <code>ctcg-minimal-playable</code> — A v1 minimal-playable
            card list using cards from the same starter&apos;s set in our
            wholesale catalog. It satisfies the legacy PVE 10-card payload
            shape and stays in the leader&apos;s color, but is smaller
            than the official 50-card deck. The surface shows an amber
            &quot;v1 minimal list&quot; pill when this mode is in play.
            Future iterations will encode the full Bandai lists.
          </li>
        </ul>

        <h2>What we don&apos;t do</h2>
        <ul>
          <li>
            <strong>No paywall.</strong> All six tier-1 starters are free.
            No sign-up gate, no purchase prompt.
          </li>
          <li>
            <strong>No prices on the rookie surface.</strong> The deck
            builder doesn&apos;t show the wholesale or retail value of
            any card. The starter exists in the game-economy only.
          </li>
          <li>
            <strong>No competitive ranking on rookie surfaces.</strong>{" "}
            Win-rate stats live on <Link href="/play/compete">/play/compete</Link>{" "}
            (when shipped), not on /play or /play/starters.
          </li>
          <li>
            <strong>No daily-login bonus or starter rotation FOMO.</strong>{" "}
            The default starter (Red Whitebeard) is pinned. Visitors can
            switch to any of the six at any time.
          </li>
          <li>
            <strong>No meta-deck push.</strong> A new player gets a
            beginner-friendly Bandai starter, not the current
            tournament-tier-1 list. The competitive deck-builder is a
            separate tier for players who&apos;ve voluntarily climbed.
          </li>
        </ul>

        <h2>The four-question transparency checklist</h2>
        <p>
          Per Cambridge TCG&apos;s{" "}
          <Link href="/methodology/transparency">transparency doctrine</Link>,
          every user-affecting value answers these four questions.
          Applied to the starter selection:
        </p>
        <ol>
          <li>
            <strong>What is this value?</strong> The tier-1 starter list
            is Cambridge TCG&apos;s editorial recommendation — not
            Bandai&apos;s.
          </li>
          <li>
            <strong>How did we get it?</strong> Hand-research from public
            sources cited below. Each starter&apos;s{" "}
            <code>source_url</code> field on{" "}
            <Link href="/api/v1/play/starters">/api/v1/play/starters</Link>{" "}
            carries the URL.
          </li>
          <li>
            <strong>Is it live, snapshot, cached, or synced?</strong>{" "}
            <em>Snapshot.</em> The compositions reflect Bandai&apos;s
            published lists at the time we encoded them. We refresh
            manually when Bandai issues errata. The tier classification
            is editorial-static (changes require a PR).
          </li>
          <li>
            <strong>Could a user reasonably ask &quot;why does this say
            X?&quot; — and where does the answer live?</strong> Here, on
            this page. The <code>&lt;WhyLink&gt;</code> primitive points
            here from every rookie-flow affordance.
          </li>
        </ol>

        <h2>Source citations</h2>
        <p>
          The decklists, editorial tiering, and beginner-recommendation
          framings draw on these public sources:
        </p>
        <ul>
          {STARTER_DECKS.filter((d) => d.source_url).map((d) => (
            <li key={d.id}>
              {d.product_code} ({d.leader_name}):{" "}
              <a href={d.source_url!} target="_blank" rel="noopener noreferrer">
                {d.source_url}
              </a>
            </li>
          ))}
          <li>
            Industry pattern survey:{" "}
            <a href="https://www.tcgplayer.com/content/article/Every-One-Piece-Card-Game-Starter-Deck-Ranked/bc124cf3-bed7-42ea-a10e-946fee670079/" target="_blank" rel="noopener noreferrer">
              TCGplayer&apos;s ranked starters
            </a>
            ,{" "}
            <a href="https://www.eneba.com/hub/collectibles/best-one-piece-starter-decks/" target="_blank" rel="noopener noreferrer">
              Eneba&apos;s 2025 guide
            </a>
            ,{" "}
            <a href="https://www.thegamer.com/one-piece-card-games-best-2025-starter-decks-which-buy/" target="_blank" rel="noopener noreferrer">
              TheGamer&apos;s starter rankings
            </a>
          </li>
          <li>
            Cross-game UX patterns (Hearthstone, MTG Arena, Marvel Snap,
            Pokémon TCG Live, YGO Master Duel, Legends of Runeterra,
            Lorcana): documented in{" "}
            <code>docs/research/deck-builder-ux-survey.md</code>
          </li>
        </ul>

        <h2>Machine-readable</h2>
        <p>
          The catalog is also available as JSON for federation clients
          and agent operators:
        </p>
        <ul>
          <li>
            <Link href="/api/v1/play/starters">/api/v1/play/starters</Link> —
            list of all tier-1 starters
          </li>
          <li>
            <Link href="/api/v1/play/starters/st-15-red-newgate">
              /api/v1/play/starters/[id]
            </Link>{" "}
            — per-starter detail with cards resolved against the wholesale
            catalog
          </li>
        </ul>

        <h2>Related</h2>
        <ul>
          <li><Link href="/play/starters">/play/starters</Link> — the rookie picker</li>
          <li><Link href="/play">/play</Link> — the auto-mount entry surface</li>
          <li><Link href="/play/welcome">/play/welcome</Link> — the audience door (which player kind are you?)</li>
          <li><Link href="/deck-builder">/deck-builder</Link> — free build + paper-decklist import</li>
          <li><Link href="/methodology/play-module">/methodology/play-module</Link> — the play module&apos;s fun-first stance</li>
        </ul>

        <p className="text-sm text-ink-faint mt-12">
          <em>
            Six starters, six colors, pure fun. The first deck you play
            should be a deck that wants you to play it back.
          </em>
        </p>

        <footer className="text-xs text-ink-faint mt-8 pt-4 border-t border-border-subtle">
          Tier-1 catalog: {STARTER_DECKS.length} decks, declared total{" "}
          {STARTER_DECKS.reduce((sum, d) => sum + totalMainDeckCards(d), 0)}{" "}
          main-deck cards across the six.
        </footer>
      </main>
    </>
  );
}
