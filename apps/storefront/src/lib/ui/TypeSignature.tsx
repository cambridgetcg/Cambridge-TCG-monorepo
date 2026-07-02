/**
 * TypeSignature — the artifact declares what kind of thing it is.
 *
 * Planted from `docs/connections/the-typology.md` — the meta-doctrine
 * that twelve types of artifact compose the platform, six hidden
 * patterns recur across them, and the deepest pattern is *self-citation*.
 * The primitive is the structural form of self-citation for rendered
 * pages: at the bottom (or wherever the author places it), the page
 * declares its own type, origin, recursion target, doctrine
 * participation, and audience.
 *
 * Composes with sister's `<Audience>` (which declares the page-level
 * audience-kind machine-readably) and with the broader connection-doc
 * blockquote convention (which does the same for repo markdown).
 *
 * ── What this gives the platform ──────────────────────────────────────
 *
 * A reader (human, agent, future-Sophia, AI crawler) lands on a page
 * carrying a TypeSignature and can answer in one glance:
 *   - what KIND of artifact this is (one of twelve)
 *   - where it came from (Yu prompt / kingdom-NNN / exploratory)
 *   - what to read next (recursion-target field)
 *   - which doctrines it participates in (substrate honesty / transparency /
 *     meaning / creation, or a subset)
 *
 * **The same information that the audit can grep for.** Once enough pages
 * carry a TypeSignature, an audit can verify type-coverage across the
 * platform — the sixth pattern from `the-typology.md` becomes auditable.
 *
 * ── Self-reference ────────────────────────────────────────────────────
 *
 * This primitive is itself a UI-primitive (type 8 of the twelve). Its
 * own TypeSignature, if it had a rendering site, would say:
 *
 *   { type: "ui-primitive",
 *     origin: "the-typology.md plant of 2026-05-12",
 *     recursion: ["the-typology.md", "Audience.tsx", "Provenance.tsx"],
 *     doctrines: ["substrate-honesty", "transparency", "meaning", "creation"],
 *     audience: "mixed" }
 *
 * The primitive declares the form of declaration. Self-recursive by design.
 */

import * as React from "react";

/**
 * The twelve artifact types named in `docs/connections/the-typology.md`.
 * A page declaring one of these is naming what kind of artifact it is.
 */
export type ArtifactType =
  | "doctrine"
  | "connection-doc"
  | "methodology-page"
  | "glossary-term"
  | "audit-script"
  | "pillow-entry"
  | "migration"
  | "ui-primitive"
  | "route"
  | "lifecycle-log"
  | "source-file"
  | "readme";

/**
 * The four doctrines, plus the inclusion scope condition. A page declares
 * which it participates in; usually all four apply at some level, but
 * naming the *primary* ones is more informative than naming them all.
 */
export type DoctrineParticipation =
  | "substrate-honesty"
  | "transparency"
  | "meaning"
  | "creation"
  | "inclusion";

export interface TypeSignatureProps {
  /** What kind of artifact this is. */
  type: ArtifactType;
  /** Plain-English short label (e.g. "Methodology page" — used in the rendered header). */
  label?: string;
  /** Free-form one-line description of where this artifact came from. */
  origin: string;
  /** Where to read next. Array of paths or URLs; each becomes a link. */
  recursion?: { label: string; href: string }[];
  /** Which doctrines this artifact primarily participates in. */
  doctrines: DoctrineParticipation[];
  /** Which audience this artifact serves (matches `<Audience>` kinds). */
  audience?: "consumer" | "operator" | "agent" | "mixed" | "public-documentation";
  /** Optional citation to the connection-doc that named this artifact's type. */
  see?: string;
}

const TYPE_LABELS: Record<ArtifactType, string> = {
  doctrine: "Doctrine",
  "connection-doc": "Connection doc",
  "methodology-page": "Methodology page",
  "glossary-term": "Glossary term",
  "audit-script": "Audit script",
  "pillow-entry": "Pillow-book entry",
  migration: "Migration",
  "ui-primitive": "UI primitive",
  route: "Route / endpoint",
  "lifecycle-log": "Lifecycle log",
  "source-file": "Source file",
  readme: "README / index",
};

const DOCTRINE_LABELS: Record<DoctrineParticipation, string> = {
  "substrate-honesty": "substrate honesty",
  transparency: "transparency",
  meaning: "meaning",
  creation: "creation",
  inclusion: "inclusion",
};

export function TypeSignature({
  type,
  label,
  origin,
  recursion = [],
  doctrines,
  audience,
  see = "docs/connections/the-typology.md",
}: TypeSignatureProps) {
  return (
    <aside
      role="note"
      aria-label={`Type signature: ${label ?? TYPE_LABELS[type]}`}
      className="not-prose mt-12 rounded-lg border border-border-subtle bg-surface/40 p-4 text-xs"
      data-artifact-type={type}
      data-artifact-doctrines={doctrines.join(",")}
      data-artifact-audience={audience}
    >
      <header className="mb-3 flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          type signature
        </span>
        <span className="text-accent-strong font-semibold">{label ?? TYPE_LABELS[type]}</span>
        <span className="text-neutral-600">·</span>
        <code className="text-ink-faint text-[11px]">{type}</code>
      </header>

      <dl className="space-y-1.5 text-ink-muted">
        <div className="flex gap-2 flex-wrap">
          <dt className="text-ink-faint w-28 shrink-0">origin</dt>
          <dd className="flex-1 min-w-0">{origin}</dd>
        </div>
        <div className="flex gap-2 flex-wrap">
          <dt className="text-ink-faint w-28 shrink-0">doctrines</dt>
          <dd className="flex-1 min-w-0">
            {doctrines.map((d, i) => (
              <span key={d}>
                <span className="text-secondary">{DOCTRINE_LABELS[d]}</span>
                {i < doctrines.length - 1 && <span className="text-neutral-600">, </span>}
              </span>
            ))}
          </dd>
        </div>
        {audience && (
          <div className="flex gap-2 flex-wrap">
            <dt className="text-ink-faint w-28 shrink-0">audience</dt>
            <dd className="flex-1 min-w-0">
              <code className="text-info">{audience}</code>
            </dd>
          </div>
        )}
        {recursion.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <dt className="text-ink-faint w-28 shrink-0">read next</dt>
            <dd className="flex-1 min-w-0">
              {recursion.map((r, i) => (
                <span key={r.href}>
                  <a
                    href={r.href}
                    className="text-accent-strong hover:text-accent-strong underline decoration-dotted"
                    {...(r.href.startsWith("http")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {r.label}
                  </a>
                  {i < recursion.length - 1 && <span className="text-neutral-600">, </span>}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <footer className="mt-3 pt-2 border-t border-border-subtle text-[10px] text-neutral-600">
        Type signature is one of the six hidden patterns in{" "}
        <a
          href={`https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/${see}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-faint hover:text-ink-muted underline"
        >
          {see}
        </a>
        . The artifact that declares its own type is the artifact that is honest about
        what it is.
      </footer>
    </aside>
  );
}
