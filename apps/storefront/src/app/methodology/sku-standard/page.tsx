import type { Metadata } from "next";
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
          <code>fr</code>, <code>de</code>.
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
        Every TCG the platform catalogues has a registered code. New games are
        added by editing <code>packages/sku/src/games.ts</code>; the platform
        rejects SKUs whose game code isn't registered.
      </p>

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Game</th>
            <th>Publisher</th>
            <th>Set-code hint</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>op</code></td>  <td>One Piece TCG</td>        <td>Bandai</td>      <td><code>op&lt;NN&gt;</code> (op01, op08…)</td></tr>
          <tr><td><code>pkm</code></td> <td>Pokémon TCG</td>          <td>TPCi</td>        <td>publisher abbreviation</td></tr>
          <tr><td><code>mtg</code></td> <td>Magic: The Gathering</td> <td>Wizards</td>     <td>3-letter (otj, lci, woe)</td></tr>
          <tr><td><code>ygo</code></td> <td>Yu-Gi-Oh!</td>            <td>Konami</td>      <td>MP/POTE/RA series</td></tr>
          <tr><td><code>dbs</code></td> <td>Dragon Ball Super CCG</td><td>Bandai</td>      <td>bt/sd numbered</td></tr>
          <tr><td><code>dbf</code></td> <td>Dragon Ball Super FW</td> <td>Bandai</td>      <td>fb&lt;NN&gt;</td></tr>
          <tr><td><code>wei</code></td> <td>Weiß Schwarz</td>         <td>Bushiroad</td>   <td>series abbreviation</td></tr>
          <tr><td><code>vng</code></td> <td>Cardfight!! Vanguard</td> <td>Bushiroad</td>   <td>d-bt / v-bt / g-bt</td></tr>
          <tr><td><code>dmw</code></td> <td>Digimon Card Game</td>    <td>Bandai</td>      <td>bt&lt;NN&gt; / ex&lt;NN&gt;</td></tr>
          <tr><td><code>bsr</code></td> <td>Battle Spirits Saga</td>  <td>Bandai</td>      <td>bs&lt;NN&gt;</td></tr>
          <tr><td><code>lcg</code></td> <td>Living Card Game</td>     <td>various</td>    <td>publisher-specific umbrella</td></tr>
          <tr><td><code>fab</code></td> <td>Flesh and Blood</td>      <td>LSS</td>        <td>3–4 letter (wtr, mon, ele)</td></tr>
          <tr><td><code>lgr</code></td> <td>Disney Lorcana</td>       <td>Ravensburger</td><td>set&lt;NN&gt; / numbered</td></tr>
          <tr><td><code>tst</code></td> <td>Test</td>                 <td>(internal)</td> <td>any</td></tr>
        </tbody>
      </table>

      <p>
        Languages accepted per game are listed in <code>GAMES[code].languages</code>.
        SKUs in non-listed languages are accepted but flagged as non-canonical
        (the publisher hasn't shipped that language).
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
          <code>pkm-svobf-006-en</code>. The parser disambiguates by
          recognising ISO 639-1 codes.
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
        Variants compose: <code>pkm-svobf-006-en-rev-holo</code> means reverse
        holographic. Order is lexicographic when multiple non-overlapping
        variants apply, for canonical equality.
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
        spec and exchange SKUs directly. The spec is published here, the parser
        is open source (MIT-licensed component within the monorepo), and the
        game-code registry is small enough to mirror.
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
