import Link from "next/link";
import type { Metadata } from "next";
import { audienceMetadata } from "@/lib/ui/Audience";
import { PageLayout } from "@/lib/ui/PageLayout";
import { STANDARDS, STANDARDS_LINKS } from "@/lib/contracts/standards";

export const metadata: Metadata = {
  title: "Card data standards — Cambridge TCG",
  description: "Cambridge TCG specifications for card identifiers, pricing calculations and structured records. Read the contracts, their limits and the integration roadmap.",
  alternates: { canonical: "https://cambridgetcg.com/standards" },
  other: audienceMetadata("public-documentation", ["standards", "data", "spec"]),
};

const link = "text-accent underline underline-offset-4";

export default function StandardsPage() {
  return (
    <PageLayout width="reading">
      <div lang="en" className="space-y-10">
        <header>
          <p className="text-sm font-medium text-ink-muted">Build with card data</p>
          <h1 className="mt-3 font-display text-4xl font-semibold text-ink">Card data standards</h1>
          <p className="mt-4 text-base leading-7 text-ink-muted">Three Cambridge-maintained specifications for identifiers, pricing calculations and structured records. Each has its own version and implementation status.</p>
          <nav aria-label="Standards resources" className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href={STANDARDS_LINKS.contracts} className={link + " inline-flex min-h-11 items-center"}>SKU &amp; price contracts</Link>
            <Link href={STANDARDS_LINKS.validator} className={link + " inline-flex min-h-11 items-center"}>Check an identifier</Link>
            <Link href={STANDARDS_LINKS.roadmap} className={link + " inline-flex min-h-11 items-center"}>Integration roadmap</Link>
            <Link href={STANDARDS_LINKS.manifest} className={link + " inline-flex min-h-11 items-center"}>JSON registry</Link>
          </nav>
        </header>

        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          {STANDARDS.map((standard) => (
            <section key={standard.code} aria-labelledby={standard.code} className="py-6">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
                <code className="break-all">{standard.code}</code>
                <span>v{standard.version} · {standard.status}</span>
              </div>
              <h2 id={standard.code} className="mt-2 text-xl font-semibold text-ink">{standard.title}</h2>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{standard.short}</p>
              <Link href={standard.spec_url} className={link + " mt-2 inline-flex min-h-11 items-center text-sm"}>Read {standard.title.toLowerCase()}</Link>
              {standard.impl_path_in_repo && <p className="text-sm leading-6 text-ink-muted">Reference implementation in the repository: <code>{standard.impl_path_in_repo}</code> (private repository; source release pending)</p>}
              {standard.endpoint_url && <p className="text-sm leading-6 text-ink-muted">Implemented route template: <code className="break-all">{standard.endpoint_url}</code>. Available fields depend on the catalog and their publication rules.</p>}
            </section>
          ))}
        </div>

        <section aria-labelledby="standards-rights" className="space-y-4 text-sm leading-6 text-ink-muted">
          <h2 id="standards-rights" className="text-xl font-semibold text-ink">Using the specifications and code</h2>
          <p><strong className="text-ink">Specification text:</strong> the existing CC0 dedication in <code>docs/STANDARDS-LICENSE.md</code> covers these specification texts. No account or attribution is required to use them.</p>
          <p><strong className="text-ink">Reference code:</strong> licensed Apache-2.0 under the repository LICENSE and applicable more-specific notices. Source-code release is pending: the repository is currently private and the workspace packages are not npm releases. The published standards are these specification pages and the JSON Schemas under <code>/spec/v1/</code> (for example <a href="/spec/v1/SkuIdentity.schema.json" className={link}>SkuIdentity.schema.json</a>).</p>
          <p><strong className="text-ink">Data and images:</strong> each source and field has its own permissions. A valid identifier, attributed image or open-source implementation does not grant permission to redistribute upstream content.</p>
        </section>

        <details className="border-t border-border-subtle pt-4 text-sm leading-6 text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink">What the statuses mean</summary>
          <dl className="mt-3 space-y-3">
            <div><dt className="font-medium text-ink">Frozen</dt><dd>Stable specification; breaking changes require a new version.</dd></div>
            <div><dt className="font-medium text-ink">Draft</dt><dd>Published specification that may still be revised.</dd></div>
            <div><dt className="font-medium text-ink">Implemented</dt><dd>A reference route exists in the codebase. This label is not a live service-health or source-coverage check.</dd></div>
            <div><dt className="font-medium text-ink">Planned</dt><dd>Named work without a shipped implementation.</dd></div>
          </dl>
        </details>
      </div>
    </PageLayout>
  );
}
