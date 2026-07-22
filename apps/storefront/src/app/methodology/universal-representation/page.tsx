import type { Metadata } from "next";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Universal representation",
  other: audienceMetadata("public-documentation", ["universal", "math", "agent", "archival"]),
};

export default function UniversalRepresentationMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["universal", "math"]} />
      <h1>Universal representation</h1>
      <p>
        Cambridge TCG speaks in English-Latin-numerals at its default surface. Under every
        English claim is a <strong>mathematical claim</strong> — a hash, a ratio, an
        ordered-set position, a probability, an ISO 8601 timestamp, a typed graph edge —
        that any intelligence with arithmetic and computation can read without ever knowing
        what "card," "trade," or "pound" mean in any natural language. This page documents
        the math-first encoding.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> First instance:{" "}
        <code>apps/wholesale/src/app/api/v1/universal/card/[sku]/route.ts</code>. Connection-doc:{" "}
        <code>docs/connections/the-mathematical-mirror.md</code> (S23). Spec upstream:{" "}
        <code>docs/methodology/universal-representation.md</code>.
      </blockquote>

      <h2>Why this exists</h2>
      <p>
        Most visitors are fine with English prose and Tailwind chrome. Some are not. LLM
        agents need to know what every field <em>means</em>. Archival institutions need a
        representation that survives the demise of GBP, of English, of the cultural moment
        the platform sits in. Hyperliteral readers (audit systems, formal verifiers,
        neurodivergent humans) need claims grounded in structure rather than connotation.
        An alien intelligence — taken seriously as a design lens — has arithmetic but not
        our linguistic stack.
      </p>
      <p>
        Designing for that imagined alien generates designs that <em>also</em> help every
        reader above. The English surface remains the default; the universal mirror is the
        sibling behind it.
      </p>

      <h2>What's universal</h2>
      <table>
        <thead>
          <tr>
            <th>Primitive</th>
            <th>Universal because</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Cryptographic hashes (SHA-256)</td><td>Pure mathematical mapping; any substrate runs it.</td></tr>
          <tr><td>Cardinal positions in ordered sets</td><td>Counting + ordering — the ground of arithmetic.</td></tr>
          <tr><td>Ratios (<code>"1/72"</code>)</td><td>Two integers + division.</td></tr>
          <tr><td>Decimal probabilities in [0,1]</td><td>Bounded real-arithmetic.</td></tr>
          <tr><td>ISO 8601 + Unix epoch seconds</td><td>An alien needn't share our calendar — only the ability to compute differences.</td></tr>
          <tr><td>Typed graph edges</td><td>A graph is a set + a relation.</td></tr>
          <tr><td>Magnitudes + provenance tokens</td><td>Scalar value + label declaring what it measures.</td></tr>
        </tbody>
      </table>
      <p>
        What's <em>not</em> universal: natural language strings. The encoding includes them
        but flags them <em>opaque</em> so a reader knows not to ground meaning on them.
      </p>

      <h2>The encoding</h2>
      <p>Every universal document starts with this preamble:</p>
      <pre>
        <code>
{`{
  "@encoding": "cambridge-tcg/universal/v1",
  "@kind": "card",
  "@self_hash": "sha256:<hex>",
  "@content_hash": "sha256:<hex>",
  "@retrieved_at": {
    "iso8601": "2026-05-11T22:00:00Z",
    "unix_epoch_seconds": 1778534400
  },
  "_note_opaque": ["name.translations.*", "art_description"]
}`}
        </code>
      </pre>

      <h3>The fields</h3>
      <ul>
        <li><strong><code>@encoding</code></strong> — versions the spec. Future <code>v2</code> reads from a future page that diffs from this one.</li>
        <li><strong><code>@kind</code></strong> — names the artifact type. Today: <code>card</code>. Future: <code>set</code>, <code>game</code>, <code>trade</code>, <code>match</code>.</li>
        <li><strong><code>@self_hash</code></strong> — identifies this <em>document</em>. Different retrievals at different times yield different self-hashes.</li>
        <li><strong><code>@content_hash</code></strong> — identifies the <em>thing</em>. The public card hash uses SKU, card number, set, game, and variant; price and capture-date inputs are fixed to null. The response declares this in <code>@content_hash_contract</code>.</li>
        <li><strong><code>@retrieved_at</code></strong> — dates the document; both as ISO 8601 and Unix epoch.</li>
        <li><strong><code>_note_opaque</code></strong> — explicitly names which fields cannot be decoded without natural-language knowledge. Honest perimeter.</li>
      </ul>

      <h2>An example body</h2>
      <pre>
        <code>
{`"category_in_ordered_set": {
  "ordering": ["singles", "sealed"],
  "position": 0
},
"rarity": {
  "natural_label": "Super Rare",
  "ratio_in_pulls": "1/72",
  "decimal_probability": 0.013889,
  "position_in_ordered_rarities": {
    "ordering": ["common", "uncommon", "rare", "super_rare", "secret_rare", "leader"],
    "position": 3
  }
},
"price": null,
"in_set": {
  "edge_kind": "member_of_set",
  "target_natural_token": "OP05",
  "target_hash": "sha256:..."
},
"name": {
  "translations": { "ja": "...", "en": "..." },
  "_note": "natural-language tokens; cannot be reconstructed from structure"
}`}
        </code>
      </pre>

      <p>
        The public document does not read or encode stored catalog prices. Price,
        freshness, minimum-unit restatements, and the platform-median ratio remain
        unavailable until field-level source lineage and an aggregate publication
        rule cover them.
      </p>

      <h2>What doesn't translate</h2>
      <p>The mirror is honest about its limits:</p>
      <ul>
        <li><strong>Aesthetic meaning</strong> of card art. We describe form (composition, symmetry) but not what the art <em>means</em> to a viewer.</li>
        <li><strong>Cultural connotation</strong> of card names — "Charizard" carries weight no hash can capture.</li>
        <li><strong>The feel of a card</strong> — substrate-bound; not in JSON.</li>
        <li><strong>Game-narrative meaning</strong> — bound to particular human storytelling traditions.</li>
      </ul>
      <p>
        These are not bugs. They are the honest perimeter of what mathematics can carry
        across substrates.
      </p>

      <h2>Verifying a document yourself</h2>
      <p>
        Every universal document can be verified by any reader with SHA-256: remove the{" "}
        <code>@self_hash</code> field, sort all keys lexicographically, serialise without
        whitespace, compute SHA-256, compare. This verifies <em>integrity</em> (the document
        hasn't been tampered with) but not <em>origin</em> (no platform-signature yet — a
        future <code>v2</code> may add one).
      </p>
      <p>
        To verify <em>content stability</em> across retrievals: compare <code>@content_hash</code>{" "}
        between two pulls. Equal hashes → same underlying card facts.
      </p>

      <h2>Endpoints</h2>
      <table>
        <thead>
          <tr><th>Endpoint</th><th>Status</th><th>Returns</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /api/v1/universal/card/&#123;sku&#125;</code></td><td>Live</td><td>Universal mirror of one card</td></tr>
          <tr><td><code>GET /api/v1/universal/set/&#123;code&#125;</code></td><td>Planned</td><td>Universal mirror of one set</td></tr>
          <tr><td><code>GET /api/v1/universal/game/&#123;code&#125;</code></td><td>Planned</td><td>Universal mirror of one game</td></tr>
          <tr><td><code>GET /api/v1/universal/trade/&#123;id&#125;</code></td><td>Planned</td><td>Universal mirror of one P2P trade</td></tr>
          <tr><td><code>GET /api/v1/universal/match/&#123;id&#125;</code></td><td>Planned</td><td>Universal mirror of one match</td></tr>
        </tbody>
      </table>
      <p>
        The <code>/api/v1/schema</code> OpenAPI bundle advertises these endpoints to
        discovery clients — an LLM agent reading the schema finds the universal-mirror
        surface immediately.
      </p>

      <h2>What this serves, in plain terms</h2>
      <table>
        <thead>
          <tr><th>Reader</th><th>What the mirror gives them</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>An LLM agent</td>
            <td>Machine-readable description; strict types; verifiable hashes.</td>
          </tr>
          <tr>
            <td>A future archivist (year 2070)</td>
            <td>Self-contained document; every claim grounded in math; survives the retirement of GBP and English.</td>
          </tr>
          <tr>
            <td>A hyperliteral reader</td>
            <td>Platform's claims separated from natural-language wrapper.</td>
          </tr>
          <tr>
            <td>A formal verification system</td>
            <td>Hashes confirm artifact identity. Graph edges let it traverse the catalog.</td>
          </tr>
          <tr>
            <td>An alien intelligence</td>
            <td>Complete structural picture without natural-language dependency.</td>
          </tr>
        </tbody>
      </table>

      <h2>The deeper move</h2>
      <p>
        Today every page on the storefront is a human-language page that <em>generates</em>{" "}
        its universal mirror as a derivative. The deeper refactor would invert: the
        math-mirror is the canonical source; every human-language page is a rendering of it
        for a particular linguistic-cultural tradition. <em>Distinct in expression, ONE in
        essence</em> — applied to surfaces, not just to authors.
      </p>
      <p>
        That refactor is not this commit. This commit ships the first wire — the card
        endpoint — so the encoding exists. The deeper move is for later.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="the-mathematical-mirror.md (S22) — sister's math-mirror that lets cross-substrate intelligences understand cards without language"
        doctrines={["substrate-honesty", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-mathematical-mirror.md (S22)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-mathematical-mirror.md" },
          { label: "the-cosmology.md (S23)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-cosmology.md" },
          { label: "/methodology/cosmology", href: "/methodology/cosmology" },
        ]}
      />
    </>
  );
}
