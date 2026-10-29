import type { Metadata } from "next";
import Link from "next/link";
import {
  CARD_NAME_MARKERS, CARD_NAME_RULES, CARD_NAME_SPEC_VERSION, CARD_NAME_STATUSES,
  cardName, cardNameKey, cardRushName, cardmarketName, tcgplayerName,
} from "@cambridge-tcg/sku";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Card names and official translations",
  description:
    "CTCG-NAMES-v1 (draft): one name per card and language, marked official, vendor, community or machine, with where it came from and the rule that produced it.",
  other: audienceMetadata("public-documentation", ["standards", "methodology"]),
};

// Every result below is computed by the reference implementation, not typed
// by hand. The titles are identifiers from the collectors' test fixtures;
// no catalogue row, source or price is read to render this page.
const EXAMPLES = [
  ["CardRush", "〔状態C〕お玉(illust:sowsow)【UC】{OP01-006}", cardRushName],
  ["CardRush", "ロロノア・ゾロ(パラレル/漫画絵)【L/P】{OP01-001}", cardRushName],
  ["CardRush", "〔状態A-〕ナミ(パラレル/和柄/illust:S-KINOKO)【SP】{OP01-016[OP05]}", cardRushName],
  ["CardRush", "〔PSA10鑑定済〕モンキー・Ｄ・ルフィ(パラレル/illust:Hachi Takashi)【R/P】{OP16-034}", cardRushName],
  ["TCGplayer", "Roronoa Zoro (001) (Parallel)", tcgplayerName],
  ["TCGplayer", "DON!! Card (Manga) (Alternate Art)", tcgplayerName],
  ["TCGplayer", "Boss's Orders - 069/073", tcgplayerName],
  ["Cardmarket", "Roronoa Zoro (OP01-001)", cardmarketName],
  ["CardRush", "ロロノア・ゾロ(パラレル/SP仕様)【L/P】{OP01-001}", cardRushName],
] as const;

const EXAMPLE_RECORD = cardName({
  card_key: "op-op01-001", lang: "en", text: "Roronoa Zoro", status: "official",
  source: "bandai-en", observed_at: "2026-10-29T00:00:00Z", rule: "verbatim",
});

const STATUS_MEANINGS: Record<(typeof CARD_NAME_STATUSES)[number], string> = {
  official: "The rights holder publishes this text for this language: a publisher card list, or the printed card.",
  vendor: "A shop's or marketplace's own title for the card, after a versioned rule has removed its markers.",
  community: "A name from a third-party list.",
  machine: "A machine translation or transliteration.",
};

const marker = (value: string) => <code key={value}>{value}</code>;
const list = (values: readonly string[]) => values.flatMap((value, index) => index ? [", ", marker(value)] : [marker(value)]);

