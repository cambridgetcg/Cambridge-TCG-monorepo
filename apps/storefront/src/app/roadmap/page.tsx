import type { Metadata } from "next";
import Link from "next/link";
import { DATA_FOUNDATIONS, DELIVERY_STAGES, INTEGRATION_ROADMAP } from "@/content/platform";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";

export const metadata: Metadata = {
  title: "Integration roadmap — Cambridge TCG",
  description: "The path to interoperable TCG data: SKU identity, image rights, price observations, market evidence and agent integrations.",
  alternates: { canonical: "/roadmap" },
};
const link = "text-accent underline underline-offset-4";

export default function RoadmapPage() {
  return (
    <PageLayout width="wide">
      <div lang="en">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">Open-source TCG data infrastructure</p>
        <PageHeader size="large" title="Build the connections." description="Four foundations. A shared contract. Clear steps from source data to useful tools." />
        <p className="mb-6 max-w-3xl text-sm leading-6 text-ink-muted">Reviewed {INTEGRATION_ROADMAP.reviewed_at}. This is a delivery plan; source availability and release dates are not promised.</p>
        <nav aria-label="Data foundations" className="mb-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {DATA_FOUNDATIONS.map((area) => <a key={area.id} href={`#${area.id}`} className={link}>{area.title}</a>)}
        </nav>
        <div className="grid gap-5 md:grid-cols-2">
          {DATA_FOUNDATIONS.map((area) => (
            <section key={area.id} id={area.id} aria-labelledby={`${area.id}-title`} className="scroll-mt-24 rounded-2xl border border-border-subtle bg-surface p-6">
              <p className="mb-2 text-xs font-medium text-accent">{area.status}</p>
              <h2 id={`${area.id}-title`} className="text-xl font-semibold text-ink">{area.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{area.purpose}</p>
              <dl className="mt-5 space-y-4 text-sm leading-6">
                <div><dt className="font-semibold text-ink">In place</dt><dd className="text-ink-muted">{area.current}</dd></div>
                <div><dt className="font-semibold text-ink">Next</dt><dd className="text-ink-muted">{area.next}</dd></div>
              </dl>
              <details className="mt-4 text-sm leading-6"><summary className="cursor-pointer font-medium text-ink">Ready when</summary><p className="mt-2 text-ink-muted">{area.acceptance}</p></details>
              <Link href={area.href} className={`${link} mt-4 inline-flex min-h-11 items-center text-sm`}>{area.linkLabel} →</Link>
            </section>
          ))}
        </div>
        <section aria-labelledby="delivery-order" className="mt-12">
          <h2 id="delivery-order" className="text-2xl font-semibold text-ink">The delivery order</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Each step depends on the evidence from the one before it.</p>
          <ol className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
            {DELIVERY_STAGES.map((stage, index) => (
              <li key={stage.id} className="grid gap-3 py-5 sm:grid-cols-[3rem_1fr]">
                <span aria-hidden="true" className="text-2xl font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span>
                <div><h3 className="font-semibold text-ink">{stage.title} <span className="ml-2 text-xs font-normal text-ink-muted">{stage.status}</span></h3><p className="mt-2 text-sm leading-6 text-ink-muted">{stage.outcome}</p><details className="mt-2 text-sm leading-6"><summary className="cursor-pointer text-ink">Release gate</summary><p className="mt-2 text-ink-muted">{stage.gate}</p></details></div>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="roadmap-open" className="mt-10 rounded-2xl bg-secondary-wash p-6">
          <h2 id="roadmap-open" className="text-xl font-semibold text-ink">Open in layers</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">{INTEGRATION_ROADMAP.release_status} {INTEGRATION_ROADMAP.rights}</p>
          <nav aria-label="Build with Cambridge TCG" className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm"><Link href="/agents" className={link}>Agents & API</Link><Link href="/standards" className={link}>Standards</Link><Link href="/api/v1/roadmap" prefetch={false} className={link}>Roadmap JSON</Link><Link href="/contact" className={link}>Propose an integration</Link></nav>
        </section>
      </div>
    </PageLayout>
  );
}
