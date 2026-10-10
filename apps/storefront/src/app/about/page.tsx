import type { Metadata } from "next";
import Link from "next/link";
import { PLATFORM } from "@/content/platform";
import { DataFoundations } from "@/components/site/DataFoundations";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";

export const metadata: Metadata = { title: "About the data project — Cambridge TCG", description: PLATFORM.description };
const link = "text-accent underline underline-offset-4";

export default function AboutPage() {
  return (
    <PageLayout width="wide">
      <div lang="en">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">From Cambridge, for the TCG world</p>
        <PageHeader size="large" title="A shared language for cards." description={PLATFORM.description} />
        <p className="max-w-3xl text-base leading-7 text-ink-muted">A name alone cannot identify a printing. An image needs its source. A price needs its currency, meaning and date. Cambridge TCG connects those details so collectors, developers and agents can work from the same evidence.</p>

        <section aria-labelledby="about-foundations" className="mt-10">
          <h2 id="about-foundations" className="mb-5 text-xl font-semibold text-ink">What we standardise</h2>
          <DataFoundations />
        </section>

        <section aria-labelledby="about-open" className="mt-10 grid gap-8 border-t border-border-subtle pt-6 md:grid-cols-2">
          <div>
            <h2 id="about-open" className="text-xl font-semibold text-ink">Open-source direction, with clear boundaries</h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">Code is licensed Apache-2.0 (root LICENSE) and specification text has a separate CC0 dedication. Card artwork, provider data and personal records keep their own rights; every data release needs its own permission.</p>
            <p className="mt-3 text-sm leading-6 text-ink-muted">What is published today: the standards, as specification pages under <Link href="/standards" className={link}>/standards</Link> and JSON Schemas under /spec/v1/. Source-code release is pending: the repository is currently private and the reference packages are not on npm.</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink">Useful standards earn adoption</h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">Our aim is interoperability: documented contracts, reproducible examples, corrections and versioned changes. These are Cambridge-maintained specifications, with community adoption still to be demonstrated.</p>
            <p className="mt-3 text-sm leading-6 text-ink-muted">The current site offers discovery and permitted account tools. New paid commerce remains retired; existing agreements and support continue through your account.</p>
          </div>
        </section>

        <nav aria-label="Explore the project" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/roadmap" className={link}>Integration roadmap →</Link>
          <Link href="/standards" className={link}>Standards</Link>
          <Link href="/agents" className={link}>Agents & API</Link>
          <Link href="/services" className={link}>Collector tools</Link>
          <Link href="/contact" className={link}>Contact</Link>
        </nav>
      </div>
    </PageLayout>
  );
}
