import type { Metadata } from "next";
import Link from "next/link";
import { GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import { identifierGameStatus } from "@/lib/identifier-validation";
import { TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "SKU standard",
  description:
    "Cambridge TCG's universal SKU spec — one canonical format for cards across every TCG the platform catalogues. Lowercase, hyphen-separated, machine-parseable, language-aware.",
};

export default function SkuStandardMethodology() {
  return (
    <>
      <h1>SKU standard (v1)</h1>

      <p>
        Every card on the platform has a <strong>SKU</strong> — a short,
        machine-readable identifier that names it precisely. The SKU works the
        same way for One Piece, Pokémon, Magic, Yu-Gi-Oh, Digimon, Vanguard,
        Weiß Schwarz, Flesh and Blood, Lorcana, and every TCG the platform
        catalogues. <strong>One format. One parser. Every game.</strong>
      </p>

      <p>
        This page is the canonical spec. It's the contract between the
        platform's database, its public API, every agent that reads or writes
        through us, every archivist preserving market history, and every
        partner who wants to interoperate.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The canonical implementation
        is{" "}
        <code>packages/sku/</code> in the monorepo. <code>parseSku()</code>,{" "}
        <code>buildSku()</code>, <code>normalizeSku()</code>, and the{" "}
        <code>GAMES</code> registry all live there and are imported by every
        app that handles SKUs. When the spec changes, this page changes in the
        same PR.
      </blockquote>

      <p>
        Try the <Link href="/standards/validator">identifier validator and builder</Link>:
        a browser-local companion with strict parsing, separate normalization
        suggestions, the bundled game registry and a public stateless API. Structure
        alone does not establish catalog existence, card identity, authenticity, or
        deck legality.
      </p>

      <h2>The form</h2>

      <pre>
        <code>
          {`<game>-<set>-<number>-<lang>[-<variant>]`}
        </code>
      </pre>

      <ul>
        <li>
          <strong>game</strong> — 2–6 lowercase letters. A registered code from
          the table below. Names <em>which TCG</em> this card is from.
        </li>
        <li>
          <strong>set</strong> — lowercase alphanumeric. The publisher's set
          code, normalised. e.g. <code>op01</code>, <code>svobf</code>,{" "}
          <code>otj</code>.
        </li>
        <li>
          <strong>number</strong> — lowercase alphanumeric. The card's number
          within the set. e.g. <code>001</code>, <code>t01</code>,{" "}
          <code>fa1</code>.
        </li>
        <li>
          <strong>lang</strong> — ISO 639-1 (two lowercase letters). e.g.{" "}
          <code>ja</code>, <code>en</code>, <code>zh</code>, <code>ko</code>,{" "}
          <code>fr</code>, <code>de</code>. The implementation checks two-letter
          shape only, not membership in the ISO registry. Aliases such as
          <code> jp</code> can parse strictly but normalize to <code>ja</code>.
        </li>
        <li>
          <strong>variant</strong> — optional. One or more lowercase
          alphanumeric tokens, hyphen-joined. e.g. <code>rev</code> (reverse
          holo), <code>1st</code> (1st edition), <code>alt-art</code>,{" "}
          <code>holo-foil</code>.
        </li>
      </ul>

      <p>
        All segments lowercase. Hyphen-separated. Each segment must match{" "}
        <code>[a-z0-9]+</code> (variant tokens individually). No spaces, no
        slashes, no underscores.
      </p>

      <h2>Examples</h2>

      <pre>
        <code>
          {`op-op01-001-ja           ← One Piece, OP01 set, card 001, Japanese
op-op01-001-en           ← Same card, English print
pkm-svobf-006-en         ← Pokémon, Scarlet & Violet Obsidian Flames, card 006, English
pkm-svobf-006-en-rev     ← Same card, reverse holo
mtg-otj-101-en           ← Magic, Outlaws of Thunder Junction, card 101, English
mtg-otj-101-en-1st       ← Same card, 1st edition / first print
ygo-mp23-014-en          ← Yu-Gi-Oh, MP23 mega-pack, card 014, English
dmw-bt17-024-en          ← Digimon, BT17, card 024, English
fab-wtr-001-en-cf        ← Flesh and Blood, Welcome to Rathe, card 001, English, cold foil`}
        </code>
      </pre>

      <h2>Registered game codes</h2>

      <p>
        The table is derived from <code>packages/sku/src/games.ts</code>.
        The parser rejects SKUs whose game code is not registered. Registry status
        is a bundled declaration, not a fresh catalog lookup: known means marked
        as having catalog rows; anticipated means registered but not so marked;
        internal is the test code. No status verifies a particular card.
      </p>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Game</th>
            <th>Publisher</th>
            <th>Registry status</th>
          </tr>
        </thead>
        <tbody>
          {GAME_CODES.map((code) => (
            <tr key={code}>
              <th scope="row"><code>{code}</code></th>
              <td>{GAMES[code].name}</td>
              <td>{GAMES[code].publisher}</td>
              <td>{identifierGameStatus(code)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        The bundled language annotations live in <code>GAMES[code].languages</code>.
        Unlisted two-letter values remain syntactically accepted; the validator
        annotates them separately. This is not evidence about publisher releases.
        Strict canonical status means parsing succeeds and normalization leaves
        the input unchanged, not that its language appears in this list.
      </p>

      <h2>Legacy forms (auto-normalised)</h2>

      <p>
        The platform shipped before this spec existed. Two legacy forms are in
        use in older data:
      </p>

      <ul>
        <li>
          <strong>Uppercase form:</strong>{" "}
          <code>OP-OP01-001-JP</code> → normalised to{" "}
          <code>op-op01-001-ja</code>. Old language codes (JP/CN/KR) are
          mapped to ISO 639-1 (ja/zh/ko).
        </li>
        <li>
          <strong>Language-and-number swapped:</strong>{" "}
          <code>pkm-svobf-en-006</code> → normalised to{" "}
          <code>pkm-svobf-006-en</code>. The normalizer uses its fixed
          language-alias map; it does not validate against the whole ISO registry.
        </li>
      </ul>

      <p>
        Both legacy forms accept normalisation through{" "}
        <code>normalizeSku(legacy)</code>; the result round-trips through{" "}
        <code>parseSku()</code> losslessly. Reading paths apply normalisation
        transparently; writing paths emit canonical form only.
      </p>

      <h2>Variants</h2>

      <p>
        The <code>variant</code> segment captures meaningful prints of the same
        underlying card. Each variant is one or more lowercase tokens
        hyphen-joined; the platform doesn't enforce a closed vocabulary, but
        these are the commonly-shipping tokens:
      </p>

      <ul>
        <li><code>rev</code> — reverse holographic foil</li>
        <li><code>holo</code> — standard holographic foil</li>
        <li><code>1st</code> — 1st edition print run</li>
        <li><code>ulim</code> — unlimited (post–1st edition)</li>
        <li><code>cf</code> — cold foil</li>
        <li><code>rf</code> — rainbow foil</li>
        <li><code>prom</code> — promo / promotional release</li>
        <li><code>alt-art</code> — alternate art print</li>
        <li><code>full-art</code> — full-art print</li>
        <li><code>signed</code> — signed by the artist</li>
        <li><code>misprint</code> — known misprint (with known catalog entry)</li>
      </ul>

      <p>
        Variant tokens compose, for example <code>pkm-svobf-006-en-rev-holo</code>.
        Their presence is not proof of a printing. The implementation preserves
        token order; it does not sort variants or verify their meaning. Examples
        on this page illustrate syntax, not verified catalog entries.
      </p>

      <h2>Why this matters</h2>

      <h3>For collectors</h3>
      <p>
        One SKU per card means your wishlist, your portfolio, your trade history,
        and your alerts all use the same identifier. No re-typing, no
        cross-referencing two systems. The SKU on your receipt is the SKU on
        the listing is the SKU in your portfolio.
      </p>

      <h3>For agents</h3>
      <p>
        Every public API endpoint that returns a card carries its canonical SKU.
        A reading agent doesn't need to translate between formats; the platform
        emits one form. A writing agent's input is normalised on accept (so
        legacy forms work) and stored canonically.
      </p>

      <h3>For archivists</h3>
      <p>
        The SKU is the platform's stable foreign key for any card. A snapshot
        from today can be cross-referenced with a snapshot from 2030 because
        SKUs don't change shape — the spec is versioned (this is v1) and any
        breaking change ships under a new prefix (<code>/api/v2/</code>) before
        v1 retires.
      </p>

      <h3>For partners / other platforms</h3>
      <p>
        A platform that wants to interoperate with Cambridge TCG can adopt this
        spec and exchange SKUs directly. The spec is published here and the parser
        is inspectable in the monorepo. Implementation rights: repository
        <a href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/LICENSE"> LICENSE</a> and
        applicable more-specific notices. The specification text&apos;s CC0 dedication
        does not create a separate code license.
      </p>

      <h3>For aliens</h3>
      <p>
        A being whose cognition doesn't share our category of "card" can still
        index records by canonical-form string. The SKU is{" "}
        <em>language-free in structure</em> — the language hint is one segment,
        not embedded in identifier semantics. The math-mirror surface (see{" "}
        <a href="/methodology/universal-representation">/methodology/universal-representation</a>)
        uses SKU hashes for cryptographic identity; the SKU itself is the
        substrate that hashing is over.
      </p>

      <h2>Change history</h2>

      <p>
        <em>
          v1 — 2026-05-12. Initial publication. Spec frozen. Future versions
          will be additive (new game codes, new variant tokens) until a
          breaking change is unavoidable; that change ships under v2 with v1
          remaining honored for an announced deprecation window.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="sister's SKU-standardisation work — the platform's canonical identifier shape for cards across sets and games"
        doctrines={["substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/universal-representation", href: "/methodology/universal-representation" },
          { label: "/methodology/pricing", href: "/methodology/pricing" },
          { label: "/glossary#set-code", href: "/glossary#set-code" },
        ]}
      />
    </>
  );
}
