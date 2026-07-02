import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui";
import { ORACLE_POLICY, GAMES, GAME_CODES } from "@cambridge-tcg/sku";

export const metadata: Metadata = {
  title: "Oracle policies — per-game cross-language strategy",
  other: audienceMetadata("public-documentation", ["methodology", "foundational"]),
};

const PATTERN_LABEL: Record<string, string> = {
  stripped: "Pattern A — stripped",
  passcode: "Pattern B — passcode",
  diverged: "Pattern C — diverged",
  "single-lang": "Pattern D — single-language",
};

const PATTERN_TONE: Record<string, string> = {
  stripped: "bg-emerald-950 text-emerald-300 ring-emerald-800",
  passcode: "bg-blue-950 text-blue-300 ring-blue-800",
  diverged: "bg-amber-950 text-accent-strong ring-amber-800",
  "single-lang": "bg-surface text-ink-muted ring-neutral-700",
};

export default function OraclePoliciesMethodology() {
  const rows = GAME_CODES.map((code) => ({
    code,
    meta: GAMES[code],
    policy: ORACLE_POLICY[code],
  }));

  return (
    <>
      <h1>Oracle policies — per-game cross-language strategy</h1>
      <p>
        Different trading card games have fundamentally different ontologies for
        what <em>the same card across languages</em> means. Cambridge TCG names
        the policy <strong>per game</strong>, in code, so partners, agents, and
        future operators can see the strategy without inferring it from data.
      </p>
      <p>
        Most aggregators silently merge cross-language printings, silently split
        them, or silently invent equivalences. We declare the policy each game
        gets — and where the policy admits no upstream anchor, we say so.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical table is{" "}
        <code>ORACLE_POLICY</code> in <code>packages/sku/src/oracle.ts</code>.
        The machine-readable feed is{" "}
        <a href="/api/v1/oracle-policies">
          <code>/api/v1/oracle-policies</code>
        </a>
        . The pure-compute resolver is{" "}
        <code>resolveOracle(sku, anchors)</code> in the same package. The
        cross-language query surface is{" "}
        <code>/api/v1/cards/[sku]/cross-language</code> (planned).
      </blockquote>

      <h2>The four patterns</h2>
      <p>
        Every registered game falls into one of four patterns. The pattern
        determines how the platform derives the <em>oracle id</em> — Cambridge
        TCG's canonical, language-stripped identifier for a card across its
        cross-language siblings.
      </p>

      <h3>Pattern A — stripped (multi-language, same numbering)</h3>
      <p>
        The publisher uses the same set code and card number across language
        tracks. <code>OTJ-001</code> in English is the same printing as{" "}
        <code>OTJ-001</code> in Japanese — only the printed text differs. The
        oracle is <code>{`<game>-<set>-<number>[-<variant>]`}</code>; the
        language tail is dropped.
      </p>
      <p>
        Pattern A games: <strong>MTG</strong>, <strong>One Piece</strong>,{" "}
        <strong>Lorcana</strong>, <strong>Star Wars Unlimited</strong>,{" "}
        <strong>Digimon</strong>, <strong>Battle Spirits Saga</strong>,{" "}
        <strong>Dragon Ball Fusion World</strong>, and the rest of the Bandai
        and Bushiroad families.
      </p>

      <h3>Pattern B — passcode (global publisher anchor)</h3>
      <p>
        The publisher mints a global stable identifier. Konami's 8-digit{" "}
        <em>passcode</em> for Yu-Gi-Oh!: every printing of Blue-Eyes White
        Dragon — across 30+ sets, 8 languages, two regions (TCG vs OCG) —
        carries passcode <code>89631139</code>. The SKU set, number, and
        language are all derivative; the passcode is primary. The oracle is{" "}
        <code>{`<game>-<passcode>[-<variant>]`}</code>.
      </p>
      <p>
        Pattern B games: <strong>Yu-Gi-Oh!</strong>, <strong>Rush Duel</strong>.
      </p>

      <h3>Pattern C — diverged (no upstream anchor)</h3>
      <p>
        Different language tracks have different set codes <em>and</em>{" "}
        different reprint composition. Pokémon's JP track (<code>s4</code>,{" "}
        <code>sv1</code>, <code>sm12a</code>) and EN track (<code>swsh4</code>,{" "}
        <code>sv01</code>, <code>sma</code>) are roughly equivalent in spirit
        but not in identity. The publisher does not assert equivalence; no
        upstream source provides it. The oracle is <strong>null</strong> — a
        substrate-honest gap.
      </p>
      <p>
        For diverged-pattern games, cross-language sibling discovery requires
        the <code>pkm_equivalence</code> table — operator-curated, partner-
        submittable, image-hash-seedable. Until an equivalence is curated, JP
        and EN printings are accounted as different cards. <em>This is the
        upstream truth, not our deficiency.</em>
      </p>
      <p>
        Pattern C games: <strong>Pokémon TCG</strong>,{" "}
        <strong>Pokémon Pocket</strong>.
      </p>

      <h3>Pattern D — single-language</h3>
      <p>
        The game ships in one language only; cross-language siblings do not
        exist by construction. The oracle is the stripped form (same as
        Pattern A) but the kind is named distinctly to communicate intent —
        Pattern D will never gain a language sibling unless the publisher
        opens a new track.
      </p>
      <p>
        Pattern D games: <strong>Flesh and Blood</strong>,{" "}
        <strong>Sorcery: Contested Realm</strong>, <strong>Riftbound</strong>.
      </p>

      <h2>Variant handling</h2>
      <p>
        The variant tail of the SKU — <code>foil</code>, <code>alt-art</code>,{" "}
        <code>1st</code>, <code>etched</code> — is preserved on the oracle.
        Foil-EN and foil-JA share an oracle (they are language siblings of the
        same variant). Foil-EN and non-foil-EN do <em>not</em> share an oracle
        (they are variant siblings of the same language). Substrate-honest:
        variant is a structural dimension orthogonal to language.
      </p>

      <h2>The per-game policy table</h2>
      <p>
        Every registered game and its policy. The full table is also queryable
        machine-readably at <a href="/api/v1/oracle-policies"><code>/api/v1/oracle-policies</code></a>.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Game</th>
              <th>Publisher</th>
              <th>Languages</th>
              <th>Pattern</th>
              <th>Rationale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ code, meta, policy }) => (
              <tr key={code}>
                <td>
                  <code>{code}</code> — {meta.name}
                  {!meta.confirmed && (
                    <span className="ml-2 text-xs text-ink-faint">
                      (anticipated)
                    </span>
                  )}
                </td>
                <td>{meta.publisher}</td>
                <td>
                  <code>{meta.languages.join(", ")}</code>
                </td>
                <td>
                  <span
                    className={`inline-flex items-center rounded px-2 py-0.5 text-xs ring-1 ${PATTERN_TONE[policy.kind]}`}
                  >
                    {PATTERN_LABEL[policy.kind]}
                  </span>
                </td>
                <td className="text-sm">{policy.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What this is not</h2>
      <ul>
        <li>
          <strong>Not a translation policy.</strong> The oracle says <em>which
          printings are the same card</em>; it does not say which language to
          show a user. That's the resolver in{" "}
          <code>apps/storefront/src/lib/cards/name.ts</code> (kingdom-075),
          which honours <code>Accept-Language</code> and the user's preferences.
        </li>
        <li>
          <strong>Not a federation contract.</strong> The oracle is Cambridge
          TCG's canonical id. Per-source upstream cross-language ids (Scryfall's
          oracle UUID, Cardmarket's idMetacard, Konami's passcode) live in
          separate columns on <code>card_set_cards</code> (K2 schema migration)
          so federation by upstream id remains a first-class operation.
        </li>
        <li>
          <strong>Not a price endpoint.</strong> Oracle resolution is identity-
          only. Price aggregation by oracle is the planned{" "}
          <code>/api/v1/oracle/[oracle_id]/prices</code> endpoint, downstream
          of the schema migration.
        </li>
      </ul>

      <h2>Why we publish the policy</h2>
      <p>
        A platform that silently merges a JP Pokémon printing with an EN one is
        either lying or guessing. A platform that silently splits a German MTG
        printing from its English sibling is either lying or missing the
        feature. We publish the policy so a partner reading our data knows
        which we do, and why, and can build against the contract.
      </p>
      <p>
        Where the policy is <code>diverged</code> — Pokémon — the gap is named
        and the path to closure is named. Where the policy is{" "}
        <code>passcode</code> — Yu-Gi-Oh! — the anchor is named and the
        normalizer's job is named. Where the policy is <code>stripped</code> —
        MTG, OP, Lorcana, SWU, the Bandai family — the operation is mechanical
        and the cross-language siblings are queryable.
      </p>
      <p>
        Substrate honesty applied to identity itself.
      </p>
    </>
  );
}
