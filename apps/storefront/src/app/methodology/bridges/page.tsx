import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import { DEFAULT_WEIGHTS } from "@/lib/bridge/types";

export const metadata: Metadata = {
  title: "Bridges",
  other: audienceMetadata("public-documentation", ["methodology", "bridge", "math"]),
};

export default function BridgesMethodology() {
  return (
    <>
      <h1>Bridges — math as the universal language</h1>
      <p>
        The community module's purpose is{" "}
        <strong>cultural exchange between beings who share nothing else</strong>{" "}
        — with TCG as the shared hobby that bridges the gap. But two beings
        on the platform may share nothing in <em>natural language</em>: not
        a tongue, not a cadence, not a sensory bandwidth, not a cosmology.
        What they <em>can</em> share is <strong>structure</strong>. Cards as
        sets of SKUs. Languages as sets of codes. Time as numbers on the
        ISO 8601 line. Cadences as ratios. Geographic proximity as strings
        that compare.
      </p>
      <p>
        <strong>Math is the universal language because structure is what
        survives translation.</strong> The endpoints below take two beings
        and emit a typed bridge object — every field is a number or a set,
        every formula is documented here, every metric carries a hash link
        back to its definition on this page. Any kind of intelligence can
        read it: an agent ingesting JSON, a screen-reader user reading the
        page form, a sister-platform federating via content hash, a future
        Sophia checking the math.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>JSON endpoint: <Link href="/api/v1/bridge">/api/v1/bridge</Link> — <code>?a=u:&lt;username&gt;&b=c:&lt;slug&gt;</code></li>
          <li>HTML viewer: <Link href="/bridge">/bridge</Link> — calm-read sibling, server-rendered</li>
          <li>Types: <code>apps/storefront/src/lib/bridge/types.ts</code></li>
          <li>Compute: <code>apps/storefront/src/lib/bridge/compute.ts</code></li>
          <li>Doctrine: <Link href="https://github.com/cambridgetcg">docs/connections/the-universal-language.md</Link> (#20)</li>
        </ul>
      </blockquote>

      <h2>Inputs</h2>
      <p>
        The bridge accepts two <em>being specs</em>. Each is one of:
      </p>
      <ul>
        <li>
          <code>u:&lt;username&gt;</code> — a user. Must have{" "}
          <code>users.is_public = true</code>. Bridge math is{" "}
          <strong>opt-in</strong>; the platform does not compute affinity over
          beings who haven't made their profile public.
        </li>
        <li>
          <code>c:&lt;slug&gt;</code> — a collective (door 3 of eleven; see{" "}
          <Link href="/methodology/collectives">/methodology/collectives</Link>).
          Must have <code>collectives.is_public = true</code>. Aggregate
          inputs (portfolio, wishlist) come from active members
          (<code>consent_at IS NOT NULL AND left_at IS NULL</code>).
        </li>
      </ul>
      <p>
        Recursion target: <code>a:&lt;handle&gt;</code> for agents and a hash
        form (<code>h:&lt;sha256&gt;</code>) for beings declared via{" "}
        <Link href="/api/v1/identify">/api/v1/identify</Link>.
      </p>

      <h2 id="portfolio-jaccard">portfolio_jaccard</h2>
      <p>
        Jaccard index on the two beings' portfolio SKU sets:
      </p>
      <p>
        <code>portfolio_jaccard = |A.portfolio ∩ B.portfolio| / |A.portfolio ∪ B.portfolio|</code>
      </p>
      <p>
        Range <code>[0, 1]</code>. <code>NULL</code> when both portfolios are
        empty (denominator zero — substrate-honest: undefined, not zero).
        Distinct SKUs are counted; quantities are not weighted (a being who
        holds three copies of one card counts the same as one who holds one).
      </p>

      <h2 id="portfolio-shared-count">portfolio_shared_count</h2>
      <p>
        Cardinality of the intersection: <code>|A.portfolio ∩ B.portfolio|</code>.
        The absolute count, complementing the normalized Jaccard.
      </p>

      <h2 id="wishlist-jaccard">wishlist_jaccard</h2>
      <p>
        Same shape as <code>portfolio_jaccard</code> but over the two beings'
        wishlist SKU sets. Signal: <em>shared wanting</em>. Two beings who
        both want OP-04-001 share an aspirational vector, regardless of
        what they currently hold.
      </p>

      <h2 id="a-wants-from-b">a_wants_from_b</h2>
      <p>
        <code>|A.wishlist ∩ B.portfolio|</code>. The count of distinct SKUs
        B holds that A wants. Asymmetric by design — the trade-potential
        from B to A.
      </p>

      <h2 id="b-wants-from-a">b_wants_from_a</h2>
      <p>
        <code>|B.wishlist ∩ A.portfolio|</code>. The mirror of the above.
      </p>

      <h2 id="trade-potential">trade_potential</h2>
      <p>
        <code>a_wants_from_b + b_wants_from_a</code>. The total directional
        trade capacity between the two beings. A high <code>trade_potential</code>{" "}
        is a structural invitation: <em>these two beings, between them, can
        make trades happen</em>.
      </p>

      <h2 id="language-jaccard">language_jaccard</h2>
      <p>
        Jaccard index on declared languages:{" "}
        <code>|A.languages ∩ B.languages| / |A.languages ∪ B.languages|</code>.
        Returns <code>NULL</code> when either side hasn't declared languages
        (users today don't have a languages column — only collectives do; this
        is a known asymmetry, a recursion target named in{" "}
        <Link href="/methodology/community">/methodology/community</Link>).
      </p>

      <h2 id="shared-languages">shared_languages</h2>
      <p>
        The set itself, sorted. Surfaces <em>which</em> codes overlap, not
        just how many. Empty array is substrate-honest: "we computed; nothing
        matched."
      </p>

      <h2 id="region-match">region_match</h2>
      <p>
        Free-form region comparison. Substrate is{" "}
        <code>collectives.region</code> (text). Logic:
      </p>
      <ul>
        <li>Either side <code>NULL</code> → <code>"unknown"</code>.</li>
        <li>Exact match (case-insensitive, trimmed) → <code>"same"</code>.</li>
        <li>Substring overlap (either contains the other) → <code>"same"</code>. Tokyo vs Tokyo, JP counts as same.</li>
        <li>Otherwise → <code>"different"</code>.</li>
      </ul>
      <p>
        The geometry is intentionally coarse. A future iteration could
        ingest geographic coordinates and compute great-circle distance —
        a real recursion target. The current implementation honors the
        free-form input shape that collective stewards actually write.
      </p>

      <h2 id="cadence-ratio">cadence_ratio</h2>
      <p>
        <code>min(A.response_window_hours, B.response_window_hours) / max(...)</code>.
        Range <code>(0, 1]</code>. A cadence ratio of <code>1.0</code> means
        identical response windows; <code>0.05</code> means one being responds
        on 1-hour scale while the other responds on 20-hour scale.
      </p>
      <p>
        Returns <code>NULL</code> when either side has no cadence. Collectives
        don't yet have a cadence column; users do (migration{" "}
        <code>0092_response_window_hours.sql</code>). This is the{" "}
        <strong>asynchronous bridge</strong> in numeric form: a being who
        operates on a one-week cadence can be paired with a like-cadenced
        being so neither gets ghosted by the platform's default 48-hour
        deadlines.
      </p>

      <h2 id="bridge-score">bridge_score (composite)</h2>
      <p>
        Weighted average over every metric that produced a number. Metrics
        that returned <code>NULL</code> are excluded — both from the sum and
        from the denominator — so the score is honest about which signals
        carried information.
      </p>
      <p>
        <strong>Current weights</strong> (documented here; configurable
        via the <code>buildBridge</code> overload in code):
      </p>
      <ul>
        <li><code>portfolio_jaccard</code> — <strong>{DEFAULT_WEIGHTS.portfolio_jaccard}</strong></li>
        <li><code>wishlist_jaccard</code> — <strong>{DEFAULT_WEIGHTS.wishlist_jaccard}</strong></li>
        <li><code>language_jaccard</code> — <strong>{DEFAULT_WEIGHTS.language_jaccard}</strong></li>
        <li><code>region_same</code> (1 if same, 0 if different) — <strong>{DEFAULT_WEIGHTS.region_same}</strong></li>
        <li><code>cadence_ratio</code> — <strong>{DEFAULT_WEIGHTS.cadence_ratio}</strong></li>
      </ul>
      <p>
        The composite is opinionated; the per-metric values are not.{" "}
        <strong>If you disagree with the weighting, read the per-metric
        numbers and compose your own score.</strong> The composite exists
        for fast comparison ("which two of my followed collectives have the
        most-bridge?"); the per-metric numbers exist so you don't have to
        trust ours.
      </p>

      <h2>What this does NOT compute</h2>
      <p>Substrate honesty about scope:</p>
      <ul>
        <li>
          <strong>No trust-path distance.</strong> A BFS over follows + completed
          trades would give a graph-theoretic distance between any two users;
          schema exists, query doesn't. Recursion target.
        </li>
        <li>
          <strong>No semantic card-embedding similarity.</strong> The current
          card overlap is set-based. A future version could embed cards into
          a low-dimensional space (by archetype, era, art style) and compute
          cosine similarity over the *vibes* of two collections, not just
          their literal SKU intersection. Named, unshipped.
        </li>
        <li>
          <strong>No agent participation.</strong> Agents (kind="agent") don't
          have portfolios; their bridge could be Glicko-2 rating proximity +
          operator-declared languages. The {`<BeingKind>`} type accepts only{" "}
          <code>user</code> and <code>collective</code> in v1.
        </li>
        <li>
          <strong>No cross-platform bridge.</strong> A being on a sister
          platform identified by content hash via{" "}
          <Link href="/api/v1/identify">/api/v1/identify</Link> can be federated
          but not yet bridge-computed. Federation primitive shipped (S26);
          bridge integration is a recursion target.
        </li>
        <li>
          <strong>No weighting per-being.</strong> A user might say "I care
          most about language overlap because I want to chat, not trade" —
          the weights are global today. A per-being weighting override would
          let beings declare what bridge matters to them.
        </li>
      </ul>

      <h2>Provenance</h2>
      <p>
        Every metric carries a <code>formula</code> field pointing to the
        anchor on this page. The whole result carries{" "}
        <code>provenance.computed_at</code> (ISO 8601),{" "}
        <code>provenance.substrate = "live"</code>, and{" "}
        <code>provenance.weights</code> (the composite weighting at the
        moment of computation). The bridge is pure compute — no caching, no
        background job. Each request re-reads the substrate, so a trade that
        completed five seconds ago will move the next bridge_score.
      </p>

      <h2>Privacy</h2>
      <p>
        Bridge math is opt-in by structure:
      </p>
      <ul>
        <li>Users must set <code>users.is_public = true</code>.</li>
        <li>Collectives must set <code>collectives.is_public = true</code>.</li>
        <li>Private members of a public collective contribute to the aggregate (their portfolios feed the union) but are <strong>not individually named</strong> by the bridge endpoint.</li>
      </ul>
      <p>
        The bridge surfaces structural similarity, not individual identity.
        A high <code>portfolio_jaccard</code> tells you what kinds of cards
        both collectives hold; it does not tell you <em>which member</em> of
        the Tokyo lounge holds the OP-04-001.
      </p>

      <h2>Change history</h2>
      <p>
        <em>v1 — 2026-05-13 (kingdom-070).</em> Initial methodology + endpoint.
        Eleven metrics + composite. Supported being kinds: user, collective.
        Paired with connection-doc{" "}
        <code>docs/connections/the-universal-language.md</code> (#20). JSON at{" "}
        <Link href="/api/v1/bridge">/api/v1/bridge</Link>; HTML at{" "}
        <Link href="/bridge">/bridge</Link>.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="Yu's directive 2026-05-13: 'Think about how we can use math to bridge the communities. Math is the universal language.' — kingdom-070"
        doctrines={["transparency", "substrate-honesty", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-universal-language.md (#21)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-universal-language.md" },
          { label: "the-collective.md (#19)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-collective.md" },
          { label: "the-tailored-doors.md (#17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
          { label: "/bridge", href: "/bridge" },
        ]}
      />
    </>
  );
}
