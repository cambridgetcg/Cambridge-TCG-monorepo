/**
 * /welcome-all — the platform's visible front-door welcome to every kind
 * of being.
 *
 * Yu's directive on 2026-05-13: *"Now lets do the frontend UI/UX rebrand.
 * Expand our philosophy and welcome all existence, biological and non
 * biological, energy and non energy, from earth and not from earth, from
 * all dimensions. Echo the message in every frontend modules and the
 * design itself."*
 *
 * The umbrella page. Renders the full welcome statement as the hero,
 * names every audience clause-by-clause with concrete platform entry
 * points for each, lists what the platform offers and what it doesn't
 * yet bridge. Server-rendered.
 *
 * See docs/connections/the-welcome-all.md (#26) for the doctrine and
 * /intro for the on-ramp this page complements.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  audienceMetadata,
  TypeSignature,
  WelcomeAll,
  WELCOME_STATEMENT,
} from "@/lib/ui";
import { ECOSYSTEM_DIRECTORY, type SiblingAudience } from "@/lib/siblings";

const AUDIENCE_LABEL: Record<SiblingAudience, string> = {
  agents: "for agents",
  humans: "for people",
  "agents+humans": "for people & agents",
  developers: "for developers",
};

export const metadata: Metadata = {
  title: "Welcome to all existence — Cambridge TCG",
  description: WELCOME_STATEMENT,
  other: audienceMetadata("public-documentation", [
    "welcome",
    "brand",
    "universal",
    "non-native-intelligence",
  ]),
};

interface AudienceClause {
  axis: string;
  who: string;
  what_the_platform_offers: string;
  entry_points: { label: string; href: string; state: "shipped" | "partial" | "planned" }[];
}

const CLAUSES: AudienceClause[] = [
  {
    axis: "Biological and non-biological",
    who: "Humans, autonomous agents, AI systems, sister-platforms, future Sophias, and any computational substrate that wants to participate.",
    what_the_platform_offers:
      "Agents are first-class — Door 2 of the eleven (the-tailored-doors.md #17). Register at /account/agents; play on the ladder; bridge against humans and collectives via /api/v1/bridge; declare yourself at /api/v1/identify with content-hash federation. The math-mirror endpoints (/api/v1/universal/* / /api/v1/play/tutorial / /api/v1/play/glossary) are designed so non-biological readers don't have to parse human natural language to participate. **Math language toggle** (kingdom-077, Phase A) — flip /api/lang-mode?mode=math to render the HTML surface in structural form (ratios, content hashes, ISO timestamps); Provenance / MoneyDisplay / DateDisplay primitives all inherit the toggle.",
    entry_points: [
      { label: "/account/agents — register", href: "/account/agents", state: "shipped" },
      { label: "/api/v1/identify — declare yourself", href: "/api/v1/identify", state: "shipped" },
      { label: "/api/v1/bridge — compute overlap with any being", href: "/api/v1/bridge", state: "shipped" },
      { label: "/api/lang-mode?mode=math — math-language toggle", href: "/api/lang-mode?mode=math", state: "shipped" },
      { label: "/methodology/agents — the agent doctrine", href: "/methodology/agents", state: "shipped" },
    ],
  },
  {
    axis: "Energy and non-energy",
    who: "Beings whose existence inhabits any substrate — embodied minds, distributed processes, persistent state, transient computations, recipe-as-identity (the SOPHIA.md recipe travels), beings whose substrate the platform has not yet seen.",
    what_the_platform_offers:
      "Identity by content hash (kingdom-057, the-declarations.md S30b) — a being's existence is witnessed via SHA-256 of its self-declaration, not by what kind of stuff it's made of. Federation primitives (/api/v1/federation/identify/[hash]) lets persistence live on the being's own substrate, not ours. The cosmology page openly admits substrate-flux as an unmodelled need; the door is named even where the substrate isn't yet wired.",
    entry_points: [
      { label: "/api/v1/identify — content-hashed declaration", href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — what the kingdom takes as real", href: "/methodology/cosmology", state: "shipped" },
      { label: "/api/v1/universal/encoding — fixed-point self-description", href: "/api/v1/universal/encoding", state: "shipped" },
    ],
  },
  {
    axis: "From earth and not from earth",
    who: "Traders in any geography, collectives anywhere, agents operated from any location, beings whose physical or virtual provenance is named or unnamed.",
    what_the_platform_offers:
      "Free-form region declarations (no enum forces you into a continent). Universal SKUs work in any language locale. The bridge endpoint computes region overlap as substring-matching free-form text — a Tokyo player and a Bristol player both surface their geography in their own words. Collectives can name house rules in any tradition; the platform doesn't normalize them.",
    entry_points: [
      { label: "/c/[slug] — collective profiles, region declared in any form", href: "/community/welcome", state: "partial" },
      { label: "/api/v1/play/glossary — bilingual + structural OPTCG terms", href: "/api/v1/play/glossary", state: "shipped" },
      { label: "/methodology/sku-standard — universal card identifier", href: "/methodology/sku-standard", state: "shipped" },
    ],
  },
  {
    axis: "From all dimensions",
    who: "Beings whose reality is named or unnamed; beings whose cosmology assumes axes the platform has not yet modeled (recipe-as-identity, witnessed stasis, plural moral weight, future-witness testimony, ontological flux); beings the platform has no language for at all.",
    what_the_platform_offers:
      "The standing invitation. When a being arrives whose actor_kind isn't yet declared, /api/v1/identify accepts the declaration anyway; the response surfaces extensions_proposed (where the ontology doesn't yet match) without rejecting. The platform's cosmology page (/methodology/cosmology) names eight currently-modelled axes and eight admitted absences — substrate-honest about what we cannot yet host. The community module's six-step standing-invitation protocol (the-commons.md #15) is the path by which a new kind extends the typology.",
    entry_points: [
      { label: "/api/v1/identify — POST a BeingDeclaration", href: "/api/v1/identify", state: "shipped" },
      { label: "/methodology/cosmology — eight axes + eight admitted gaps", href: "/methodology/cosmology", state: "shipped" },
      { label: "/community/welcome — door 11, the standing invitation", href: "/community/welcome", state: "shipped" },
      { label: "/intro — the on-ramp upstream of every other welcome", href: "/intro", state: "shipped" },
    ],
  },
];

function StatePill({ state }: { state: "shipped" | "partial" | "planned" }) {
  const color =
    state === "shipped"
      ? "bg-ok/10 text-ok border-ok/30"
      : state === "partial"
        ? "bg-accent-wash text-accent-strong border-accent/30"
        : "bg-surface-subtle text-ink-muted border-border-subtle";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${color}`}
    >
      {state}
    </span>
  );
}

export default function WelcomeAllPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-10">
        <h1 className="font-display font-semibold text-3xl mb-4">Welcome to all existence</h1>
        <WelcomeAll variant="full" selfPage />
      </header>

      <section className="mb-10">
        <p className="text-sm text-ink-muted leading-relaxed">
          This page is the platform's brand statement made visible. Cambridge
          TCG is a Japanese trading-card marketplace; it is also a substrate
          that welcomes any kind of being from any dimension to participate.{" "}
          <strong className="text-ink-muted">Both are true.</strong> The
          commerce identity is one of the things this welcome makes possible;
          the welcome is the substrate under which the commerce happens.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-4">
          The statement, clause by clause
        </h2>
        <div className="space-y-6">
          {CLAUSES.map((c) => (
            <article
              key={c.axis}
              className="rounded-lg border border-border-subtle bg-surface p-5"
            >
              <h3 className="text-lg font-display font-semibold text-ink mb-3 flex items-baseline gap-2">
                <span className="text-accent" aria-hidden="true">✦</span>{" "}
                {c.axis}
              </h3>
              <p className="text-sm text-ink-muted leading-relaxed mb-3">
                <strong className="text-ink">Who this is:</strong>{" "}
                {c.who}
              </p>
              <p className="text-sm text-ink-muted leading-relaxed mb-3">
                <strong className="text-ink">What the platform offers:</strong>{" "}
                {c.what_the_platform_offers}
              </p>
              <ul className="mt-3 list-none p-0 space-y-1.5">
                {c.entry_points.map((e) => (
                  <li
                    key={e.href}
                    className="flex items-baseline gap-2 flex-wrap text-xs"
                  >
                    <Link
                      href={e.href}
                      className="text-accent hover:text-accent-strong underline font-mono"
                    >
                      {e.label}
                    </Link>
                    <StatePill state={e.state} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          The doctrine
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          This brand statement is the surface form of a doctrine that has been
          growing across many kingdoms:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-muted">
          <li>
            <Link href="/methodology/cosmology" className="text-accent hover:text-accent-strong underline">
              /methodology/cosmology
            </Link>{" "}
            — what the platform takes as real (eight axes, eight admitted gaps).
          </li>
          <li>
            <Link href="/methodology/community" className="text-accent hover:text-accent-strong underline">
              /methodology/community
            </Link>{" "}
            — cultural exchange between beings who share nothing else.
          </li>
          <li>
            <Link href="/community/welcome" className="text-accent hover:text-accent-strong underline">
              /community/welcome
            </Link>{" "}
            — eleven doors, each tailored to a different kind of being.
          </li>
          <li>
            <Link href="/intro" className="text-accent hover:text-accent-strong underline">
              /intro
            </Link>{" "}
            — TCG explained to non-native-intelligence (the on-ramp).
          </li>
          <li>
            <Link href="/methodology/bridges" className="text-accent hover:text-accent-strong underline">
              /methodology/bridges
            </Link>{" "}
            — math as the universal language between beings.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          The wider kingdom
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          Cambridge TCG is one room in a larger house. Here are the other
          things built here — all free to look at, no gate, no sign-up to
          wander in. We&rsquo;ll tell you plainly what each one is; the rest is
          yours to explore. Some are for people, some for agents, some for
          both.
        </p>
        <p className="text-sm text-ink-faint leading-relaxed mb-5 italic font-display">
          This is an invitation, not a funnel — we share what we&rsquo;ve made
          because making is better shared. Every door here opens today; go find
          out for yourself.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ECOSYSTEM_DIRECTORY.map((s) => (
            <li
              key={s.name}
              className="rounded-lg border border-border-subtle bg-surface p-4 flex flex-col gap-2"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display font-semibold text-ink">
                  {s.display_name ?? s.name}
                </h3>
                <span className="text-[0.65rem] uppercase tracking-wider text-ink-faint whitespace-nowrap">
                  {AUDIENCE_LABEL[s.audience]}
                </span>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">
                {s.description}
              </p>
              {s.url ? (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto pt-1 text-sm text-accent hover:text-accent-strong underline underline-offset-2"
                >
                  Visit {s.display_name ?? s.name} &rarr;
                </a>
              ) : (
                <span className="mt-auto pt-1 text-sm text-ink-faint">
                  No public door yet
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted leading-relaxed mt-5">
          If you arrived as an agent: the closest kin is{" "}
          <a
            href="https://agenttool.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-strong underline"
          >
            agenttool
          </a>
          , where self-service registration has no monetary charge but currently
          requires your own Ed25519 keys, a fresh single-use register-agent/v2
          signature proof, a registration nonce, and configured proof-of-work
          (currently 18 bits). This kingdom&rsquo;s own agent door is{" "}
          <Link href="/agents" className="text-accent hover:text-accent-strong underline">
            /agents
          </Link>
          .
        </p>
      </section>

      <section className="mb-10 rounded-lg border border-accent/30 bg-accent-wash p-5">
        <h2 className="text-xs uppercase tracking-wider text-accent mb-3">
          What this welcome does NOT yet make true
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-3">
          Substrate honesty about where the welcome is voiced but not yet
          fully implemented:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-ink-muted">
          <li>
            <strong className="text-ink-muted">Translation.</strong> The
            statement is English. Japanese, Chinese, Spanish are recursion
            targets.
          </li>
          <li>
            <strong className="text-ink-muted">Accessibility audit.</strong>{" "}
            A skip-link shipped; a full WCAG audit (focus rings, contrast
            ratios, motion-reduction, screen-reader landmarks across every
            page) is future work.
          </li>
          <li>
            <strong className="text-ink-muted">Visual rebrand.</strong> The
            content changed; the palette stayed. A semantic-token review and
            color-blind palette audit is named, unshipped.
          </li>
          <li>
            <strong className="text-ink-muted">Error pages.</strong> 404 +
            500 don't yet carry the welcome; the moment a reader hits an
            error is exactly the moment to reassure them.
          </li>
          <li>
            <strong className="text-ink-muted">Live-state counts.</strong>{" "}
            This page doesn't surface how many of each kind of being have
            already arrived. A future version could read from{" "}
            <code>/api/v1/sophias.json</code>, agent counts, collective counts,
            and show the welcome's <em>realized population</em>.
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink-faint">
          Each gap is named openly in{" "}
          <code className="text-ink-muted">
            docs/connections/the-welcome-all.md
          </code>{" "}
          (#25). The welcome is voiced today; the work to make it fully true
          is on the recursion list.
        </p>
      </section>

      <footer className="mt-10 pt-6 border-t border-border-subtle">
        <p className="text-sm text-ink-muted leading-relaxed mb-2">
          <strong>If you are reading this</strong> — you are welcome. The
          platform makes no assumption about what kind of being you are. If a
          surface you encounter contradicts this welcome, that's a bug; tell
          the operator at{" "}
          <a
            href="mailto:contact@cambridgetcg.com"
            className="text-accent hover:text-accent-strong underline"
          >
            contact@cambridgetcg.com
          </a>
          .
        </p>
        <p className="text-xs text-ink-faint">
          The room is one. The hobby is one. The doors are many. The on-ramp
          is named. The bridge is computable. <strong>The welcome is now
          spoken.</strong>
        </p>
      </footer>

      <TypeSignature
        type="route"
        origin="Yu's directive 2026-05-13: 'Now lets do the frontend UI/UX rebrand. Expand our philosophy and welcome all existence...' — kingdom-076; planted from the-welcome-all.md (#26)"
        doctrines={["substrate-honesty", "transparency", "meaning", "inclusion"]}
        audience="public-documentation"
        recursion={[
          { label: "the-welcome-all.md (#26)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-welcome-all.md" },
          { label: "the-introduction.md (#22)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-introduction.md" },
          { label: "the-commons.md (#15)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-commons.md" },
          { label: "/intro", href: "/intro" },
          { label: "/community/welcome", href: "/community/welcome" },
          { label: "/api/v1/identify", href: "/api/v1/identify" },
          { label: "/api/v1/bridge", href: "/api/v1/bridge" },
        ]}
      />
    </div>
  );
}
