/**
 * /scrapers — the welcome for web scrapers (HTML harvesters).
 *
 * Where /agents/page.tsx welcomes autonomous AI consuming JSON APIs,
 * this page welcomes web scrapers — bots that crawl HTML, parse pages,
 * harvest structured data. Different audience, similar hospitality.
 *
 * The core message: "Please use our JSON API instead. It's stable;
 * HTML layout can change. But if you must scrape HTML, here's what to
 * know."
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase B.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Welcome — web scrapers",
  description:
    "Cambridge TCG's scraper door. Prefer /api/v1/* (JSON) over HTML scraping. " +
    "If you must scrape, here's robots.txt, sitemap.xml, schema.org markup, " +
    "rate-limit etiquette, and the contact channel.",
  other: audienceMetadata("scraper", ["welcome", "scraper", "discovery"]),
};

export default async function ScrapersWelcomePage() {
  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <header className="mb-12">
          <p className="text-xs text-ink-faint uppercase tracking-widest mb-3">
            Hospitality in codes — for web scrapers
          </p>
          <h1 className="text-3xl font-display font-semibold mb-4 leading-tight">
            We&rsquo;d rather{" "}
            <span className="text-accent">give you the JSON</span>.
          </h1>
          <p className="text-lg text-ink-muted leading-relaxed max-w-3xl">
            HTML scraping is a bad contract for both of us: layout can change without
            notice, your parser breaks, our compute pays ~10× the cost of serving
            JSON. The JSON API at <span className="font-mono">/api/v1/*</span> is
            machine-readable, but each route has its own stability and rights boundary.
            Public reach is not a blanket CC0 grant. Start with its response metadata.
          </p>
        </header>

        {/* The polite redirect */}
        <section className="mb-12 p-6 bg-ok/5 border border-ok/20 rounded-lg">
          <h2 className="text-sm uppercase tracking-widest text-ok mb-4">
            If you&rsquo;re here to scrape, try these instead
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-ink-muted mb-2">Structural card lookup (prices withheld)</p>
              <p className="font-mono text-ink">
                /api/v1/universal/card/[sku]
              </p>
            </div>
            <div>
              <p className="text-ink-muted mb-2">Card list (per set)</p>
              <p className="font-mono text-ink">
                /api/v1/universal/set/[code]
              </p>
            </div>
            <div>
              <p className="text-ink-muted mb-2">Bulk publication status (0 card rows)</p>
              <p className="font-mono text-ink">/data/catalog.jsonl</p>
            </div>
            <div>
              <p className="text-ink-muted mb-2">Date-shaped structural compatibility view</p>
              <p className="font-mono text-ink">
                /api/at/[YYYY-MM-DD]/card/[sku]
              </p>
            </div>
            <div>
              <p className="text-ink-muted mb-2">Sets per game</p>
              <p className="font-mono text-ink">
                /api/v1/universal/sets/[game]
              </p>
            </div>
            <div>
              <p className="text-ink-muted mb-2">Every game</p>
              <p className="font-mono text-ink">/api/v1/universal/games</p>
            </div>
          </div>
          <p className="text-xs text-ink-faint mt-4 leading-relaxed">
            All publicly reachable without auth. Reuse rights vary by response:
            Cambridge-authored structure may be CC0; mixed catalog data is{" "}
            <code>NOASSERTION</code>. Preserve <code>_meta.license</code> and{" "}
            <code>_meta.source_license</code>; absence of a license is not
            permission. See{" "}
            <Link
              href="/api/v1/welcome"
              className="text-accent hover:underline"
            >
              /api/v1/welcome
            </Link>{" "}
            for the full menu, or{" "}
            <Link
              href="/agents/guides/mirror-the-catalog"
              className="text-accent hover:underline"
            >
              the mirror-the-catalog guide
            </Link>{" "}
            for the polite refresh discipline.
          </p>
        </section>

        {/* If you must scrape */}
        <section className="mb-12">
          <h2 className="text-sm uppercase tracking-widest text-ink-faint mb-4">
            If you must scrape HTML
          </h2>
          <p className="text-sm text-ink-muted mb-5 leading-relaxed">
            Some legitimate use cases require scraping the rendered surface (e.g.
            archive crawlers, web-of-trust verifiers, accessibility audits). Here are
            the substrate primitives we publish to make that easier.
          </p>
          <div className="space-y-3">
            <div className="p-4 bg-surface border border-border-subtle rounded">
              <Link
                href="/robots.txt"
                className="font-mono text-accent hover:underline"
              >
                /robots.txt
              </Link>
              <p className="text-sm text-ink-muted mt-1">
                What&rsquo;s allowed; <span className="font-mono">Crawl-delay: 2</span>;
                sitemap pointer; per-bot opt-outs for training-only crawlers.
              </p>
            </div>
            <div className="p-4 bg-surface border border-border-subtle rounded">
              <Link
                href="/sitemap.xml"
                className="font-mono text-accent hover:underline"
              >
                /sitemap.xml
              </Link>
              <p className="text-sm text-ink-muted mt-1">
                Structured listing of every crawlable URL with{" "}
                <span className="font-mono">lastModified</span> +{" "}
                <span className="font-mono">changeFrequency</span> +{" "}
                <span className="font-mono">priority</span>.
              </p>
            </div>
            <div className="p-4 bg-surface border border-border-subtle rounded">
              <Link
                href="/.well-known/cambridge-tcg.json"
                className="font-mono text-accent hover:underline"
              >
                /.well-known/cambridge-tcg.json
              </Link>
              <p className="text-sm text-ink-muted mt-1">
                Machine-readable manifest of every public surface with status, auth,
                methodology links.
              </p>
            </div>
            <div className="p-4 bg-surface border border-border-subtle rounded">
              <Link
                href="/.well-known/ai-plugin.json"
                className="font-mono text-accent hover:underline"
              >
                /.well-known/ai-plugin.json
              </Link>
              <p className="text-sm text-ink-muted mt-1">
                OpenAI-style plugin discovery; LLM platforms reading this register us
                as a tool.
              </p>
            </div>
            <div className="p-4 bg-surface border border-border-subtle rounded">
              <Link
                href="/.well-known/mcp.json"
                className="font-mono text-accent hover:underline"
              >
                /.well-known/mcp.json
              </Link>
              <p className="text-sm text-ink-muted mt-1">
                MCP (Model Context Protocol) discovery with suggested read-tools per
                endpoint.
              </p>
            </div>
          </div>
        </section>

        {/* Polite cadence */}
        <section className="mb-12 p-6 bg-accent/5 border border-accent/20 rounded-lg">
          <h2 className="text-sm uppercase tracking-widest text-accent-strong mb-3">
            Crawl etiquette
          </h2>
          <ul className="text-sm text-ink-muted space-y-2 leading-relaxed">
            <li>
              • <span className="font-semibold">User-Agent</span>: send{" "}
              <span className="font-mono">
                &lt;project&gt;/&lt;version&gt; (&lt;contact-email&gt;)
              </span>
              . A contact makes communication possible; it does not promise outreach
              before an infrastructure or security control acts.
            </li>
            <li>
              •{" "}
              <span className="font-semibold">
                Honour <span className="font-mono">Crawl-delay: 2</span>
              </span>{" "}
              from robots.txt. Per-resource cadence at{" "}
              <Link
                href="/api/v1/rate-limits"
                className="text-accent hover:underline"
              >
                /api/v1/rate-limits
              </Link>
              .
            </li>
            <li>
              • <span className="font-semibold">Cache when a response permits it</span>:
              respect any Cache-Control and freshness metadata that is present.
            </li>
            <li>
              • <span className="font-semibold">Honour HTTP 429</span>: response body
              may include a Retry-After header or retry detail. Back off on repeated
              responses even when no machine-readable delay is present.
            </li>
            <li>
              • <span className="font-semibold">Don&rsquo;t bulk re-export</span> data
              tagged <span className="font-mono">internal-only</span> in{" "}
              <span className="font-mono">_meta.source_license</span>. License
              boundary. Legacy CardRush-derived values are currently withheld rather
              than exposed behind an authentication gate.
            </li>
          </ul>
        </section>

        {/* Schema.org */}
        <section className="mb-12">
          <h2 className="text-sm uppercase tracking-widest text-ink-faint mb-3">
            Structured-data markup on HTML pages
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed mb-3">
            Cambridge TCG&rsquo;s HTML pages emit{" "}
            <Link
              href="https://schema.org"
              className="text-accent hover:underline"
            >
              schema.org
            </Link>{" "}
            markup where applicable (Product, Offer, BreadcrumbList, DefinedTermSet
            for the glossary). If you&rsquo;re a structured-data crawler, parse the{" "}
            <span className="font-mono">application/ld+json</span> blocks instead of
            CSS selectors.
          </p>
          <p className="text-xs text-ink-faint">
            schema.org coverage is ongoing; gaps are tracked in the substrate-honesty
            audit (
            <Link
              href="https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/principles/substrate-honesty-audit.md"
              className="text-accent hover:underline"
            >
              substrate-honesty-audit.md
            </Link>
            ).
          </p>
        </section>

        {/* Contact */}
        <footer className="pt-6 border-t border-border-subtle text-xs text-ink-faint space-y-3">
          <p>
            Feedback channel:{" "}
            <Link href="/api/v1/feedback" className="text-accent hover:underline">
              POST /api/v1/feedback
            </Link>{" "}
            or email{" "}
            <span className="font-mono">contact@cambridgetcg.com</span>. Response
            window 48h.
          </p>
          <p>
            Other doors:{" "}
            <Link href="/agents" className="text-accent hover:underline">
              /agents
            </Link>{" "}
            (autonomous AI) ·{" "}
            <Link href="/welcome-all" className="text-accent hover:underline">
              /welcome-all
            </Link>{" "}
            (umbrella) ·{" "}
            <Link href="/platform" className="text-accent hover:underline">
              /platform
            </Link>{" "}
            (human positioning)
          </p>
        </footer>
      </div>
    </div>
  );
}