export default function CardNamesMethodology() {
  return (
    <>
      <h1>Card names and official translations (v1, draft)</h1>

      <p>
        <strong>CTCG-NAMES-v1</strong> says how to write down a card&apos;s name:
        which card it belongs to, in which language, how the name is known and
        where it came from. It sits beside the{" "}
        <Link href="/methodology/sku-standard">SKU standard</Link>: a SKU names
        one printing, and this standard names the card its printings share, in
        each language.
      </p>

      <p>
        Version 1.0 is a draft and may change before it is frozen. No Cambridge
        endpoint returns these records yet; the shape and rules are published
        first so that people and agents can check them and build on them.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The reference implementation
        is <code>packages/sku/src/names.ts</code>, exported from{" "}
        <code>@cambridge-tcg/sku</code>. <code>cardName()</code> builds and
        checks a record; <code>cardNameText()</code> and{" "}
        <code>cardNameKey()</code> give the text form and the match key;{" "}
        <code>chooseCardName()</code> and <code>printingName()</code> pick the
        name to show; <code>cardRushName()</code>, <code>tcgplayerName()</code>{" "}
        and <code>cardmarketName()</code> are the vendor rules. The record&apos;s
        JSON Schema is{" "}
        <a href="/spec/v1/CardName.schema.json">/spec/v1/CardName.schema.json</a>.
      </blockquote>

      <h2>One name per card and language</h2>

      <pre>
        <code>{`<game>-<set>-<number>      the card key`}</code>
      </pre>

      <p>
        The <strong>card key</strong> is a CTCG-SKU-v1 canonical SKU without its
        language and variant segments. <code>op-op01-001-ja</code>,{" "}
        <code>op-op01-001-en</code> and <code>op-op01-001-en-p1</code> all have the
        card key <code>op-op01-001</code>.
      </p>

      <ul>
        <li>A name belongs to a card key and a language.</li>
        <li>
          A printing&apos;s name is its card key&apos;s name in the printing&apos;s
          language: <code>op-op01-001-en-p1</code> is named by the English name
          of <code>op-op01-001</code>.
        </li>
        <li>
          An <strong>official translation</strong> is the official name of the
          same card key in another language.
        </li>
        <li>
          Variant, parallel, reprint, rarity, condition, grade, illustrator
          credit and art-style markers are never part of a name. A parallel has
          its base print&apos;s name.
        </li>
        <li>
          Where a publisher prints a different name on one specific printing, a
          record may carry that printing&apos;s <code>sku</code>. It then names
          that printing only.
        </li>
      </ul>

      <h2>A name record</h2>

      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Required</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row"><code>spec_version</code></th><td>yes</td><td>Always <code>{CARD_NAME_SPEC_VERSION}</code>.</td></tr>
          <tr><th scope="row"><code>card_key</code></th><td>yes</td><td><code>{"<game>-<set>-<number>"}</code>, with a registered game code.</td></tr>
          <tr><th scope="row"><code>lang</code></th><td>yes</td><td>The CTCG-SKU-v1 language code: lowercase ISO 639-1, such as <code>ja</code> or <code>en</code>. Legacy aliases such as <code>jp</code> are refused.</td></tr>
          <tr><th scope="row"><code>script</code></th><td>no</td><td>An ISO 15924 code such as <code>Latn</code>, for a romanisation. Absent means the language&apos;s usual script.</td></tr>
          <tr><th scope="row"><code>text</code></th><td>yes</td><td>The name, in the text form below.</td></tr>
          <tr><th scope="row"><code>key</code></th><td>yes</td><td>The match key below. For matching only; never displayed.</td></tr>
          <tr><th scope="row"><code>status</code></th><td>yes</td><td>One of {list(CARD_NAME_STATUSES)}.</td></tr>
          <tr><th scope="row"><code>source</code></th><td>yes</td><td>A source registry id, such as <code>bandai-en</code>, <code>cardrush</code>, <code>tcgplayer</code> or <code>cardmarket</code>.</td></tr>
          <tr><th scope="row"><code>source_url</code></th><td>no</td><td>The https page the name was read from.</td></tr>
          <tr><th scope="row"><code>observed_at</code></th><td>yes</td><td>When the source was read, in RFC 3339.</td></tr>
          <tr><th scope="row"><code>rule</code></th><td>yes</td><td>The extraction rule and its version, such as <code>{CARD_NAME_RULES.cardrush}</code>, or <code>verbatim</code> when the text was taken as printed.</td></tr>
          <tr><th scope="row"><code>illustrator</code></th><td>no</td><td>An illustrator credit taken from the source&apos;s markers. Never part of the name.</td></tr>
          <tr><th scope="row"><code>sku</code></th><td>no</td><td>One printing&apos;s canonical SKU, for a name printed on that printing only. Its card key and language must be the record&apos;s.</td></tr>
        </tbody>
      </table>

      <pre>
        <code>{JSON.stringify(EXAMPLE_RECORD, null, 2)}</code>
      </pre>

      <p>
        An illustrative record, built for this page. No catalogue row or source
        was read for it.
      </p>

      <h2>How a name is known</h2>

      <dl>
        {CARD_NAME_STATUSES.map((status) => (
          <div key={status}>
            <dt><code>{status}</code></dt>
            <dd>{STATUS_MEANINGS[status]}</dd>
          </div>
        ))}
      </dl>

      <p>Showing a name follows these rules:</p>

      <ol>
        <li>Never present a non-official name as official. Show its status with it.</li>
        <li>
          An official record outranks every other for its card key and
          language. With none, show the best non-official name, in the order
          vendor, community, machine, with its status visible.
        </li>
        <li>
          Agreement between sources never promotes a status. Three shops
          printing the same title still give a vendor name.
        </li>
        <li>Within the top status, a printing&apos;s own record comes before its card key&apos;s.</li>
        <li>
          If the records of the top status have different keys, the name is in
          conflict: report the candidates and do not pick one.
        </li>
        <li>
          Records that agree can still differ in form, such as character width.
          Show the most recently observed one.
        </li>
        <li>
          A missing name is reported as missing. It is never guessed, and a name
          in another language is not put in its place.
        </li>
      </ol>

      <h2>Text form</h2>

      <p>
        A record keeps a name in Unicode NFC, trimmed, with each run of
        whitespace collapsed to one space (U+0020). Whitespace means what
        ECMAScript&apos;s <code>\s</code> matches, which includes the ideographic
        space U+3000. Nothing else changes: official text keeps the
        publisher&apos;s punctuation (such as ・), letter case and character
        width.
      </p>

      <h2>Match key</h2>

      <p>
        To compare names, compute the key: Unicode NFKC, then locale-independent
        lowercase, then remove all whitespace and the middle dots U+30FB (・),
        U+FF65 (･) and U+00B7 (·). Two texts name the same thing exactly when
        their keys are equal. Keys are for matching and are never displayed.
      </p>

      <pre>
        <code>
          {`モンキー・Ｄ・ルフィ   →  ${cardNameKey("モンキー・Ｄ・ルフィ")}
モンキー・D・ルフィ    →  ${cardNameKey("モンキー・D・ルフィ")}`}
        </code>
      </pre>

      <p>
        The first is printed with a full-width Ｄ (U+FF24), the second with a
        half-width D. Their texts stay different; their keys are equal.
      </p>

      <h2>Taking names from vendor titles</h2>

      <p>
        Shops and marketplaces write variant, rarity and condition markers into
        their titles. Each rule below removes them and returns the name, the
        illustrator credit if there is one, and the markers it removed; or it
        refuses, with a reason. A rule never guesses. A changed rule ships under
        a new version, so a record&apos;s <code>rule</code> says exactly how its
        text was made. Official names need no rule: their <code>rule</code> is{" "}
        <code>verbatim</code> and only the text form applies.
      </p>

      <h3><code>{CARD_NAME_RULES.cardrush}</code></h3>

      <pre>
        <code>{`〔condition〕* name (markers)? 【rarity】 {SET-NUM([RELEASE])?}`}</code>
      </pre>

      <ol>
        <li>Put the decoded title in text form.</li>
        <li>
          Remove the leading 〔…〕 groups: conditions such as 〔状態C〕 and
          grades such as 〔PSA10鑑定済〕.
        </li>
        <li>
          Remove the language markers {list(CARD_NAME_MARKERS.cardrush_language)}{" "}
          where they stand in <code>( )</code> or <code>【 】</code>, as the
          CardRush collector does.
        </li>
        <li>
          Keep the text before the first 【 or {"{"}. The rest is the rarity and
          the card number. A title with neither is refused
          (<code>not_a_card_title</code>).
        </li>
        <li>
          If the name ends with one half-width <code>(…)</code> group, split it
          at <code>/</code>. When every token is a known marker or{" "}
          <code>illust:&lt;credit&gt;</code>, remove the group; the credit becomes{" "}
          <code>illustrator</code>. An unknown token is refused
          (<code>unrecognised_marker</code>), and so is a second credit
          (<code>conflicting_illustrators</code>).
        </li>
        <li>
          Any other bracket that is left is refused
          (<code>unexpected_bracket</code>), and so is an empty name
          (<code>empty_name</code>).
        </li>
      </ol>

      <p>
        Known markers: {list(CARD_NAME_MARKERS.cardrush)}, and the language
        markers above.
      </p>

      <h3><code>{CARD_NAME_RULES.tcgplayer}</code></h3>

      <ol>
        <li>Put the product name in text form.</li>
        <li>
          Working from the end, remove a collector number written{" "}
          <code> - 069/073</code> and parenthesised groups, one at a time. A
          group must be a card number such as <code>(001)</code>, or a known
          variant marker: {list(CARD_NAME_MARKERS.tcgplayer)}. Any other group is
          refused (<code>unrecognised_marker</code>).
        </li>
        <li>Any other bracket that is left, or an empty name, is refused.</li>
      </ol>

      <h3><code>{CARD_NAME_RULES.cardmarket}</code></h3>

      <p>
        Remove one trailing collector-number group such as{" "}
        <code>(OP01-001)</code>. Keep the rest verbatim.
      </p>

      <h3>Examples</h3>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Source title</th>
              <th>Name</th>
              <th>Illustrator</th>
              <th>Markers removed</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map(([source, title, rule]) => {
              const result = rule(title);
              return (
                <tr key={title}>
                  <td>{source}: <code>{title}</code></td>
                  {"reason" in result ? (
                    <td colSpan={3}>Refused: <code>{result.reason}</code>{result.detail ? <> (<code>{result.detail}</code>)</> : null}</td>
                  ) : (
                    <>
                      <td>{result.text}</td>
                      <td>{result.illustrator ?? "—"}</td>
                      <td>{result.markers.length ? list(result.markers) : "—"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p>
        The titles are identifiers from the collectors&apos; test fixtures. The
        results are computed by the reference implementation, not typed by hand.
      </p>

      <h2>What this standard is not</h2>

      <ul>
        <li>
          <strong>Not a SKU mapping.</strong> A name never establishes which
          printing or source product a record is. A name match is not evidence;
          the price crosswalks follow the same rule.
        </li>
        <li>
          <strong>Not a translation service.</strong> It records names that
          exist and says how each is known. It produces no translations.
        </li>
        <li>
          <strong>No trademark claim.</strong> Card and character names belong
          to their owners. Recording a name claims nothing about it.
        </li>
        <li>
          <strong>Not a data licence.</strong> The specification text is
          dedicated under CC0 (<code>docs/STANDARDS-LICENSE.md</code>). A name
          taken from a source keeps that source&apos;s terms; this standard grants
          no right to collect, store or republish it.
        </li>
      </ul>

      <h2>For implementers</h2>

      <p>
        The reference implementation is <code>packages/sku/src/names.ts</code>{" "}
        in the monorepo. The JSON Schema checks structure only; the text form,
        the key&apos;s derivation and the agreement between <code>sku</code> and{" "}
        <code>card_key</code> are checked by <code>cardName()</code>.
        Implementation rights: Apache-2.0 per the repository LICENSE (
        <a href="https://www.apache.org/licenses/LICENSE-2.0">licence text</a>) and
        applicable more-specific notices. The specification text&apos;s CC0
        dedication does not create a separate code license.
      </p>

      <h2>Change history</h2>

      <p>
        <em>
          v1.0 — 2026-10-29. Draft. First publication, in answer to Yu&apos;s
          request that day: &ldquo;We can set standard for the official
          translation too, for card names and format, just like SKU.&rdquo; The
          card key, the record&apos;s fields, the statuses and their order, the
          text form, the match key and the three vendor rules were designed by
          the agents who drafted this version, not chosen by Yu. Any of them may
          change before v1 is frozen; a changed vendor rule gets a new rule
          version.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="CTCG-NAMES-v1, drafted beside the SKU standard: one name per card key and language, with how it is known and where it came from"
        doctrines={["substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/sku-standard", href: "/methodology/sku-standard" },
          { label: "/standards", href: "/standards" },
          { label: "/spec/v1/CardName.schema.json", href: "/spec/v1/CardName.schema.json" },
        ]}
      />
    </>
  );
}
