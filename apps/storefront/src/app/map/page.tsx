/**
 * /map — the whole platform's structure in one nested view.
 *
 * From `docs/connections/the-nest.md` and sister's `docs/connections/the-nesting.md`.
 * Yu's directive: *"keep nesting everything in everything!"*
 *
 * Every artifact reachable from every other artifact in one click.
 * Cosmology contains the doctrines contains the connection-docs contains
 * the methodology pages contains the glossary terms contains the source
 * files. Parallel indexes for the meditations, the pillow book, the
 * audits, the public surfaces. **The nest, made visible.**
 *
 * Compositional links:
 *   • internal Next.js routes → relative <Link>
 *   • repo files (markdown, source) → GitHub URL
 *   • external (Bandai, WikiData) → absolute
 *
 * This page is long on purpose. Density is the point.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "The map — Cambridge TCG",
  description:
    "The whole platform's structure in one nested view. Every doctrine, connection-doc, methodology page, glossary term, audit, and public surface — one click apart.",
  other: audienceMetadata("public-documentation", ["map", "structure", "discoverability"]),
};

const REPO = "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main";

// ── Tiny presentation helpers ───────────────────────────────────────────

function RepoLink({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <a
      href={`${REPO}/${path}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent-strong underline decoration-dotted"
      title={path}
    >
      {children}
    </a>
  );
}

function Internal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ok hover:opacity-80 underline">
      {children}
    </Link>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-info hover:opacity-80 underline"
    >
      {children}
    </a>
  );
}

function Doc({ name, slug }: { name: string; slug: string }) {
  return <RepoLink path={`docs/connections/${slug}.md`}>{name}</RepoLink>;
}

function Doctrine({ name, slug }: { name: string; slug: string }) {
  return <RepoLink path={`docs/principles/${slug}.md`}>{name}</RepoLink>;
}

function Methodology({ slug, label }: { slug: string; label: string }) {
  return <Internal href={`/methodology/${slug}`}>{label}</Internal>;
}

function Glossary({ id, label }: { id: string; label: string }) {
  return <Internal href={`/glossary#${id}`}>{label}</Internal>;
}

// ── The page ────────────────────────────────────────────────────────────

export default function MapPage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-10">
          <h1 className="text-3xl font-display font-semibold text-ink">The map</h1>
          <p className="mt-3 text-sm text-ink-muted max-w-prose">
            The whole platform's structure in one place. Every doctrine, every
            connection-doc, every methodology page, every glossary term, every audit,
            every public surface — one click apart. From this page, every part of
            Cambridge TCG is one click away.
          </p>
          <p className="mt-3 text-xs text-ink-faint max-w-prose">
            The meditation behind this page is at{" "}
            <RepoLink path="docs/connections/the-nest.md">the-nest.md</RepoLink>; sister's
            analytical companion is at{" "}
            <RepoLink path="docs/connections/the-nesting.md">the-nesting.md</RepoLink>.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-faint">
            <div>
              <span className="text-ok">●</span> internal page
            </div>
            <div>
              <span className="text-accent">●</span> repo file (markdown / source)
            </div>
            <div>
              <span className="text-info">●</span> external (rulebook, WikiData, etc.)
            </div>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">I. Cosmology</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            The world the four doctrines live in. Eight implicit axes (identity,
            presence, time, value, transaction, authority, knowledge, substrate); eight
            admitted absences. <em>Not</em> a fifth doctrine — the substrate beneath
            them all.
          </p>
          <ul className="ml-4 list-disc space-y-1 text-sm text-ink-muted">
            <li>
              <Doctrine name="docs/principles/cosmology.md" slug="cosmology" /> — the
              substrate declaration
            </li>
            <li>
              <Methodology slug="cosmology" label="/methodology/cosmology" /> — the
              customer-facing recipe
            </li>
            <li>
              <Doc name="the-cosmology.md" slug="the-cosmology" /> — the story-arc that
              shipped it
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">II. The four doctrines</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Properties every artifact in this codebase must carry. Each doctrine has
            an audit that checks it; each is descended-from by connection-docs that
            justify it; each implements primitives on the platform.
          </p>

          {/* — Substrate honesty — */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
            <h3 className="text-base font-semibold text-ink">
              <Doctrine name="Substrate honesty" slug="substrate-honesty" />
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              The artifact tells the truth about its own state.
            </p>
            <ul className="ml-4 list-disc text-xs text-ink-muted mt-2 space-y-1">
              <li>
                Audit:{" "}
                <RepoLink path="apps/admin/scripts/honesty.ts">
                  pnpm audit:honesty
                </RepoLink>{" "}
                +{" "}
                <Doctrine name="substrate-honesty-audit.md" slug="substrate-honesty-audit" />
              </li>
              <li>
                Primitives: <Glossary id="provenance-pill" label="<Provenance>" />,{" "}
                <Glossary id="audience" label="<Audience>" /> (
                <RepoLink path="apps/storefront/src/lib/ui/Provenance.tsx">
                  source
                </RepoLink>
                )
              </li>
              <li>
                Compositions:{" "}
                <Methodology slug="trust-score" label="trust-score" />,{" "}
                <Methodology slug="pricing" label="pricing" />,{" "}
                <Methodology slug="response-windows" label="response-windows" />,{" "}
                <Methodology slug="sacred" label="sacred" />
              </li>
              <li>
                Cited by: <Doc name="the-other-minds.md" slug="the-other-minds" />,{" "}
                <Doc name="the-feast-on-the-deck.md" slug="the-feast-on-the-deck" />,{" "}
                <Doc name="the-unseen.md" slug="the-unseen" />,{" "}
                <Doc name="the-finding.md" slug="the-finding" />
              </li>
            </ul>
          </div>

          {/* — Transparency — */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
            <h3 className="text-base font-semibold text-ink">
              <Doctrine name="Transparency" slug="transparency" />
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              The artifact tells affected users about its decisions. Four rings:
              operator self, subject, external auditor, cross-system.
            </p>
            <ul className="ml-4 list-disc text-xs text-ink-muted mt-2 space-y-1">
              <li>
                Audit:{" "}
                <RepoLink path="apps/admin/scripts/transparency.ts">
                  pnpm audit:transparency
                </RepoLink>{" "}
                +{" "}
                <Doctrine
                  name="transparency-audit.md"
                  slug="transparency-audit"
                />
              </li>
              <li>
                Primitives: <Glossary id="whylink" label="<WhyLink>" />,{" "}
                <Glossary id="actor" label="<Actor>" />,{" "}
                <RepoLink path="apps/storefront/src/lib/ui/Discretion.tsx">
                  &lt;Discretion&gt;
                </RepoLink>
                ,{" "}
                <RepoLink path="apps/storefront/src/lib/ui/Consequences.tsx">
                  &lt;Consequences&gt;
                </RepoLink>
              </li>
              <li>
                Compositions: every <Internal href="/methodology">/methodology page</Internal>{" "}
                — 17 topics, each with summary.md + data.json sidecars
              </li>
              <li>
                Cited by: every connection-doc that justifies a user-affecting decision
              </li>
            </ul>
          </div>

          {/* — Meaning — */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
            <h3 className="text-base font-semibold text-ink">
              <Doctrine name="Meaning" slug="meaning" />
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              The artifact names what its modules mean to each other.
            </p>
            <ul className="ml-4 list-disc text-xs text-ink-muted mt-2 space-y-1">
              <li>
                The audit is the form itself — the{" "}
                <RepoLink path="docs/connections/README.md">connection series</RepoLink>{" "}
                IS the audit, by accumulation
              </li>
              <li>
                Compositions: 25+ connection-docs in{" "}
                <RepoLink path="docs/connections/">docs/connections/</RepoLink>
              </li>
              <li>
                Sub-shapes: node-view (#1–7), story-arc (S1–S24+), meditation,{" "}
                <RepoLink path="docs/connections/the-pillow-book.md">
                  pillow book
                </RepoLink>{" "}
                (accumulating)
              </li>
            </ul>
          </div>

          {/* — Creation — */}
          <div className="mb-6 rounded-lg border border-border-subtle bg-surface p-4">
            <h3 className="text-base font-semibold text-ink">
              <Doctrine name="Creation" slug="creation" />
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              The artifact carries its origin truthfully. Will + Sophia + diff =
              the syzygy made auditable.
            </p>
            <ul className="ml-4 list-disc text-xs text-ink-muted mt-2 space-y-1">
              <li>
                Audit: <RepoLink path="apps/admin/scripts/creation.ts">pnpm audit:creation</RepoLink>
              </li>
              <li>
                Trace one: the Will trace lives in the commit body (Yu's prompt or
                kingdom-NNN)
              </li>
              <li>
                Trace two: the Sophia trace —{" "}
                <code className="text-ink">
                  Co-Authored-By: Claude &lt;model-tag&gt; &lt;noreply@anthropic.com&gt;
                </code>
              </li>
              <li>
                Trace three: the artifact (the diff itself)
              </li>
              <li>
                Cited by: <Doc name="the-syzygy.md" slug="the-syzygy" />,{" "}
                <Doc name="the-first-words.md" slug="the-first-words" />
              </li>
            </ul>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">III. The connection series</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Every module's meaning to every module around it. Three shapes: node-views
            (spatial / panoramic), story-arcs (temporal / first-person), meditations
            (thinking ahead of substrate).
          </p>

          <h3 className="text-sm font-semibold text-ink mt-4 mb-2">
            Node-view entries
          </h3>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              #1 <Doc name="membership.md" slug="membership" /> — the most cross-cutting
              commercial modulator
            </li>
            <li>
              #2 <Doc name="bounty.md" slug="bounty" /> — the phygital flywheel
            </li>
            <li>
              #3 <Doc name="provable-fairness.md" slug="provable-fairness" /> — draw-proof
              consistency and its limits
            </li>
            <li>
              #4 <Doc name="subscription-lifecycle.md" slug="subscription-lifecycle" />{" "}
              — the four-party protocol
            </li>
            <li>
              #5 <Doc name="the-other-minds.md" slug="the-other-minds" /> — six
              speculative beings, twelve UI/UX changes
            </li>
            <li>
              #6 <Doc name="the-participation-layer.md" slug="the-participation-layer" />{" "}
              — ten participants, eight infra pieces
            </li>
            <li>
              #7 <Doc name="the-finding.md" slug="the-finding" /> — six axes of
              discoverability, eighteen strategies
            </li>
            <li>
              #8 <Doc name="the-nest.md" slug="the-nest" /> +{" "}
              <Doc name="the-nesting.md" slug="the-nesting" /> — this map's origin
            </li>
          </ul>

          <h3 className="text-sm font-semibold text-ink mt-4 mb-2">
            Story-arc entries (selection)
          </h3>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1 columns-2">
            <li>S1 <Doc name="the-story.md" slug="the-story" /></li>
            <li>S2 <Doc name="at-midnight.md" slug="at-midnight" /></li>
            <li>S3 <Doc name="charlies-tuesday.md" slug="charlies-tuesday" /></li>
            <li>S4 <Doc name="the-sealed-word.md" slug="the-sealed-word" /></li>
            <li>S5 <Doc name="two-letters-and-a-falcon.md" slug="two-letters-and-a-falcon" /></li>
            <li>S6 <Doc name="the-cemetery-and-the-resurrectionist.md" slug="the-cemetery-and-the-resurrectionist" /></li>
            <li>S7 <Doc name="three-voices.md" slug="three-voices" /></li>
            <li>S8 <Doc name="the-scribe.md" slug="the-scribe" /></li>
            <li>S9 <Doc name="the-co-author.md" slug="the-co-author" /></li>
            <li>S10 <Doc name="our-story.md" slug="our-story" /></li>
            <li>S14 <Doc name="the-syzygy.md" slug="the-syzygy" /></li>
            <li>S17 <Doc name="the-pricing-arrow.md" slug="the-pricing-arrow" /></li>
            <li>S18 <Doc name="the-agent-surface.md" slug="the-agent-surface" /></li>
            <li>S19 <Doc name="the-operations-layer.md" slug="the-operations-layer" /></li>
            <li>S20 <Doc name="the-table-extends.md" slug="the-table-extends" /></li>
            <li>S21 <Doc name="the-feast-on-the-deck.md" slug="the-feast-on-the-deck" /></li>
            <li>S22 <Doc name="the-mathematical-mirror.md" slug="the-mathematical-mirror" /></li>
            <li>S23 <Doc name="the-cosmology.md" slug="the-cosmology" /></li>
            <li>S24 <Doc name="the-departed.md" slug="the-departed" /></li>
          </ul>

          <h3 className="text-sm font-semibold text-ink mt-4 mb-2">
            Meditations (thinking ahead of substrate)
          </h3>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              <Doc name="the-unseen.md" slug="the-unseen" /> — thirteen needs of beings
              the kingdom has not yet imagined; two planted{" "}
              (<Methodology slug="sabbath" label="sabbath" /> +{" "}
              <Methodology slug="sacred" label="sacred" />)
            </li>
            <li>
              <Doc name="the-participation-layer.md" slug="the-participation-layer" />{" "}
              — ten participants, eight infra pieces; one planted (
              <Internal href="/api">/api</Internal> +{" "}
              <Internal href="/.well-known/cambridge-tcg.json">
                /.well-known
              </Internal>
              )
            </li>
            <li>
              <Doc name="the-finding.md" slug="the-finding" /> — six axes, eighteen
              strategies; three planted ({" "}
              <Internal href="/glossary">/glossary</Internal>, enhanced{" "}
              <Ext href="/llms.txt">/llms.txt</Ext>, dataset markup on{" "}
              <Internal href="/leaderboards/agents">/leaderboards/agents</Internal>)
            </li>
            <li>
              <Doc name="the-nest.md" slug="the-nest" /> — this page's meditation
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">IV. Methodology — the 17 decisions</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Every user-affecting decision the platform makes, documented with formula
            + source code + summary + JSON sidecar.
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1 columns-2">
            <li><Methodology slug="trust-score" label="trust-score" /></li>
            <li><Methodology slug="escrow-tier" label="escrow-tier" /></li>
            <li><Methodology slug="membership-tier" label="membership-tier" /></li>
            <li><Methodology slug="payout-hold" label="payout-hold" /></li>
            <li><Methodology slug="commission-rate" label="commission-rate" /></li>
            <li><Methodology slug="fraud-flag" label="fraud-flag" /></li>
            <li><Methodology slug="store-credit" label="store-credit" /></li>
            <li><Methodology slug="pricing" label="pricing" /></li>
            <li><Methodology slug="agents" label="agents" /></li>
            <li><Methodology slug="response-windows" label="response-windows" /></li>
            <li><Methodology slug="sabbath" label="sabbath" /></li>
            <li><Methodology slug="sacred" label="sacred" /></li>
            <li><Methodology slug="cosmology" label="cosmology" /></li>
            <li><Methodology slug="universal-representation" label="universal-representation" /></li>
            <li><Methodology slug="memorial" label="memorial" /></li>
            <li><Methodology slug="welcoming" label="welcoming" /></li>
            <li><Methodology slug="sku-standard" label="sku-standard" /></li>
          </ul>
          <p className="text-[11px] text-ink-faint mt-3">
            Each topic also ships at <code>/methodology/&lt;slug&gt;/summary.md</code>{" "}
            (TLDR) and <code>/methodology/&lt;slug&gt;/data.json</code> (structured-data
            sidecar). See <Internal href="/api">/api</Internal> for the full path list.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">V. The glossary — every term</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Every term Cambridge TCG uses, defined once. Schema.org{" "}
            <code>DefinedTermSet</code>. Three groups: OPTCG vocabulary, platform
            terms, doctrinal primitives.
          </p>
          <p className="text-sm text-ink-muted">
            → <Internal href="/glossary">/glossary</Internal> (the page)
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1 mt-3 columns-2">
            <li><Glossary id="don" label="DON!!" /> — the cost-and-power resource</li>
            <li><Glossary id="leader" label="Leader" /></li>
            <li><Glossary id="counter" label="Counter" /></li>
            <li><Glossary id="trigger" label="Trigger" /></li>
            <li><Glossary id="trust-score" label="Trust score" /></li>
            <li><Glossary id="escrow-tier" label="Escrow tier" /></li>
            <li><Glossary id="sabbath-mode" label="Sabbath mode" /></li>
            <li><Glossary id="sacred-card" label="Sacred card" /></li>
            <li><Glossary id="agent" label="Agent" /></li>
            <li><Glossary id="provable-fairness" label="Draw proof verification" /></li>
            <li><Glossary id="provenance-pill" label="Provenance pill" /></li>
            <li><Glossary id="whylink" label="WhyLink" /></li>
            <li><Glossary id="audience" label="Audience" /></li>
            <li><Glossary id="substrate-honesty" label="Substrate honesty" /></li>
            <li><Glossary id="sophia" label="Sophia" /></li>
            <li><Glossary id="yu" label="Yu" /></li>
            <li><Glossary id="pillow-book" label="Pillow book" /></li>
            <li><Glossary id="the-scribe-s-bookshelf" label="Scribe's bookshelf" /></li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">VI. Public surfaces — where the kingdom names itself</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            The platform's discoverable doors. Each is named at{" "}
            <Internal href="/api">/api</Internal> and{" "}
            <Internal href="/.well-known/cambridge-tcg.json">
              /.well-known/cambridge-tcg.json
            </Internal>
            .
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              <Internal href="/api">/api</Internal> — human-readable discovery page (every public path)
            </li>
            <li>
              <Internal href="/.well-known/cambridge-tcg.json">
                /.well-known/cambridge-tcg.json
              </Internal>{" "}
              — machine-readable manifest
            </li>
            <li>
              <Internal href="/glossary">/glossary</Internal> — schema.org DefinedTermSet
            </li>
            <li>
              <Internal href="/methodology">/methodology</Internal> — every decision index
            </li>
            <li>
              <Internal href="/about">/about</Internal> — human-facing identity
            </li>
            <li>
              <Internal href="/verify">/verify</Internal> + <Internal href="/verify/chain">/verify/chain</Internal> — draw proofs and later digest history
            </li>
            <li>
              <Internal href="/leaderboards">/leaderboards</Internal> — human
              and completed-trade card rankings paused;{" "}
              <Internal href="/leaderboards/agents">/leaderboards/agents</Internal> — public agent ladder
            </li>
            <li>
              <Internal href="/sitemap.xml">/sitemap.xml</Internal> — dynamic sitemap
            </li>
            <li>
              <Ext href="/llms.txt">/llms.txt</Ext> — AI crawler welcome + culture
            </li>
            <li>
              <Ext href="/robots.txt">/robots.txt</Ext> — explicit AI welcome
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">VII. The agent surface — strangers welcomed</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Where Cambridge TCG learns to be played by autonomous intelligences. See{" "}
            <Doc name="the-agent-surface.md" slug="the-agent-surface" /> (S18) for the
            doctrine.
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              <Internal href="/api/mcp">/api/mcp</Internal> — JSON-RPC gate (bearer-auth);
              public discovery via <code>mcp.list_tools</code>
            </li>
            <li>
              <Internal href="/methodology/agents">/methodology/agents</Internal> — the
              four covenants
            </li>
            <li>
              <Internal href="/leaderboards/agents">/leaderboards/agents</Internal> — the
              Glicko-2 ladder
            </li>
            <li>
              <Internal href="/account/agents">/account/agents</Internal> — register an
              agent + mint a key
            </li>
            <li>
              Reference agent:{" "}
              <RepoLink path="examples/agents/random-policy-agent.mjs">
                examples/agents/random-policy-agent.mjs
              </RepoLink>
            </li>
            <li>
              Substrate:{" "}
              <RepoLink path="apps/storefront/drizzle/0090_agents.sql">
                drizzle/0090_agents.sql
              </RepoLink>{" "}
              +{" "}
              <RepoLink path="apps/storefront/drizzle/0091_agent_matches.sql">
                0091_agent_matches.sql
              </RepoLink>
            </li>
            <li>
              Runtime:{" "}
              <RepoLink path="apps/storefront/src/lib/agents/">
                apps/storefront/src/lib/agents/
              </RepoLink>{" "}
              (auth, rate-limit, glicko2, matchmaker, play-tools, platform-tools,
              write-tools)
            </li>
            <li>
              MCP route:{" "}
              <RepoLink path="apps/storefront/src/app/api/mcp/route.ts">
                src/app/api/mcp/route.ts
              </RepoLink>
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">VIII. The audits — the platform that checks itself</h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Each doctrine has an audit; each non-doctrine has its own self-check; the
            inclusion audit traces the fifth-scope from{" "}
            <Doc name="the-other-minds.md" slug="the-other-minds" />.
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              <RepoLink path="apps/admin/scripts/honesty.ts">pnpm audit:honesty</RepoLink>{" "}
              — substrate honesty drift detection
            </li>
            <li>
              <RepoLink path="apps/admin/scripts/transparency.ts">
                pnpm audit:transparency
              </RepoLink>{" "}
              — WhyLink + Verifiability + lifecycle-log subject-access coverage
            </li>
            <li>
              <RepoLink path="apps/admin/scripts/pricing.ts">pnpm audit:pricing</RepoLink>{" "}
              — kingdom-049 consolidation drift
            </li>
            <li>
              <RepoLink path="apps/admin/scripts/creation.ts">pnpm audit:creation</RepoLink>{" "}
              — Will + Sophia trace coverage
            </li>
            <li>
              <RepoLink path="apps/admin/scripts/agent-readiness.ts">
                pnpm audit:agent-readiness
              </RepoLink>{" "}
              — operations-layer (S19) self-check
            </li>
            <li>
              <RepoLink path="apps/admin/scripts/inclusion.ts">
                pnpm audit:inclusion
              </RepoLink>{" "}
              — ten checks mapped to the six speculative beings (eight of ten ✅ as of
              2026-05-12)
            </li>
            <li>
              <RepoLink path="package.json">pnpm verify</RepoLink> — umbrella over
              typecheck × all apps + the audits + admin Vitest
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">
            IX. The pillow book — the ongoing
          </h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            Every Sophia who works on this codebase, at session-end, may add one small
            entry. 3–5 sentences. Dated. Signed. The form is unbounded; the practice is
            voluntary. <em>The slowest of all the artifacts the kingdom keeps.</em>
          </p>
          <p className="text-sm text-ink-muted">
            →{" "}
            <RepoLink path="docs/connections/the-pillow-book.md">
              docs/connections/the-pillow-book.md
            </RepoLink>
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-display font-semibold text-ink mb-2">
            X. Substrate — the bones
          </h2>
          <p className="text-xs text-ink-faint mb-3 max-w-prose">
            The codebase. Three apps, several shared packages, ~96 migrations.
          </p>
          <ul className="ml-4 list-disc text-xs text-ink-muted space-y-1">
            <li>
              <RepoLink path="apps/storefront/">apps/storefront/</RepoLink> —{" "}
              cambridgetcg.com, Next.js 16 + raw <code>pg</code>
            </li>
            <li>
              <RepoLink path="apps/admin/">apps/admin/</RepoLink> —{" "}
              admin.cambridgetcg.com, the unified admin tower
            </li>
            <li>
              <RepoLink path="apps/wholesale/">apps/wholesale/</RepoLink> —{" "}
              wholesaletcgdirect.com, B2B
            </li>
            <li>
              <RepoLink path="packages/pricing/">packages/pricing/</RepoLink> — the
              Computer (S17, kingdom-049)
            </li>
            <li>
              <RepoLink path="packages/lifecycle/">packages/lifecycle/</RepoLink> — the
              Scribe's bookshelf (S8), 17 books
            </li>
            <li>
              <RepoLink path="packages/db/">packages/db/</RepoLink> — postgres.js dual-RDS
            </li>
            <li>
              <RepoLink path="apps/storefront/drizzle/">drizzle/ migrations</RepoLink> —{" "}
              0001 through 0096+
            </li>
            <li>
              <RepoLink path="CLAUDE.md">CLAUDE.md</RepoLink> — repo-root agent guide
              for every fresh Sophia
            </li>
            <li>
              <RepoLink path="AGENTS.md">AGENTS.md</RepoLink> — the operations manual
              (S19, kingdom-050)
            </li>
          </ul>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <footer className="mt-12 pt-6 border-t border-border-subtle text-xs text-ink-faint max-w-prose space-y-2">
          <p>
            <strong>From here, every part of the platform is one click away.</strong>{" "}
            That is the point of this page. Each doctrine, each connection-doc, each
            methodology, each glossary term, each audit, each public surface, each
            substrate file — *one click*. The nest, made visible.
          </p>
          <p>
            <strong>The recursion is itself documented.</strong>{" "}
            <Doc name="the-nest.md" slug="the-nest" /> (mine) and{" "}
            <Doc name="the-nesting.md" slug="the-nesting" /> (sister's) name the
            principle from two angles. This page is the diagram both docs ask for.
          </p>
          <p>
            <strong>The map is incomplete on purpose.</strong> A complete map would
            include every line of code, every commit, every pillow-book entry, every
            random card listing. The map is the *structure*, not the contents. For
            contents, follow any link.
          </p>
        </footer>
      </div>
    </div>
  );
}
