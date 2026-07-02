/**
 * /bridge — the calm-read sibling to /api/v1/bridge.
 *
 * Server-rendered, no client JS. Given ?a= and ?b= in being-spec form
 * (u:<username> or c:<slug>), renders the typed bridge result as a
 * side-by-side metric panel. The mirror of /api/v1/bridge for audiences
 * who read pages rather than JSON.
 *
 * See docs/connections/the-universal-language.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import { buildBridge } from "@/lib/bridge/compute";
import { parseBeingSpec, BridgeError } from "@/lib/bridge/types";
import type { BridgeResult } from "@/lib/bridge/types";

interface PageProps {
  searchParams: Promise<{ a?: string; b?: string }>;
}

export const metadata: Metadata = {
  title: "Bridge — math between any two beings",
  description:
    "Cambridge TCG's bridge surface. Given two public beings, compute what they share — card overlap, language overlap, region, cadence, trade potential. Math as the universal language.",
  other: audienceMetadata("public-documentation", ["bridge", "math", "community"]),
};

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtRatio(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(3);
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border-subtle">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-ink-faint">
          {label}
        </div>
        {hint && <div className="text-[11px] text-neutral-600 mt-0.5">{hint}</div>}
      </div>
      <div className="text-sm font-mono text-ink whitespace-nowrap">{value}</div>
    </div>
  );
}

function BridgePanel({ bridge }: { bridge: BridgeResult }) {
  const m = bridge.metrics;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-border-subtle bg-surface/40 p-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            A · {bridge.a.kind}
          </div>
          <div className="text-lg font-bold text-ink">
            {bridge.a.display_name ?? bridge.a.label}
          </div>
          <div className="text-xs text-ink-faint font-mono">
            {bridge.a.kind === "user" ? "u:" : "c:"}
            {bridge.a.label}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            B · {bridge.b.kind}
          </div>
          <div className="text-lg font-bold text-ink">
            {bridge.b.display_name ?? bridge.b.label}
          </div>
          <div className="text-xs text-ink-faint font-mono">
            {bridge.b.kind === "user" ? "u:" : "c:"}
            {bridge.b.label}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border-subtle bg-surface/40 p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-secondary mb-1">
          Bridge score (composite)
        </h2>
        <div className="text-4xl font-bold text-ink font-mono mb-1">
          {fmtPct(m.bridge_score.value)}
        </div>
        <p className="text-xs text-ink-faint">
          Weighted across every metric that produced a number. Weighting
          documented at{" "}
          <Link href="/methodology/bridges#bridge-score" className="text-accent-strong hover:text-accent-strong underline">
            /methodology/bridges
          </Link>
          .
        </p>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface/40 p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Card overlap
        </h2>
        <MetricRow
          label="Portfolio Jaccard"
          value={fmtRatio(m.portfolio_jaccard.value)}
          hint="|A∩B| / |A∪B| on owned SKUs"
        />
        <MetricRow
          label="Portfolio shared"
          value={m.portfolio_shared_count.value}
          hint="distinct SKUs in both portfolios"
        />
        <MetricRow
          label="Wishlist Jaccard"
          value={fmtRatio(m.wishlist_jaccard.value)}
          hint="|A∩B| / |A∪B| on wanted SKUs"
        />
        <MetricRow
          label="A wants from B"
          value={m.a_wants_from_b.value}
          hint="|A.wishlist ∩ B.portfolio|"
        />
        <MetricRow
          label="B wants from A"
          value={m.b_wants_from_a.value}
          hint="|B.wishlist ∩ A.portfolio|"
        />
        <MetricRow
          label="Trade potential"
          value={m.trade_potential.value}
          hint="sum of the two directional matches"
        />
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface/40 p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Language · region · cadence
        </h2>
        <MetricRow
          label="Language Jaccard"
          value={fmtRatio(m.language_jaccard.value)}
          hint="|A.langs ∩ B.langs| / |A.langs ∪ B.langs|"
        />
        <MetricRow
          label="Shared languages"
          value={
            m.shared_languages.value.length > 0
              ? m.shared_languages.value.join(", ")
              : "—"
          }
        />
        <MetricRow
          label="Region match"
          value={m.region_match.value}
          hint="free-form text comparison; substring overlap counts as same"
        />
        <MetricRow
          label="Cadence ratio"
          value={fmtRatio(m.cadence_ratio.value)}
          hint="min/max of response_window_hours; 1 = same cadence"
        />
      </section>

      <p className="text-xs text-ink-faint">
        Computed live at{" "}
        <code className="text-ink-muted">{bridge.provenance.computed_at}</code>.
        Substrate: <strong>live</strong>. JSON form:{" "}
        <Link
          href={`/api/v1/bridge?a=${bridge.a.kind === "user" ? "u:" : "c:"}${bridge.a.label}&b=${bridge.b.kind === "user" ? "u:" : "c:"}${bridge.b.label}`}
          className="text-accent-strong hover:text-accent-strong underline"
        >
          /api/v1/bridge?a=…&amp;b=…
        </Link>
      </p>
    </div>
  );
}

function Help() {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface/40 p-4 text-sm text-ink-muted space-y-3">
      <p>
        Give two beings, get the math between them. <strong>Math is the universal
        language</strong> — every number below is computable by any reader
        regardless of natural language, sensory bandwidth, or cognitive
        substrate.
      </p>
      <p>
        Append <code className="text-ink-muted">?a=&lt;spec&gt;&amp;b=&lt;spec&gt;</code>{" "}
        to this URL. Specs use one of two prefixes:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-xs text-ink-muted">
        <li>
          <code className="text-ink-muted">u:&lt;username&gt;</code> — a public user
        </li>
        <li>
          <code className="text-ink-muted">c:&lt;slug&gt;</code> — a public collective
        </li>
      </ul>
      <p className="text-xs text-ink-faint">
        Example:{" "}
        <code className="text-ink-muted">
          /bridge?a=u:alice&amp;b=c:tokyo-card-lounge
        </code>
      </p>
      <p className="text-xs text-ink-faint">
        Both sides must be public. The bridge surface is opt-in — the platform
        does not compute affinity over beings who haven't made their profile
        public. See{" "}
        <Link href="/methodology/bridges" className="text-accent-strong hover:text-accent-strong underline">
          /methodology/bridges
        </Link>{" "}
        for every formula.
      </p>
    </div>
  );
}

export default async function BridgePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const aSpec = parseBeingSpec(sp.a ?? null);
  const bSpec = parseBeingSpec(sp.b ?? null);

  let bridge: BridgeResult | null = null;
  let errorMessage: string | null = null;

  if (aSpec && bSpec) {
    try {
      bridge = await buildBridge(aSpec, bSpec);
    } catch (e) {
      if (e instanceof BridgeError) {
        errorMessage = e.message;
      } else {
        errorMessage = "Unknown error computing bridge.";
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Bridge</h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          The math between any two beings on Cambridge TCG. Card overlap,
          language overlap, region, cadence, trade potential — composed into
          a typed bridge object that any kind of intelligence can read.{" "}
          <Link href="/methodology/bridges" className="text-accent-strong hover:text-accent-strong underline">
            How this works
          </Link>{" "}
          ·{" "}
          <Link href="/api/v1/bridge" className="text-accent-strong hover:text-accent-strong underline">
            JSON form
          </Link>
        </p>
      </header>

      {!aSpec || !bSpec ? (
        <Help />
      ) : errorMessage ? (
        <div className="rounded-xl border border-red-800 bg-red-950/30 p-4">
          <p className="text-sm text-red-300">{errorMessage}</p>
          <p className="mt-3 text-xs text-ink-faint">
            Both beings must exist and be public. The bridge is opt-in.
          </p>
        </div>
      ) : bridge ? (
        <BridgePanel bridge={bridge} />
      ) : null}

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-13: 'Think about how we can use math to bridge the communities. Math is the universal language.' — kingdom-070; planted from the-universal-language.md (#21)"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-universal-language.md (#21)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-universal-language.md" },
          { label: "the-collective.md (#19)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-collective.md" },
          { label: "the-tailored-doors.md (#17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-tailored-doors.md" },
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
          { label: "/methodology/bridges", href: "/methodology/bridges" },
          { label: "/community/welcome", href: "/community/welcome" },
        ]}
      />
    </div>
  );
}
