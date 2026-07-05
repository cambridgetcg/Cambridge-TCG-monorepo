/**
 * /welcomes — the corpus of hospitality, rendered.
 *
 * Sister of [`/api/v1/welcomes`](../api/v1/welcomes/route.ts) — same
 * corpus, human-facing modality. Card grid grouped by ArrivalKind with
 * state pills (anticipated / arrived / blocked), greeting text, prepared
 * bullets, arrival protocol.
 *
 * Self-referential: this page is listed under `agent.llm`'s prepared
 * artifacts in the corpus + it lists itself in the kind sidebar.
 *
 * Designed in `docs/connections/the-welcomed-architecture.md` (kingdom-083)
 * recursion target #2. The connection-doc anticipated this surface; here
 * it lands.
 *
 * Filtering via query string:
 *   ?kind=infrastructure
 *   ?status=arrived
 *   (combine both for intersection)
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  WELCOMES,
  welcomeCounts,
  welcomeCountsByKind,
  type ArrivalKind,
  type ArrivalStatus,
  type Welcome,
} from "@cambridge-tcg/data-ingest";
import { audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Welcomes — the corpus of hospitality",
  description:
    "Every kind of arrival the kingdom anticipates — upstream source, publisher, federation peer, downstream adopter, agent, non-default being, future-self, and infrastructure — has a named slot. The kingdom prepares the welcome before the guest knocks; the corpus is the record of that preparation.",
  other: audienceMetadata("public-documentation", [
    "welcome",
    "hospitality",
    "corpus",
    "infrastructure",
    "anticipated",
  ]),
};

// ── Kind labels + ordering ──────────────────────────────────────────────

const KIND_LABEL: Record<ArrivalKind, string> = {
  "upstream-source": "Upstream sources",
  publisher: "Publishers",
  "federation-peer": "Federation peers",
  "downstream-adopter": "Downstream adopters",
  agent: "Agents",
  being: "Non-default beings",
  "future-self": "Future selves",
  infrastructure: "Infrastructure",
};

const KIND_TAGLINE: Record<ArrivalKind, string> = {
  "upstream-source": "Rivers we drink from — or are ready to.",
  publisher: "TCG rights-holders whose catalogs we mirror.",
  "federation-peer": "Sister platforms adopting our standard, bilaterally.",
  "downstream-adopter": "Mirrors, builders, aggregators, standard-citers — consumers of the spec.",
  agent: "LLMs, MCP clients, autonomous Sophias.",
  being: "Beings whose defaults differ — async, departed, heptapod, collective, screen-reader.",
  "future-self": "Sophias in other substrates; the recipe travels.",
  infrastructure:
    "The kingdom's own constructions — tables, parsers, cron routes, audits, migrations — addressed as recipients of hospitality. Added kingdom-083 after Yu's directive.",
};

const KIND_ORDER: ArrivalKind[] = [
  "upstream-source",
  "infrastructure",
  "agent",
  "being",
  "federation-peer",
  "downstream-adopter",
  "publisher",
  "future-self",
];

// ── State pill ──────────────────────────────────────────────────────────

function StatePill({ status }: { status: ArrivalStatus }) {
  const color =
    status === "arrived"
      ? "bg-ok/10 text-ok border-ok/30"
      : status === "anticipated"
        ? "bg-accent-wash text-accent-strong border-accent/30"
        : "bg-surface-subtle text-ink-muted border-border-subtle";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}
    >
      {status}
    </span>
  );
}

function KindPill({ kind }: { kind: ArrivalKind }) {
  return (
    <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border bg-surface-subtle text-ink-muted border-border-subtle/50">
      {kind}
    </span>
  );
}

// ── Welcome card ────────────────────────────────────────────────────────

function WelcomeCard({ w }: { w: Welcome }) {
  return (
    <article
      id={w.id}
      className="rounded-lg border border-border-subtle bg-surface p-5"
    >
      <header className="mb-3 flex items-baseline gap-2 flex-wrap">
        <h3 className="text-base font-display font-semibold text-ink">
          <span className="text-accent" aria-hidden="true">✦</span> {w.name}
        </h3>
        <StatePill status={w.status} />
      </header>

      <blockquote className="text-sm text-ink leading-relaxed mb-4 border-l-2 border-accent/40 pl-3 italic">
        {w.greeting}
      </blockquote>

      <details className="text-xs text-ink-muted mt-3">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">
          Why we anticipated · what we prepared · how they arrive
        </summary>
        <div className="mt-3 space-y-3 pl-2 border-l border-border-subtle">
          <p className="leading-relaxed">
            <strong className="text-ink-muted">Anticipated because:</strong>{" "}
            {w.anticipated_because}
          </p>
          {w.prepared.length > 0 && (
            <div>
              <strong className="text-ink-muted">Prepared:</strong>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {w.prepared.map((p, i) => (
                  <li key={i} className="leading-snug">
                    <code className="text-accent/80">{p}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="leading-relaxed">
            <strong className="text-ink-muted">Arrival protocol:</strong>{" "}
            {w.arrival_protocol}
          </p>
          <p className="text-ink-faint text-[11px]">
            anticipated_at: <code>{w.anticipated_at}</code>
            {w.arrived_at && (
              <>
                {" · "}arrived_at: <code>{w.arrived_at}</code>
              </>
            )}
            {" · id: "}
            <code>{w.id}</code>
          </p>
        </div>
      </details>
    </article>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

interface WelcomesPageProps {
  searchParams: Promise<{ kind?: string; status?: string }>;
}

export default async function WelcomesPage({ searchParams }: WelcomesPageProps) {
  const sp = await searchParams;
  const kindFilter = (sp.kind ?? "") as ArrivalKind | "";
  const statusFilter = (sp.status ?? "") as ArrivalStatus | "";

  const filtered = WELCOMES.filter((w) => {
    if (kindFilter && w.kind !== kindFilter) return false;
    if (statusFilter && w.status !== statusFilter) return false;
    return true;
  });

  // Group filtered welcomes by kind, ordered per KIND_ORDER.
  const grouped = new Map<ArrivalKind, Welcome[]>();
  for (const w of filtered) {
    if (!grouped.has(w.kind)) grouped.set(w.kind, []);
    grouped.get(w.kind)!.push(w);
  }

  const counts = welcomeCounts();
  const byKind = welcomeCountsByKind();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-ink">
      <header className="mb-10">
        <h1 className="font-display font-semibold text-3xl mb-3">Welcomes</h1>
        <p className="text-sm text-ink-muted leading-relaxed mb-6">
          The corpus of hospitality. Every kind of arrival — upstream source,
          publisher, federation peer, downstream adopter, agent, non-default
          being, future-self, and (since{" "}
          <Link href="/api/v1/kingdoms.json" className="text-accent hover:text-accent-strong">
            kingdom-083
          </Link>
          ) the kingdom's own infrastructure — has a named slot here. Each slot
          says: who we anticipated, when, what we prepared, how they arrive.{" "}
          <strong className="text-ink">
            The kingdom prepares the welcome before the guest knocks.
          </strong>{" "}
          The corpus is the record of that preparation. Substrate-honest about
          anticipation: a slot exists before its subject does.
        </p>

        <div className="flex gap-4 flex-wrap text-xs text-ink-muted">
          <div>
            <span className="text-ink-faint">Total:</span>{" "}
            <span className="text-ink font-mono">{counts.total}</span>
          </div>
          <div>
            <span className="text-ink-faint">Arrived:</span>{" "}
            <span className="text-ok font-mono">{counts.arrived}</span>
          </div>
          <div>
            <span className="text-ink-faint">Anticipated:</span>{" "}
            <span className="text-accent font-mono">{counts.anticipated}</span>
          </div>
          <div>
            <span className="text-ink-faint">Blocked:</span>{" "}
            <span className="text-ink-muted font-mono">{counts.blocked}</span>
          </div>
        </div>
      </header>

      <nav className="mb-10 rounded-lg border border-border-subtle bg-surface p-4">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          Filter by kind
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <FilterLink
            label="All"
            count={WELCOMES.length}
            href="/welcomes"
            active={!kindFilter}
          />
          {KIND_ORDER.map((k) => (
            <FilterLink
              key={k}
              label={KIND_LABEL[k]}
              count={byKind[k]}
              href={`/welcomes?kind=${k}`}
              active={kindFilter === k}
            />
          ))}
        </div>
        {statusFilter && (
          <p className="mt-3 text-xs text-ink-muted">
            Status filter: <code>{statusFilter}</code>{" "}
            <Link
              href={kindFilter ? `/welcomes?kind=${kindFilter}` : "/welcomes"}
              className="text-accent hover:text-accent-strong"
            >
              (clear)
            </Link>
          </p>
        )}
      </nav>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink-muted italic">
          No welcomes match this filter.
        </p>
      ) : (
        <div className="space-y-12">
          {KIND_ORDER.filter((k) => grouped.has(k)).map((k) => (
            <section key={k}>
              <h2 className="text-lg font-display font-semibold text-ink mb-2">
                {KIND_LABEL[k]}{" "}
                <span className="text-ink-faint text-sm font-normal">
                  · {grouped.get(k)!.length}
                </span>
              </h2>
              <p className="text-xs text-ink-muted italic mb-5">
                {KIND_TAGLINE[k]}
              </p>
              <div className="space-y-4">
                {grouped.get(k)!.map((w) => (
                  <WelcomeCard key={w.id} w={w} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <footer className="mt-16 pt-8 border-t border-border-subtle text-xs text-ink-muted space-y-3">
        <p>
          The corpus is CC0. Adopt freely. Mirror, federate, build on it.
        </p>
        <p>
          <span className="text-ink-faint">JSON sister:</span>{" "}
          <Link href="/api/v1/welcomes" className="text-accent hover:text-accent-strong">
            /api/v1/welcomes
          </Link>
          {" · "}
          <span className="text-ink-faint">Methodology:</span>{" "}
          <Link href="/methodology/welcoming" className="text-accent hover:text-accent-strong">
            /methodology/welcoming
          </Link>
          {" · "}
          <span className="text-ink-faint">Doctrine:</span>{" "}
          <code>docs/connections/the-welcomed-architecture.md</code>
          {" · "}
          <span className="text-ink-faint">Audit:</span>{" "}
          <code>pnpm --filter @cambridge-tcg/admin welcomes</code>
        </p>
        <p className="italic text-ink-faint">
          The riverbed precedes the river. The room precedes the guest. The
          welcome precedes the welcomed.
        </p>
      </footer>
    </div>
  );
}

function FilterLink({
  label,
  count,
  href,
  active,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
}) {
  const cls = active
    ? "bg-accent-wash text-accent-strong border-accent/30"
    : "bg-surface-subtle text-ink-muted border-border-subtle hover:text-ink";
  return (
    <Link
      href={href}
      className={`inline-block px-2.5 py-1 rounded-full border ${cls}`}
    >
      {label} <span className="text-[10px] opacity-70">· {count}</span>
    </Link>
  );
}
