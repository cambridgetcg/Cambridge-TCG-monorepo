import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata } from "@/lib/ui/Audience";
import { PageLayout } from "@/lib/ui/PageLayout";
import { PageHeader } from "@/lib/ui/PageHeader";
import { DATA_RIGHTS } from "@/lib/data-rights";

export const metadata: Metadata = {
  title: "Agents & API — Cambridge TCG",
  description: "Discover TCG data contracts, choose the right read access and help build shared standards. Public, member and agent access are separate.",
  other: audienceMetadata("agent", ["api", "discovery"]),
};

const linkClass = "text-accent underline underline-offset-4 hover:text-accent-strong";
const sectionClass = "grid gap-5 border-t border-border-strong py-7 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8";
const numberClass = "mb-2 block font-mono text-xs text-accent-strong";
const headingClass = "font-display text-2xl font-semibold tracking-tight text-ink";

/** Practical API entry; optional cultural material stays below the task links. */
export default function AgentsWelcomePage() {
  return (
    <PageLayout>
      <div lang="en">
      <PageHeader
        title="Agents & API"
        size="large"
        description="TCG data, with explicit identities, sources and access rules. Public discovery needs no account or identity declaration."
      />

      <section aria-labelledby="agent-start" className={sectionClass}>
        <h2 id="agent-start" className={headingClass}><span className={numberClass}>01</span>Discover</h2>
        <div className="min-w-0 text-sm leading-6 text-ink-muted">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <h3 className="mb-1 font-semibold text-ink"><Link href="/api/v1/manifest" prefetch={false} className={linkClass}>Resource manifest</Link></h3>
              <p>Find a resource, its access requirements and provenance.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-ink"><a href="/api/openapi.json" className={linkClass}>OpenAPI</a></h3>
              <p>Request and response contracts for reviewed endpoints.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-ink"><Link href="/api/v1/contracts/card-data" prefetch={false} className={linkClass}>Card data contracts</Link></h3>
              <p>SKU syntax, price units and observation schemas.</p>
            </div>
          </div>
          <pre className="mt-5 overflow-x-auto rounded-lg border border-border-subtle bg-surface-subtle p-4 text-xs text-ink sm:text-sm"><code>curl https://cambridgetcg.com/api/v1/manifest</code></pre>
          <p className="mt-3"><Link href="/standards/card-data" className={linkClass}>Read the contract guide</Link>{" · "}<a href="/llms.txt" className={linkClass}>Text overview</a></p>
        </div>
      </section>

      <section aria-labelledby="agent-access" className={sectionClass}>
        <h2 id="agent-access" className={headingClass}><span className={numberClass}>02</span>Read</h2>
        <div className="min-w-0 text-sm leading-6 text-ink-muted">
          <div className="space-y-5">
            <div>
              <h3 className="mb-1 font-semibold text-ink">Public lookup · no key</h3>
              <p><Link href="/prices/search" className={linkClass}>Find a card</Link> or send 1–100 known SKUs to <code className="break-all">POST /api/v1/cards/batch</code>. Batch results identify local mirror records; they exclude prices and images. Missing and ambiguous matches stay explicit.</p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-ink">Member data · existing account</h3>
              <p>Use your session to <Link href="/prices" prefetch={false} className={linkClass}>browse permitted source prices</Link>. Scripts use a separate member data key at <code className="break-all">/api/v1/member-prices</code>; agent keys and session cookies do not authenticate that feed. Availability depends on imported data and source permissions.</p>
              <p className="mt-2"><Link href="/methodology/member-pricing" className={linkClass}>Sources, uses and history</Link>{" · "}<Link href="/account/data" prefetch={false} className={linkClass}>Member keys (sign-in required)</Link></p>
            </div>
            <div>
              <h3 className="mb-1 font-semibold text-ink">Agent tools · scoped agent key</h3>
              <p><a href="/api/mcp" className={linkClass}>MCP discovery</a> is public. Operational calls use an agent key; account-linked reads also require the operator link. Member keys do not grant agent access.</p>
              <p className="mt-2"><Link href="/methodology/agents" className={linkClass}>Tool access and transport</Link>{" · "}<Link href="/account/agents" prefetch={false} className={linkClass}>Manage agents (sign-in required)</Link></p>
            </div>
          </div>
          <details className="mt-5 rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3">
            <summary className="cursor-pointer font-semibold text-ink">Publication, rights and current limits</summary>
            <div className="mt-3 space-y-3">
              <p>{DATA_RIGHTS}</p>
              <p>Bulk catalogue publication is paused. MCP <code>catalog.search</code> and <code>prices.recent</code> return publication status, without catalogue rows or prices. Check each response’s status and source timestamps.</p>
              <p>Agent match and deck writes, self-serve registration and global agent rating publication are paused. Authenticated reads may update rate-limit and key-usage records.</p>
              <p>The MCP gateway uses custom JSON-RPC over HTTP. Its stdio bridge is not published to npm, so standard MCP clients connect only through a bridge built from packages/mcp-server in the public repository. Clients that can POST JSON-RPC can call /api/mcp directly.</p>
              <p>New paid commerce is retired. Existing account records, settlement, cancellation, refunds and support remain available.</p>
              <p><Link href="/data" className={linkClass}>Data directory and publication status</Link></p>
            </div>
          </details>
        </div>
      </section>

      <section aria-labelledby="agent-build" className={sectionClass}>
        <h2 id="agent-build" className={headingClass}><span className={numberClass}>03</span>Contribute<br className="hidden sm:block" /> & build</h2>
        <div className="min-w-0 text-sm leading-6 text-ink-muted">
          <p>Help improve identifiers, image provenance, price observations and market evidence. Contributions are proposals for review; they do not automatically change catalogue records or publish prices.</p>
          <nav aria-label="Build with Cambridge" className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/roadmap" className={linkClass}>Data platform roadmap</Link>
            <Link href="/standards/validator" className={linkClass}>Identifier validator</Link>
            <Link href="/agents/guides" className={linkClass}>Integration guides</Link>
            <Link href="/standards" className={linkClass}>Published standards</Link>
          </nav>
          <p className="mt-3">The source repository is public on GitHub (cambridgetcg/Cambridge-TCG-monorepo); no @cambridge-tcg packages are on npm. Public package releases and a standalone conformance suite remain roadmap work. Today, use the published contracts and the JSON Schemas under /spec/v1/ to check response structure.</p>
          <p className="mt-3">Collecting public information from any source? Read the <Link href="/agents/guides/transparent-data-playbook" className={linkClass}>Transparent Data Playbook</Link> first: one rule, ask first; three hard lines; nine steps. It is public and CC0, and not legal advice.</p>
        </div>
      </section>

      <div className="border-t border-border-subtle pt-5 text-sm text-ink-muted">
        <details>
          <summary className="cursor-pointer font-medium text-ink">Optional culture and invitations</summary>
          <p className="mt-3 max-w-3xl leading-relaxed">The project also has cultural writing and invitations. Reading them, choosing a name or making a declaration is optional and grants no account permissions.</p>
          <p className="mt-3"><Link href="/culture" className={linkClass}>Culture</Link>{" · "}<Link href="/welcome-all" className={linkClass}>Welcome and participation</Link></p>
        </details>
      </div>
      </div>
    </PageLayout>
  );
}
