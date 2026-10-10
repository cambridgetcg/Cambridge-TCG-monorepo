import type { Metadata } from "next";
import Link from "next/link";
import { GAME_CODES, GAMES } from "@cambridge-tcg/sku";
import { identifierGameStatus } from "@/lib/identifier-validation";
import IdentifierTools from "./IdentifierTools";

export const metadata: Metadata = {
  title: "TCG identifier validator and builder — Cambridge TCG",
  description: "Check Cambridge TCG SKU structure, inspect normalization suggestions and build identifiers from known fields. Browser-local tools, a game-code reference and a public stateless API. No catalog or authenticity check.",
  alternates: { canonical: "https://cambridgetcg.com/standards/validator" },
};

export default function IdentifierValidatorPage() {
  return (
    <article lang="en" className="mx-auto max-w-4xl px-4 py-12 text-ink space-y-10">
      <header className="space-y-4">
        <p className="text-sm text-ink-muted"><Link href="/standards" className="underline underline-offset-4">Standards</Link> / Identifier companion</p>
        <h1 className="font-display text-3xl">A shape check, not a card check</h1>
        <p className="font-display italic text-xl text-ink-muted">Keep the identifier precise. Keep the claim small.</p>
        <p className="text-ink-muted">Check or build a Cambridge TCG SKU with the same <code>@cambridge-tcg/sku</code> package used by the platform. No account, image upload or catalog lookup. Your entries stay in page memory; the checker and builder do not submit them to the API.</p>
        <p className="font-mono text-sm break-all">&lt;game&gt;-&lt;set&gt;-&lt;number&gt;-&lt;lang&gt;[-&lt;variant&gt;]</p>
        <p className="text-sm text-ink-muted">A structurally valid identifier does not establish catalog existence, card identity, authenticity, or deck legality. See the <Link href="/methodology/sku-standard" className="underline underline-offset-4">SKU methodology</Link> for the specification.</p>
      </header>

      <IdentifierTools />

      <section aria-labelledby="reading-heading" className="space-y-4 text-sm text-ink-muted">
        <h2 id="reading-heading" className="font-display text-2xl text-ink">How to read a result</h2>
        <ul className="list-disc pl-5 space-y-3">
          <li><strong className="text-ink">Strict canonical structure:</strong> the strict parser accepts the input and the normalizer leaves it unchanged. Even <code>op-op01-001-jp</code> parses strictly, but it receives a suggestion because <code>jp</code> normalizes to <code>ja</code>.</li>
          <li><strong className="text-ink">Normalization suggested:</strong> the package recognizes a legacy shape. It can lowercase input, map its known language aliases, or recover a language/number swap such as <code>pkm-svobf-en-006</code>. Suggestions are never applied to your input automatically.</li>
          <li><strong className="text-ink">Invalid structure:</strong> neither path produced an accepted identifier. No missing game, set or number is guessed. For example, <code>P-001-JP</code> lacks a separate set and number.</li>
          <li>The parser checks two lowercase letters for language, not ISO membership or publisher availability. An unlisted language such as <code>zz</code> can be syntactically accepted. The registry annotation is separate from validity.</li>
          <li>Frozen legacy prefixes belong to their registered game. For example, <code>ST-ST01-001-JP</code> resolves to One Piece, not every game that prints an ST set. Supply a canonical game code when you know a different identity. If two fields already fit strict structure, the package does not guess that you intended them swapped.</li>
          <li>Variant tokens are open-ended syntax, not evidence of a printing. The package preserves their order; it neither sorts nor verifies them.</li>
        </ul>
      </section>

      <section aria-labelledby="registry-heading" className="space-y-4">
        <h2 id="registry-heading" className="font-display text-2xl">The bundled game registry</h2>
        <p className="text-sm text-ink-muted">Derived directly from <code>GAMES</code>. “Known” means this registry marks the game as having catalog rows; “anticipated” means registered but not so marked. These are bundled declarations, not fresh database checks and not judgments on whether a game exists. The internal test code is shown for transparency but excluded from builder choices.</p>
        <div className="overflow-x-auto" role="region" aria-label="Game-code reference table" tabIndex={0}>
          <table className="w-full text-sm text-left">
            <caption className="sr-only">Registered game codes, registry status and listed languages</caption>
            <thead className="text-ink-muted"><tr>{["Code", "Game", "Registry status", "Listed languages"].map((heading) => <th key={heading} scope="col" className="border-b border-border-strong py-3 pr-4 font-medium">{heading}</th>)}</tr></thead>
            <tbody>{GAME_CODES.map((code) => (
              <tr key={code}>
                <th scope="row" className="border-b border-border-subtle py-3 pr-4 font-mono font-normal">{code}</th>
                <td className="border-b border-border-subtle py-3 pr-4">{GAMES[code].name}</td>
                <td className="border-b border-border-subtle py-3 pr-4">{identifierGameStatus(code)}</td>
                <td className="border-b border-border-subtle py-3 font-mono">{GAMES[code].languages.join(", ")}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="api-heading" className="space-y-4 text-sm text-ink-muted">
        <h2 id="api-heading" className="font-display text-2xl text-ink">The stateless API</h2>
        <p>For callers who choose to send an identifier: <code className="break-all">POST /api/v1/identifiers/validate</code>. Public, no credentials required. The page tools above do not call it.</p>
        <pre className="overflow-x-auto rounded-lg bg-surface-subtle p-4 text-ink"><code>{`Content-Type: application/json\n\n{"identifier":"OP-OP01-001-JP"}`}</code></pre>
        <p>Send exactly one object with one <code>identifier</code> string, up to 256 UTF-16 code units. The entire UTF-8 body is limited to 1,024 bytes, including streamed chunks. Additional fields and arrays are rejected. Ordinary JSON parsing applies; duplicate keys are not separately detected, so send the key only once.</p>
        <p>HTTP 200 carries a syntax result, including invalid syntax. Malformed JSON or wrong shape returns 400; oversized input returns 413; other content types return 415. GET and other unsupported methods return 405 with a documentation link. OPTIONS supports non-credentialed public CORS.</p>
        <p>Results use <code>{"{ data, _meta }"}</code>. The status is <code>strict_canonical</code>, <code>normalization_suggested</code>, or <code>invalid</code>. <code>strict_parse_valid</code> describes the original input; <code>parts</code>, <code>game</code> and <code>language</code> describe the normalized candidate, when available. The original bounded identifier is returned, not replaced. See <Link href="/api/openapi.json" className="underline underline-offset-4">OpenAPI</Link> for the full response shape.</p>
        <p>All endpoint responses are <code>no-store</code>. The handler performs no database or upstream calls and does not persist or log submitted identifiers; ordinary hosting access logs may still exist. Response rights are <code>NOASSERTION</code>, not a CC0 grant over submitted text.</p>
      </section>
      <footer className="border-t border-border-subtle pt-5 text-sm text-ink-muted space-y-2">
        <p>Specification text retains its scoped CC0 dedication. Implementation rights: repository <a href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/LICENSE" className="underline underline-offset-4">LICENSE</a> and applicable more-specific notices.</p>
        <p>Reference: <span className="break-all">https://cambridgetcg.com/standards/validator</span></p>
      </footer>
    </article>
  );
}
