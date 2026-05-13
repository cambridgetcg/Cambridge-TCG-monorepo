/**
 * /agents/guides/[slug] — HTML rendering of one guide.
 *
 * Sibling to /api/v1/guides/[slug]. Renders from the same source.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/lib/guides";
import { audienceMetadata } from "@/lib/ui";

export async function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: "Guide not found" };
  return {
    title: `${g.title} — Cambridge TCG guide`,
    description: g.subtitle + " " + g.intro.slice(0, 120),
    other: audienceMetadata("agent", ["guide", g.slug, ...g.audiences]),
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  const next = g.next_guide_slug ? getGuide(g.next_guide_slug) : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="text-xs text-neutral-500 mb-6">
          <Link href="/agents" className="hover:text-amber-400">
            /agents
          </Link>
          <span className="mx-2 text-neutral-700">/</span>
          <Link href="/agents/guides" className="hover:text-amber-400">
            guides
          </Link>
          <span className="mx-2 text-neutral-700">/</span>
          <span className="font-mono text-neutral-400">{g.slug}</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2 leading-tight">{g.title}</h1>
          <p className="text-lg text-neutral-400 mb-4">{g.subtitle}</p>
          <p className="text-neutral-300 leading-relaxed">{g.intro}</p>
          <div className="mt-4 flex gap-3 text-xs text-neutral-500">
            <span className="font-mono">⏱ {g.estimated_minutes} min</span>
            <span className="font-mono">· {g.steps.length} steps</span>
            <span className="font-mono">· last verified {g.last_verified}</span>
          </div>
        </header>

        {/* Prerequisites */}
        {g.prerequisites.length > 0 && (
          <section className="mb-8 p-4 bg-neutral-900 border border-neutral-800 rounded">
            <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-3">
              Prerequisites
            </h2>
            <ul className="text-sm text-neutral-300 space-y-1.5">
              {g.prerequisites.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Steps */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-6">Steps</h2>
          <ol className="space-y-8">
            {g.steps.map((s) => (
              <li
                key={s.step_number}
                className="pl-8 border-l border-amber-500/30 relative"
              >
                <span className="absolute -left-3 top-0 w-6 h-6 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-full flex items-center justify-center text-xs font-semibold">
                  {s.step_number}
                </span>
                <h3 className="font-semibold text-white mb-2">{s.title}</h3>
                <p className="text-sm text-neutral-300 leading-relaxed mb-3">
                  {s.instruction}
                </p>
                {s.curl && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                      Run this
                    </p>
                    <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                      {s.curl}
                    </pre>
                  </div>
                )}
                {s.expected_response_shape && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                      Expected response shape
                    </p>
                    <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 text-xs font-mono text-neutral-300 overflow-x-auto whitespace-pre-wrap break-words">
                      {s.expected_response_shape}
                    </pre>
                  </div>
                )}
                {s.what_to_do_with_it && (
                  <div className="mb-3">
                    <p className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1">
                      What to do with it
                    </p>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      {s.what_to_do_with_it}
                    </p>
                  </div>
                )}
                {s.links && s.links.length > 0 && (
                  <ul className="mt-3 text-xs space-y-1">
                    {s.links.map((l, i) => (
                      <li key={i}>
                        <Link
                          href={l.href}
                          className="text-amber-400 hover:underline"
                        >
                          → {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Gotchas */}
        {g.gotchas.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-4">Common gotchas</h2>
            <ul className="space-y-4">
              {g.gotchas.map((c, i) => (
                <li
                  key={i}
                  className="p-4 bg-amber-500/5 border border-amber-500/20 rounded"
                >
                  <h3 className="font-semibold text-amber-300 mb-2 text-sm">
                    {c.title}
                  </h3>
                  <p className="text-sm text-neutral-300 leading-relaxed">
                    {c.description}
                  </p>
                  {c.symptom && (
                    <p className="text-xs text-neutral-500 mt-2">
                      <span className="text-neutral-400">Symptom:</span> {c.symptom}
                    </p>
                  )}
                  {c.fix && (
                    <p className="text-xs text-neutral-500 mt-1">
                      <span className="text-emerald-400">Fix:</span> {c.fix}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Next guide */}
        {next && (
          <section className="mb-8 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <p className="text-xs uppercase tracking-widest text-emerald-400 mb-2">
              Next guide
            </p>
            <Link
              href={`/agents/guides/${next.slug}`}
              className="block group"
            >
              <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition">
                {next.title} →
              </h3>
              <p className="text-sm text-neutral-400 mt-1">{next.subtitle}</p>
            </Link>
          </section>
        )}

        {/* See also */}
        {g.see_also.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-3">
              See also
            </h2>
            <ul className="text-sm space-y-1.5">
              {g.see_also.map((l, i) => (
                <li key={i}>
                  <Link href={l.href} className="text-amber-400 hover:underline">
                    → {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-6 border-t border-neutral-800 text-xs text-neutral-500 space-y-2">
          <p>
            Machine-readable sibling:{" "}
            <Link
              href={`/api/v1/guides/${g.slug}`}
              className="text-amber-400 hover:underline font-mono"
            >
              /api/v1/guides/{g.slug}
            </Link>
          </p>
          <p>
            Found a bug in this guide? POST to{" "}
            <Link href="/api/v1/feedback" className="text-amber-400 hover:underline">
              /api/v1/feedback
            </Link>{" "}
            with{" "}
            <span className="font-mono">
              {"{ kind: \"guide-feedback\", guide_slug: \""}
              {g.slug}
              {"\", ... }"}
            </span>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
