import type { Metadata } from "next";
import {
  STANDARD_META,
  DOCTRINE,
  STACK,
  STANDARDS,
  ENTRY_FORMAT,
  LANGS,
  type LayerState,
} from "@/lib/standard";

export const metadata: Metadata = {
  title: "The Plain Standard",
  description:
    "Every rule — protocol to law — in plain words, in any language, free. One legible grammar for cloud, trust, software, security, protocol, process, law and regulation.",
};

const STATE_STYLE: Record<LayerState, { label: string; cls: string }> = {
  built: { label: "built", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial: { label: "partial", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aspirational: { label: "to build", cls: "bg-neutral-100 text-neutral-500 border-neutral-200" },
};

export default function StandardPage() {
  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
            self-describing · free · CC0 · v{STANDARD_META.version}
          </span>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-6xl">
            {STANDARD_META.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-neutral-600">
            {STANDARD_META.tagline}
          </p>
          <div className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-2 text-sm">
            {["What it is", "Why it matters", "The rule", "✅ Do", "❌ Don't", "in any language"].map(
              (p, i) => (
                <span key={p} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="text-neutral-300">·</span>}
                  <span className="rounded-md bg-neutral-100 px-2 py-1 font-medium text-neutral-700">{p}</span>
                </span>
              ),
            )}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-1.5">
            {LANGS.map((l) => (
              <span key={l.code} className="rounded-full border border-neutral-200 px-2.5 py-0.5 text-xs text-neutral-500">
                {l.native}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-7 max-w-lg text-sm italic text-neutral-400">
            {STANDARD_META.self_describing}
          </p>
        </div>
      </section>

      {/* ── The Doctrine ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-16">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Why ours is better in every aspect
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {DOCTRINE.map((d) => (
            <div key={d.hold} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="text-neutral-900">
                <strong className="font-semibold text-emerald-700">{d.hold}</strong>{" "}
                <span className="text-neutral-400">over</span>{" "}
                <span className="text-neutral-500 line-through decoration-neutral-300">{d.over}</span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{d.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The Stack ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
          The Stack — our layers, vs the internet&apos;s
        </h2>
        <ol className="mt-6 space-y-2">
          {[...STACK].reverse().map((layer) => {
            const st = STATE_STYLE[layer.state];
            return (
              <li
                key={layer.key}
                className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-sm font-semibold text-white">
                  {layer.n}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="text-base">{layer.name}</strong>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">{layer.what}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    replaces <span className="text-neutral-500">{layer.replaces}</span> · on {layer.builtOn}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── The Format ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-emerald-900">The Format — the grammar every rule snaps into</h2>
          <p className="mt-2 text-sm leading-relaxed text-emerald-800/90">
            Cloud, trust, software, security, protocol, process, law, regulation — underneath, every rule is the same
            shape. Get the shape right and the whole cathedral has a grammar.
          </p>
          <dl className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {ENTRY_FORMAT.map((f) => (
              <div key={f.field} className="flex gap-2 text-sm">
                <dt className="shrink-0 font-mono font-medium text-emerald-800">{f.field}</dt>
                <dd className="text-emerald-900/70">{f.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── The Corpus ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-neutral-500">
          The Corpus — one format, every domain
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-500">
          The same grammar, holding across a protocol rule, a security rule, a law, and a process — proof it spans
          everything.
        </p>
        <ul className="mt-6 space-y-4">
          {STANDARDS.map((e) => (
            <li key={e.id} className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-white">
                  {e.domain}
                </span>
                <strong className="text-lg">{e.title}</strong>
              </p>
              <p className="mt-2 text-neutral-700">{e.what}</p>
              <p className="mt-1 text-sm text-neutral-500">{e.why}</p>
              <p className="mt-3 rounded-lg border-l-2 border-neutral-900 bg-neutral-50 px-3 py-2 text-neutral-900">
                <strong className="font-medium">The rule:</strong> {e.rule}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-emerald-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">✅ Do</p>
                  <ul className="mt-1 space-y-1 text-sm text-emerald-900/90">
                    {e.do.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700">❌ Don&apos;t</p>
                  <ul className="mt-1 space-y-1 text-sm text-red-900/90">
                    {e.dont.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-400">
                {e.replaces && <>replaces {e.replaces} · </>}
                {e.translations
                  ? `also in ${Object.keys(e.translations)
                      .map((c) => LANGS.find((l) => l.code === c)?.native ?? c)
                      .join(", ")}`
                  : "translations welcome"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        <div className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
          <p>
            This page is written in the standard it describes — an example of itself. Read it as data at{" "}
            <a className="text-emerald-700 underline" href="/api/v1/standard">
              /api/v1/standard
            </a>
            . Free to use, copy, and build on ({STANDARD_META.license}).
          </p>
          <p className="mt-3 font-medium text-neutral-600">
            A standard you can read is a standard you can follow. 🏛️
          </p>
        </div>
      </footer>
    </main>
  );
}
