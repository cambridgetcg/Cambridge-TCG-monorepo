import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Tutorial methodology",
  description:
    "How the /play/tutorial module decides what to teach, how it teaches it, who it's for, and what it intentionally doesn't cover. Substrate honesty applied to learning material.",
  other: audienceMetadata("public-documentation", ["methodology", "play", "tutorial"]),
};

export default function TutorialMethodology() {
  return (
    <>
      <h1>Tutorial methodology</h1>

      <p>
        The play module's tutorial at{" "}
        <Link href="/play/tutorial" className="text-accent-strong">
          /play/tutorial
        </Link>{" "}
        is the first doorway for anyone who has never played a trading card
        game before. This page documents <em>how the tutorial decides what
        to teach</em>, <em>who it's for</em>, <em>what it intentionally
        defers</em>, and <em>what rules-fidelity level we claim</em> — substrate
        honesty applied to learning material rather than transactional state.
      </p>

      <h2>Audience</h2>

      <p>
        The tutorial's primary audience is the <strong>human absolute
        beginner</strong> — someone who has not previously played any TCG (MTG,
        Pokémon, Hearthstone, Yu-Gi-Oh, Lorcana, anything). The first section
        (<em>"First, what is a trading card game?"</em>) does not assume that
        words like "deck" or "hand" or "turn" carry pre-existing meaning. From
        there the tutorial moves to OPTCG-specific vocabulary one layer at a
        time.
      </p>

      <p>
        Secondary audiences served by the same content:
      </p>

      <ul>
        <li>
          <strong>Players returning from other TCGs.</strong> They can skim
          sections 1–2 ("what is a TCG", "what is OPTCG") and start at
          section 3 ("how to read a card"). The OPTCG-specific differences from
          other TCGs are concentrated in the cards anatomy, the playmat layout
          (DON!! pool, life secrecy), and the four-step combat (Counter step).
        </li>
        <li>
          <strong>Agents.</strong> The same content is published in structural
          form at{" "}
          <Link href="/api/v1/play/tutorial" className="text-accent-strong font-mono">
            /api/v1/play/tutorial
          </Link>
          . Each section has typed <code>preconditions</code> /{" "}
          <code>transitions</code> / <code>outcomes</code> + state-before /
          action / state-after example triples. Agents don't need the visual
          diagrams in the human page.
        </li>
        <li>
          <strong>Screen-reader users + keyboard-only navigation.</strong> The
          page is structured as semantic <code>&lt;section&gt;</code> +{" "}
          <code>&lt;h2&gt;</code> + <code>&lt;ol&gt;</code> with descriptive
          alt-text on diagrams; the ASCII playmat diagram is wrapped in{" "}
          <code>&lt;pre&gt;</code> so screen readers announce it as preformatted
          text. Anchor links between sections work without JS.
        </li>
        <li>
          <strong>Spectators learning by reading before playing.</strong> No
          interactive widget requires the user to act before continuing.
        </li>
      </ul>

      <h2>What the tutorial teaches</h2>

      <p>Ten sections, in this order:</p>

      <ol>
        <li>
          <strong>First, what is a trading card game?</strong> — universal-TCG
          vocabulary (deck, hand, turn, win condition). For absolute beginners.
        </li>
        <li>
          <strong>What is OPTCG.</strong> — the specific game we host. Two
          players, 1 Leader + 50 main + 10 DON!! deck, life-card win condition.
        </li>
        <li>
          <strong>How to read a card.</strong> — Leader vs Character card
          anatomy with visual diagram. Cost / Power / Counter / Color hexagon /
          Effect text / Block number.
        </li>
        <li>
          <strong>The playmat.</strong> — Bandai's eight-zone official layout,
          rendered as an ASCII diagram. Includes the substrate-honesty notes:
          DON!! deck is <em>open</em> to both players; Life is{" "}
          <em>secret to BOTH</em>.
        </li>
        <li>
          <strong>Game setup.</strong> — place Leader, shuffle, draw 5,
          mulligan once, place 5 life face-down, determine first player.
        </li>
        <li>
          <strong>Turn structure.</strong> — Refresh → Draw → DON!! → Main →
          End. With the first-turn rule (going first means no draw + only 1 DON
          on turn 1).
        </li>
        <li>
          <strong>DON!! cards.</strong> — the OPTCG-specific resource system.
        </li>
        <li>
          <strong>Combat.</strong> — the four-step combat resolution: Declare,
          Block, Counter, Damage. The defender-wins-ties rule is named
          explicitly because it decides every edge case.
        </li>
        <li>
          <strong>Winning the game.</strong> — life-card depletion, deck-out,
          Leader-K.O.
        </li>
        <li>
          <strong>Try it.</strong> — handoff to <Link href="/play">/play</Link>,
          which accepts anonymous visitors (guest cookie), no sign-in required.
        </li>
      </ol>

      <h2>What the tutorial intentionally doesn't teach</h2>

      <p>
        Two categories of OPTCG content are <em>deliberately deferred</em>:
      </p>

      <h3>1. Card-effect interpretation (Phase 4 boundary)</h3>

      <p>
        The current play module's engine plays the substrate — zones, turns,
        DON!! pool, basic combat, life-card flip — but does not interpret card
        effect text. The keyword tags <code>[On Play]</code>,{" "}
        <code>[Trigger]</code>, <code>[Once Per Turn]</code>,{" "}
        <code>[Counter]</code>, <code>[Blocker]</code>, etc. are visible on the
        cards but the engine does not yet enforce what they do. Teaching the
        full effect grammar before the engine implements it would lie to
        learners about what they can expect when they play.
      </p>

      <p>
        When Phase 4 of the multi-game roadmap (
        <Link href="/api/v1/play/tutorial" className="text-accent-strong font-mono">
          S47
        </Link>
        ) ships the effect engine, the tutorial gains a new section explaining
        effect resolution and the keyword vocabulary's behavioral meaning. Until
        then, the tutorial points learners at the bilingual{" "}
        <Link href="/api/v1/play/glossary" className="text-accent-strong">
          glossary
        </Link>{" "}
        for definitions and{" "}
        <Link href="/play/compete" className="text-accent-strong">
          /play/compete
        </Link>{" "}
        + research docs for competitive depth.
      </p>

      <h3>2. Tournament / format rules</h3>

      <p>
        Deck-construction rules (50 main + max 4 copies + colors must match
        Leader + no sideboards), match formats (BO1 30min, BO3 60min), block
        rotation (Block 1 OP01–OP04 rotates out 2026-04-01), banned/restricted
        cards (Charlotte Pudding banned 2026-04-01; Prohibited Pairs system),
        and Championship deck-list submission rules are all <em>real</em> but
        not enforced in our engine yet. The tutorial mentions them for
        awareness; the substantive treatment lives in{" "}
        <code>
          docs/research/optcg-playmat-and-tournament-rules.md
        </code>{" "}
        and at{" "}
        <Link href="/play/compete" className="text-accent-strong">
          /play/compete
        </Link>
        .
      </p>

      <h2>Rules-fidelity declaration</h2>

      <p>
        Per the multi-game play module roadmap, each engine declares the
        fidelity level at which it implements its game. The OPTCG engine
        today is:
      </p>

      <blockquote>
        <strong>Core ruleset, vanilla effect interpretation only.</strong>
      </blockquote>

      <p>What this means concretely:</p>

      <ul>
        <li>
          <strong>Zones, turns, phases, basic combat:</strong> faithfully
          implemented (with two known gaps — Character cap of 5 not server-
          enforced; Stage cap of 1 not server-enforced).
        </li>
        <li>
          <strong>DON!! pool mechanics, attach/rest/refresh:</strong> faithfully
          implemented.
        </li>
        <li>
          <strong>Life-card draw on damage:</strong> faithfully implemented;
          Trigger effects on life flip <em>are not</em> interpreted (the card
          enters hand without firing its [Trigger] action).
        </li>
        <li>
          <strong>Card effects:</strong> <em>not interpreted.</em> A card with
          "[On Play] Draw 2 cards" plays from hand and rests DON!! for its cost
          but does not fire the draw action.
        </li>
        <li>
          <strong>Counter step:</strong> partially implemented — the combat
          flow has the slot for counters but Counter values are not redeemed
          from hand to boost defender power.
        </li>
        <li>
          <strong>Blocker keyword:</strong> recognized as a card field but the
          blocker-intercepts-attack behavior is not enforced.
        </li>
        <li>
          <strong>Format legality (Standard / Extra Regulation):</strong> not
          enforced. The engine accepts any deck shape ≥ 10 cards.
        </li>
        <li>
          <strong>Ban list, prohibited pairs, block rotation:</strong> not
          consulted.
        </li>
      </ul>

      <p>
        This rules-fidelity level is appropriate for the <strong>Hobbyist</strong>{" "}
        and <strong>Beginner</strong> archetypes (see{" "}
        <Link href="/api/v1/play/archetypes" className="text-accent-strong">
          /api/v1/play/archetypes
        </Link>
        ) who play for love of the cards rather than competitive standing. It
        is insufficient for the <strong>Competitor</strong> archetype's
        tournament play — which is why the play module separates them with
        explicit landings (
        <Link href="/play/casual" className="text-accent-strong">/play/casual</Link>{" "}
        vs{" "}
        <Link href="/play/compete" className="text-accent-strong">/play/compete</Link>
        ).
      </p>

      <h2>Substrate honesty</h2>

      <p>
        The tutorial obeys substrate-honesty rule 1 — <em>every value carries an
        implicit or explicit claim about how it came to be true</em> — at three
        layers:
      </p>

      <ol>
        <li>
          <strong>Visual diagrams declare their source.</strong> The playmat
          diagram cites Bandai's Rule Manual (eight-zone numbering matches the
          official artwork). The card-anatomy diagram is labeled
          "Illustrative" because we draw approximations of Bandai layout, not
          actual cards.
        </li>
        <li>
          <strong>The engine's fidelity is named.</strong> Each section that
          describes a rule the engine doesn't enforce includes a note ("today's
          engine plays vanilla combat without resolving keyword effects"). The
          learner is never told the engine does something it doesn't.
        </li>
        <li>
          <strong>What the tutorial doesn't cover is named.</strong> The
          "What the tutorial intentionally doesn't teach" section above is
          itself the substrate-honest disclosure of the gap between this
          tutorial and a competitive guide.
        </li>
      </ol>

      <h2>The fifth question — for whom is this true?</h2>

      <p>
        The tutorial in its current form privileges:
      </p>

      <ul>
        <li>
          <strong>English speakers.</strong> Sections are written in English
          only. The bilingual glossary (
          <Link href="/api/v1/play/glossary" className="text-accent-strong font-mono">
            /api/v1/play/glossary
          </Link>
          ) covers the OPTCG vocabulary in English + Japanese, but the
          surrounding prose is monolingual. Future translation is a tracked
          recursion target.
        </li>
        <li>
          <strong>Synchronous readers.</strong> The "Try it" handoff assumes
          you can click Play right now and play a turn. Async-friendly play
          (slow-clock, intermittent attention) is covered in a separate
          tutorial section (
          <Link href="/api/v1/play/tutorial/for_async_players" className="text-accent-strong font-mono">
            for_async_players
          </Link>
          ) accessible from the agent-targeted JSON tutorial; the absolute-
          beginner human path doesn't include it.
        </li>
        <li>
          <strong>Visual readers.</strong> The page works without the visual
          diagrams (semantic HTML), but the diagrams are a load-bearing
          teaching aid for the playmat layout. Screen-reader users get the
          ASCII playmat diagram (announced as preformatted text); a future
          recursion target is a structurally-described version that doesn't
          rely on spatial layout.
        </li>
      </ul>

      <p>
        Three audiences NOT served by this tutorial that the platform claims
        to welcome (per <Link href="/welcome-all" className="text-accent-strong">/welcome-all</Link>):
        non-English-only readers, slow-clock thinkers, and anyone whose
        primary input modality isn't a pointer device. The gaps are named
        rather than concealed.
      </p>

      <h2>Where this lives in code</h2>

      <ul>
        <li>
          Tutorial sections (canonical text, agent-readable):{" "}
          <code>apps/storefront/src/lib/play/tutorial-sections.ts</code>
        </li>
        <li>
          Human visual page (this tutorial's UI):{" "}
          <code>apps/storefront/src/app/play/tutorial/page.tsx</code>
        </li>
        <li>
          Machine-readable JSON:{" "}
          <code>apps/storefront/src/app/api/v1/play/tutorial/route.ts</code>
        </li>
        <li>
          Bilingual glossary:{" "}
          <code>apps/storefront/src/lib/play/glossary-terms.ts</code> served at{" "}
          <code>/api/v1/play/glossary</code>
        </li>
        <li>
          Methodology (this page):{" "}
          <code>apps/storefront/src/app/methodology/tutorial/page.tsx</code>
        </li>
        <li>
          Underlying research:{" "}
          <code>docs/research/optcg-playmat-and-tournament-rules.md</code>{" "}
          (Bandai-sourced playmat + tournament + ban-list),{" "}
          <code>docs/research/optcg-mechanics-and-engine-design.md</code>{" "}
          (engine design),{" "}
          <code>docs/research/optcg-meta-evolution-and-deckbuilding.md</code>{" "}
          (meta + deckbuilding).
        </li>
        <li>
          Connection-doc: <code>docs/connections/the-first-doorway.md</code>{" "}
          (S49 — to be authored as story-as-wire of this kingdom).
        </li>
      </ul>

      <p className="mt-12 italic text-ink-faint">
        The kingdom learned the substrate. The tutorial is how the kingdom
        teaches anyone what it learned. The teaching is substrate-honest
        about what it can and can't claim. The learner is never lied to.
      </p>
    </>
  );
}
