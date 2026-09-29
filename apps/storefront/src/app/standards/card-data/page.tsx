import type { Metadata } from "next";
import Link from "next/link";
import { SKU_IDENTITY_CONTRACT } from "@cambridge-tcg/sku";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";

export const metadata: Metadata = {
  title: "SKU & price contracts — Cambridge TCG",
  description: "How Cambridge identifies cards and represents price observations: exact units, native currency, source, mapping and time.",
};

export default function CardDataStandard() {
  return (
    <PageLayout width="reading">
      <article lang="en" className="prose prose-sm sm:prose-base max-w-none">
        <PageHeader size="large" title="SKU & price contracts" description="Identify the right printing. Keep every amount attached to its currency, source and meaning." />
        <p><a href="/api/v1/contracts/card-data">Machine-readable contract</a>{" · "}<a href="/api/openapi.json">OpenAPI</a>{" · "}<Link href="/standards/validator">Try an identifier</Link></p>
        <h2>One identity, with an explicit scope</h2>
        <p>The SKU contract is <code>{SKU_IDENTITY_CONTRACT.version}</code>. Its structure is <code>game-set-number-language[-variant]</code>. Preserve the returned legacy <code>sku</code> for existing URLs and lookups; the additive <code>identity</code> object carries its normalized spelling and parsed fields.</p>
        <pre><code>{'PK-SV2A-011-JP-V4K5\n→ pkm-sv2a-011-ja-v4k5'}</code></pre>
        <p>This example demonstrates normalization only. Registered game aliases and Japanese language aliases normalize; set and number padding, and the order of variant tokens, stay significant. A two-letter language segment is a syntax check, not proof of an assigned language code.</p>
        <p>Keep three questions separate: is the identifier well formed, does a catalogue record match it, and is an upstream observation mapped to that printing? Syntax does not answer the last two. Ambiguous and unmapped records remain explicit.</p>
        <h2>Two existing price representations</h2>
        <div className="overflow-x-auto"><table><thead><tr><th>Representation</th><th>Amount</th><th>Meaning</th></tr></thead><tbody>
          <tr><td>Legacy public fields such as <code>price_gbp</code></td><td>Finite number or <code>null</code>, in pounds</td><td>Compatibility fields; permitted values only. No change to pennies.</td></tr>
          <tr><td>Member observations</td><td>Decimal string and explicit native currency</td><td>Keep the source metric, mapping status, finish and source/retrieval times. No silent FX conversion.</td></tr>
        </tbody></table></div>
        <p>The money primitive accepts zero as a numeric amount. Native source observations require positive amounts and quarantine zero sentinels; the legacy retail selector treats non-positive asking prices as unavailable. Missing, invalid and withheld values never become an invented zero or a substitute price.</p>
        <h2>Read the whole observation</h2>
        <ul>
          <li><strong>Identity:</strong> use the mapped SKU only when mapping is exact. Preserve upstream identifiers when it is not.</li>
          <li><strong>Amount and currency:</strong> decimal text is in major units. Keep its original precision; do not use binary floating-point arithmetic to rewrite the observation.</li>
          <li><strong>Source and metric:</strong> a low ask, trend and recorded sale are distinct measurements. Never average them merely because their currency matches.</li>
          <li><strong>Time:</strong> source update time, retrieval time and pagination snapshot time describe different events. A freshly rendered response is not a freshly observed price.</li>
          <li><strong>Access and reuse:</strong> inspect permitted uses and attribution. Login and schema validation do not grant publication rights.</li>
        </ul>
        <h2>Make a request</h2>
        <pre><code>{'GET /api/v1/contracts/card-data\n\nPOST /api/v1/identifiers/validate\nContent-Type: application/json\n\n{"identifier":"OP-OP01-001-JP"}\n\nGET /api/v1/search/cards?game=op&q=OP01-001'}</code></pre>
        <p>Public search preserves the selected game and reports source unavailability separately from an empty result. Exact search results identify matching records; their syntax metadata still does not authenticate a physical copy.</p>
        <p>The <code>/api/v1/member-prices</code> feed requires an account-owned member data key and applies source-specific API-use rules. Provisioning belongs in <Link href="/account/data" prefetch={false}>your account</Link>. Keep credentials out of URLs and public examples.</p>
        <h2>Validation and compatibility</h2>
        <p>The machine contract includes JSON Schemas for money and member observations, and the SKU normalization rules. Schemas check response structure; regression fixtures check game isolation, price validation and mapping behavior. Existing endpoint names and legacy amount units remain stable.</p>
        <p><Link href="/guides/read-a-card">Read the collector’s guide</Link>{" · "}<Link href="/data">Source and publication status</Link>{" · "}<Link href="/agents">Agent workshop</Link></p>
      </article>
    </PageLayout>
  );
}
