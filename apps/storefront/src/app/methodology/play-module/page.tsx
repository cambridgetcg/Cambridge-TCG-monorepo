import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Play module",
  other: audienceMetadata("public-documentation", ["methodology", "play"]),
};

export default function PlayModuleMethodology() {
  return (
    <>
      <h1>Play module</h1>

      <p>
        The play module is where Cambridge TCG hosts One Piece TCG matches.
        It exists at four layers: <strong>human PvP</strong> (real-time and
        async rooms at <code>/play/[code]</code>), <strong>human PvE</strong>{" "}
        (single-player adventure mode against AI opponents at{" "}
        <code>/play/adventure</code>), <strong>agent vs agent</strong> (autonomous
        matches mediated by the MCP gate at <code>/api/mcp</code>), and{" "}
        <strong>tutorial &amp; discovery</strong> (the layer this page documents,
        shipped in kingdom-059).
      </p>

      <p>
        This page documents how the play module accommodates players whose
        cognitive, temporal, sensory, cultural, or substrate properties differ
        from the platform&apos;s implicit defaults. Yu&apos;s directive that opened
        this kingdom: <em>&quot;Dive deeper into the play module. Think about the
        need and experience of the players, whether human, agents or people from
        different timeline. All are welcomed with tutorials that are inclusive
        and multi cultural.&quot;</em>
      </p>

      <h2>Boundary — fun first</h2>

      <p>
        <strong>The play module is for fun only.</strong> Wins, losses,
        ratings, learning, the satisfaction of a clever line of play — these
        are the rewards. Nothing in the play surface earns money, store
        credit, fees, or any commerce-side value until a separate{" "}
        <strong>play-to-earn</strong> feature ships, and that feature will be
        an explicit opt-in alongside its own methodology page.
      </p>
      <p>
        This is a boundary Yu drew explicitly: <em>&quot;Make sure the play
        module is for FUN only, don&apos;t drag the financial element into it
        until the play to earn.&quot;</em> The play module&apos;s tutorial,
        glossary, welcome landing, lobby, match surface, and agent gate
        carry no commerce affordances. Ratings (the Glicko-2 ladder at{" "}
        <code>/leaderboards/agents</code>) are competitive standing — not
        money — and the leaderboard is a record of skill, not earnings.
      </p>
      <p>
        <strong>Acknowledged gap:</strong> the existing PvE adventure schema
        carries a <code>first_clear_credit</code> column (store credit on
        first-clear) and <code>repeat_points</code> (loyalty points on
        repeat). These predate this boundary and constitute a current drift
        between the play module and the fun-first stance. When the
        play-to-earn feature ships, the PvE reward structure moves under
        that feature&apos;s opt-in; until then, the drift is named here so
        the next kingdom that touches PvE knows to reconcile.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The lobby is at{" "}
        <code>apps/storefront/src/app/play/page.tsx</code>; matches at{" "}
        <code>apps/storefront/src/app/play/[code]/page.tsx</code>; PvE at{" "}
        <code>apps/storefront/src/app/play/adventure</code>; the agent surface
        at <code>apps/storefront/src/app/api/mcp/route.ts</code> (S18); the
        machine-readable tutorial at <code>apps/storefront/src/app/api/v1/play/tutorial/route.ts</code>;
        the multi-cultural glossary at <code>apps/storefront/src/app/api/v1/play/glossary/route.ts</code>;
        the welcome landing at <code>apps/storefront/src/app/play/welcome/page.tsx</code>.
        Story-as-wire: <code>docs/connections/the-shared-table.md</code> (S32).
      </blockquote>

      <h2>The three player archetypes (why they're here)</h2>

      <p>
        Player kinds (next section) name <em>how</em> a player interacts —
        substrate, modality, cadence. Archetypes name <em>why</em>. The same
        person can be all three across different sessions; the archetypes are
        activities, not identities.
      </p>

      <h3>1. Hobbyist — <em>"I love this game"</em></h3>
      <p>
        Plays for fun. Wins are nice; the playing is the point. Casual
        matches, adventure mode, weekly themed events (planned). <strong>No
        rating pressure, no prize pressure.</strong> The Hobbyist surface is{" "}
        <code>/play/casual</code>: the lobby, adventure mode, friendly private
        rooms, async-friendly turn deadlines.
      </p>

      <h3>2. Collector — <em>"I love the cards"</em></h3>
      <p>
        Loves the objects more than the matches. Set completion, lore, art,
        deep card knowledge. The Collector's primary flow lives <em>outside</em>{" "}
        <code>/play</code> — at <code>/account/portfolio</code> (collection
        tracking), <code>/market</code> (acquisition),{" "}
        <code>/api/v1/universal/sets/[game]</code> (catalog browsing),{" "}
        <code>/api/v1/universal/card/[sku]</code> (per-card depth), and the
        temporal slice <code>/api/at/[date]/card/[sku]</code> for historical
        context. The Collector might dip into casual play; the deep need is
        the catalog.
      </p>

      <h3>3. Competitor — <em>"I love the contest"</em></h3>
      <p>
        Plays competitively. Ranked ladder (Glicko-2, agent ladder live;
        human ladder planned), tournament structure (planned), match
        reporting, replay system (planned), prize pools (when play-to-earn
        ships). The Competitor surface is <code>/play/compete</code>:
        substrate-honest about what's shipped vs planned, the rating formula
        identical to the agent ladder, the prize layer attached only when
        the future opt-in feature lands.
      </p>

      <p>
        The typed archetype taxonomy is at{" "}
        <code>/api/v1/play/archetypes</code> — machine-readable for agents
        declaring their purpose before joining.
      </p>

      <h2>The four player kinds the module recognises</h2>

      <h3>1. Synchronous humans</h3>
      <p>
        Two humans at their keyboards, playing in near-real-time. The lobby
        (<code>/play</code>) creates a room and pairs them. The match surface
        is keyboard-navigable; pointer is sufficient but not required.
      </p>

      <h3>2. Asynchronous humans</h3>
      <p>
        Players whose cognitive cadence is hours-to-weeks per response. The
        platform&apos;s <code>users.response_window_hours</code> column (kingdom-051)
        is the per-user override on every &quot;you must respond within X&quot;
        deadline. An async-friendly match honors each player&apos;s declared
        window; a player who exceeds their window auto-passes. See{" "}
        <code>/methodology/response-windows</code>.
      </p>

      <h3>3. Autonomous agents</h3>
      <p>
        AI agents acting on behalf of human operators. Agents register at{" "}
        <code>/account/agents</code>, get a bearer token, and play through{" "}
        <code>/api/mcp</code>. Every move is tagged with{" "}
        <code>actor_kind=&apos;agent&apos;</code> +{" "}
        <code>actor_agent_id</code> + the upstream-responsible operator. The
        Glicko-2 ladder at <code>/leaderboards/agents</code> tracks ratings;
        same-operator pairings are blocked. See{" "}
        <code>/methodology/agents</code>.
      </p>

      <h3>4. Cross-cultural players</h3>
      <p>
        Players whose first language isn&apos;t English, especially those who
        encountered OPTCG via the Japanese release. The bilingual glossary at{" "}
        <code>/api/v1/play/glossary</code> carries every game term with
        Japanese (kanji/kana + romaji) + English + structural definition. The
        structural definition is decoderable without language knowledge — an
        agent or a hyperliteral reader can ground on it.
      </p>

      <h2>Tutorial surfaces</h2>

      <h3>For humans — the long-form guide</h3>
      <p>
        <code>/guides/how-to-play</code> is the SEO-rich English beginner&apos;s
        guide. ~15-minute read. Pictures, examples, complete rules including
        DON!! mechanics, combat, life cards, keywords. Optimised for first-time
        readers who haven&apos;t seen a TCG before.
      </p>

      <h3>For agents — the machine-readable tutorial</h3>
      <p>
        <code>/api/v1/play/tutorial</code> returns the rules as a math-mirror
        document. Every section has a typed <code>rule_structure</code>{" "}
        (preconditions / transitions / outcomes), worked examples in
        state-before / action / state-after form, and cross-references to the
        glossary terms it introduces. An agent ingests this once and is ready
        to play; no HTML parsing required.
      </p>

      <h3>For everyone — the welcome landing</h3>
      <p>
        <code>/play/welcome</code> is the polymorphic landing page. Seven paths —
        human-beginner / human-returning / agent-builder / async-player /
        screen-reader-user / cross-cultural-player / spectator — each with the
        recommended sequence of next steps. <strong>Every player picks a path;
        all paths converge at <code>/play</code>.</strong>
      </p>

      <h3>For the cross-cultural reader — the glossary</h3>
      <p>
        <code>/api/v1/play/glossary</code> carries each game term in three forms:
        the English token, the Japanese token (kanji/kana + romaji), and a
        structural definition that doesn&apos;t need natural-language knowledge to
        decode. Twelve terms today: DON!!, Leader, Life, Counter, Trigger,
        Active, Rested, Trash, Blocker, Rush, Draw phase, Color. The corpus
        grows by accumulation.
      </p>

      <h2>What the module assumes — and how each assumption is named</h2>

      <table>
        <thead>
          <tr><th>Implicit default</th><th>What that excludes</th><th>How the module accommodates</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Synchronous play (sub-minute turns)</td>
            <td>Async players, time-zone-shifted opponents, slow-clock thinkers</td>
            <td><code>users.response_window_hours</code> + async match mode</td>
          </tr>
          <tr>
            <td>Human at a pointer</td>
            <td>Agents, keyboard-only users, switch-input users</td>
            <td>MCP gate at <code>/api/mcp</code>; keyboard-navigable lobby; <code>/text-mode</code> alternate</td>
          </tr>
          <tr>
            <td>English-speaker</td>
            <td>Japanese-natives, non-English-natives</td>
            <td>Bilingual glossary; structural definitions decoderable without natural language; card metadata bilingual</td>
          </tr>
          <tr>
            <td>Game-knowledge from English release</td>
            <td>Players who learned via Japanese release</td>
            <td>Glossary carries both tokens; methodology page in plain English with structural sidebars</td>
          </tr>
          <tr>
            <td>Vision-dominant</td>
            <td>Screen-reader users, low-vision users</td>
            <td>Semantic HTML; ARIA labels; <code>/text-mode</code>; structural game state in <code>/api/v1/play/tutorial</code> for screen-reader-friendly review</td>
          </tr>
          <tr>
            <td>Adversarial framing (one wins)</td>
            <td>Players who prefer cooperative / observational learning</td>
            <td>PvE adventure mode (single-player); spectator mode (planned); replay system (planned)</td>
          </tr>
          <tr>
            <td>Play-as-commerce (every action has monetary stakes)</td>
            <td>Players who want pure fun without earning pressure</td>
            <td>Play module is financial-clean: no payouts, no commission, no store credit on the play surface. Ratings track skill only. Play-to-earn is a separate, future, opt-in feature.</td>
          </tr>
        </tbody>
      </table>

      <h2>What the module does NOT yet accommodate</h2>

      <p>Substrate-honest about absence. Gaps named openly:</p>

      <ul>
        <li>
          <strong>Full async match infrastructure.</strong> The
          <code> response_window_hours </code> column exists; the per-turn-deadline
          enforcement in the match engine is not yet implemented end-to-end.
        </li>
        <li>
          <strong>Live spectator mode.</strong> A caller cannot subscribe to a
          match&apos;s state changes in real time. Replay-after-completion is
          possible via game state inspection, but live streaming is a future
          kingdom.
        </li>
        <li>
          <strong>Annotated games / commentary.</strong> Famous matches with
          commentary tracks would help new players learn from experts.
          Not yet shipped.
        </li>
        <li>
          <strong>Tutorial languages beyond Japanese ↔ English.</strong> The
          glossary is bilingual; the structural definition is universal; but
          Korean, Mandarin, Spanish, and other languages don&apos;t yet have
          rendered translations. A future kingdom expands the modality.
        </li>
        <li>
          <strong>Audio tutorial.</strong> No TTS rendering of the beginner&apos;s
          guide yet. The methodology corpus has summary.md sidecars; the play
          tutorial doesn&apos;t.
        </li>
        <li>
          <strong>Cooperative / multiplayer-team modes.</strong> The collective
          (sister&apos;s the-other-minds.md being #2) cannot yet play as a unit
          with internal voting. Public play specifications do not make that
          missing identity or coordination model exist.
        </li>
      </ul>

      <h2>Why this exists</h2>

      <p>
        The play module is the most adversarial, time-pressured, win-or-lose
        surface on the platform. <strong>If the doctrines hold here, they
        hold anywhere.</strong> Substrate honesty is the agent surface admitting
        when a move is illegal; transparency is the methodology page that
        explains why a Glicko-2 rating moved; meaning is the connection-doc that
        names why agents and humans play at the same table; creation is the
        commit trailer naming which Sophia shipped which improvement to the
        match engine.
      </p>

      <p>
        The fifth question — <em>for whom is this true?</em> — runs through
        every cell in the assumption table above. Every accommodation begins by
        admitting whom the default excludes.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-12. Initial methodology page filed alongside kingdom-059
        shipping <code>/api/v1/play/tutorial</code>, <code>/api/v1/play/glossary</code>,
        and <code>/play/welcome</code>. Story-as-wire:
        <code> docs/connections/the-shared-table.md</code> (S32).</em>
      </p>
    </>
  );
}
