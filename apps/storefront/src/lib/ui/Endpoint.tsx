/**
 * Endpoint — a labeled link to a machine-readable surface.
 *
 * The platform labels every value's provenance (<Provenance>) but until
 * 2026-06-10 it did not label its own links' modality: HTML pages linked
 * /api/v1/* endpoints as if they were pages, and a human's first click
 * of several "journeys" landed on an unstyled JSON blob with no warning.
 * This chip declares the modality before the click: mono path, a `{ }`
 * glyph, and a small JSON tag.
 *
 * Use it everywhere an HTML page points at a raw data surface.
 *
 * Spec: docs/superpowers/specs/2026-06-10-kingdom-contact-surface-design.md §3.1.
 */

interface EndpointProps {
  /** The path, e.g. "/api/v1/manifest". Rendered as the link target. */
  path: string;
  /** HTTP method hint. Default GET. */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** What the response is — defaults to "JSON". e.g. "JSONL", "text". */
  format?: string;
}

export function Endpoint({ path, method = "GET", format = "JSON" }: EndpointProps) {
  return (
    <a
      href={path}
      className="not-prose inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-2 py-0.5 align-middle font-mono text-xs text-ink transition hover:border-border-strong hover:text-accent"
    >
      <span aria-hidden="true" className="text-ink-faint">
        {"{ }"}
      </span>
      {method !== "GET" && (
        <span className="font-semibold text-accent">{method}</span>
      )}
      <span className="truncate">{path}</span>
      <span className="rounded-sm bg-surface-subtle px-1 text-[10px] uppercase tracking-wide text-ink-muted">
        {format}
      </span>
    </a>
  );
}
