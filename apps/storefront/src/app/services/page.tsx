import type { Metadata } from "next";
import Link from "next/link";
import { ServiceCards } from "@/components/site/ServiceCards";
import { PageHeader } from "@/lib/ui/PageHeader";
import { PageLayout } from "@/lib/ui/PageLayout";

export const metadata: Metadata = {
  title: "Tools for your collection — Cambridge TCG",
  description: "Find prices, organise your cards, inspect condition and download permitted source data.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return (
    <PageLayout>
      <div lang="en">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-accent">The collector’s toolkit</p>
        <PageHeader
          title="Tools for your collection"
          description="Find prices, organise your cards and keep useful records."
          size="large"
        />
        <ServiceCards />

        <section aria-labelledby="how-prices-work" className="mt-10 rounded-2xl bg-secondary-wash p-6 sm:p-8">
          <h2 id="how-prices-work" className="text-xl font-semibold text-ink">How prices work</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-muted">
            <li>Identify the card and printing, including its language and variant.</li>
            <li>Check the source, price metric, currency and observation date.</li>
            <li>Keep your collection records or download permitted observations.</li>
          </ol>
          <p className="mt-4 text-sm leading-6 text-ink-muted">
            Prices depend on available imports; current means latest stored. {" "}
            <Link href="/methodology/member-pricing" className="text-accent underline underline-offset-4">Price meanings and source permissions</Link>
          </p>
        </section>

        <p className="mt-8 text-sm text-ink-muted">
          Building an integration? {" "}
          <Link href="/agents" className="text-accent underline underline-offset-4">Agent and API entry</Link>
        </p>
      </div>
    </PageLayout>
  );
}
