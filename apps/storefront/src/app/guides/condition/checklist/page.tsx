import type { Metadata } from "next";
import Link from "next/link";
import Worksheet from "./Worksheet";
import styles from "./worksheet.module.css";

const canonical = "https://cambridgetcg.com/guides/condition/checklist";

export const metadata: Metadata = {
  title: "Card condition checklist & centering ratios — Cambridge TCG",
  description: "A printable manual card inspection worksheet with separate front/back border ratios. Record surfaces, edges, corners and disclosure notes. No automatic grade, upload or saved submission.",
  alternates: { canonical },
};

const breadcrumbs = [
  { name: "Home", href: "https://cambridgetcg.com" },
  { name: "Guides", href: "https://cambridgetcg.com/guides" },
  { name: "Condition & grading", href: "https://cambridgetcg.com/guides/condition" },
  { name: "Condition checklist", href: canonical },
];

export default function ConditionChecklistPage() {
  return (
    <main lang="en" className={`${styles.page} mx-auto max-w-3xl px-4 py-12 text-ink`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumbs.map(({ name, href }, index) => ({
            "@type": "ListItem", position: index + 1, name, item: href,
          })),
        }) }}
      />
      <nav aria-label="Breadcrumb" className={`${styles.screenOnly} mb-8 text-sm text-ink-muted`}>
        <ol className="flex flex-wrap gap-2">
          {breadcrumbs.map(({ name, href }, index) => (
            <li key={href}>
              {index > 0 && <span aria-hidden="true" className="mr-2">/</span>}
              {index === breadcrumbs.length - 1 ? <span aria-current="page">{name}</span> : <Link href={href.replace("https://cambridgetcg.com", "") || "/"} className="underline underline-offset-4">{name}</Link>}
            </li>
          ))}
        </ol>
      </nav>
      <header className="mb-10 space-y-4">
        <p className="font-mono text-xs text-ink-muted">Manual inspection · computed border ratios</p>
        <h1 className="font-display text-3xl font-semibold">Card condition checklist</h1>
        <p className="text-lg text-ink-muted">A place to record what you can see, and what you cannot yet tell.</p>
        <p className="text-sm text-ink-muted">This is a manual worksheet, not a grading service. Checks and notes are your observations; the only calculation is border arithmetic. No condition tier, grading-company result, authenticity or value is predicted.</p>
        <p className="text-sm text-ink-muted">Entries stay in this page’s memory. The worksheet does not upload images, store entries, send submissions or track what you enter. Reloading clears its state. Print to keep a copy; a printed or saved copy is yours to manage.</p>
        <p className="text-sm text-ink-muted">Inspection categories follow our <Link href="/guides/condition#ledger" className="underline underline-offset-4">condition guide</Link>. For publisher standards and their limits, read the <Link href="/guides/condition#centering" className="underline underline-offset-4">grading context</Link>; no threshold table is duplicated here.</p>
      </header>
      <Worksheet />
      <footer className="mt-10 space-y-3 border-t border-border-subtle pt-5 text-sm text-ink-muted">
        <p>Need help with identifier syntax? The <Link href="/standards/validator" className="underline underline-offset-4">public identifier validator</Link> checks identifier structure, not the card itself.</p>
        <p>Worksheet reference: <a href={canonical} className="underline underline-offset-4">{canonical}</a></p>
        <p>Condition context and sources: <a href="https://cambridgetcg.com/guides/condition" className="underline underline-offset-4">https://cambridgetcg.com/guides/condition</a>. Your notes and measurements are not a Cambridge TCG or grading-company assessment.</p>
      </footer>
    </main>
  );
}
