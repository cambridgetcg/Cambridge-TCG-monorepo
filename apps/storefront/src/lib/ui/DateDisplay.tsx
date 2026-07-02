/**
 * <DateDisplay> — math-aware date rendering primitive.
 *
 * Phase B(3) of kingdom-077 (the-math-language.md #27). Reads the
 * `lang-mode` cookie and emits either natural-language ("5 May 2026" or
 * "3h ago") or math-mirror form ("2026-05-05T00:00:00.000Z (1746403200)")
 * when math language is active.
 *
 * Two variants via `mode` prop:
 *   - "absolute" (default): "5 Apr 2026" / "5 Apr 2026, 14:30" / ISO+epoch
 *   - "relative": "3h ago" / "in 4 days" / ISO+epoch
 *
 * Adoption: replace inline `formatDate(...)` / `formatDateTime(...)` /
 * `formatRelativeTime(...)` calls with <DateDisplay value={...} mode=...>.
 * Default visitors see no change; math visitors get the structural form.
 */

import * as React from "react";
import { dateAsMath } from "../lang-mode";
import { getLangMode } from "../lang-mode-server";
import { formatDate, formatDateTime, formatRelativeTime } from "../format";

type DateMode = "absolute" | "absolute-with-time" | "relative";

interface DateDisplayProps {
  value: string | Date | null | undefined;
  /** Which natural-language form to render in default mode. */
  mode?: DateMode;
  className?: string;
  /** When null/invalid, what to render. Default "—". */
  fallback?: string;
}

export async function DateDisplay({
  value,
  mode = "absolute",
  className = "",
  fallback = "—",
}: DateDisplayProps) {
  const lang = await getLangMode();

  if (lang === "math") {
    if (!value) {
      return (
        <code
          className={`inline-block text-[10px] font-mono tabular-nums text-ink-faint ${className}`}
          aria-label="date unavailable"
        >
          {`null`}
        </code>
      );
    }
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) {
      return (
        <code
          className={`inline-block text-[10px] font-mono tabular-nums text-danger ${className}`}
          aria-label="invalid date"
        >
          {`@invalid`}
        </code>
      );
    }
    // ARIA fallback: natural-language form so screen readers don't read
    // raw ISO/epoch. Math is visual; prose is auditory.
    const aria =
      mode === "relative"
        ? formatRelativeTime(value)
        : mode === "absolute-with-time"
          ? formatDateTime(value)
          : formatDate(value);
    return (
      <code
        className={`inline-block text-[10px] font-mono tabular-nums text-secondary px-1.5 py-0.5 rounded bg-surface/60 border border-border-subtle ${className}`}
        aria-label={aria}
      >
        {dateAsMath(d)}
      </code>
    );
  }

  // Default rendering — natural-language form.
  if (!value) return <span className={className}>{fallback}</span>;
  const text =
    mode === "relative"
      ? formatRelativeTime(value)
      : mode === "absolute-with-time"
        ? formatDateTime(value)
        : formatDate(value);
  return <span className={`font-mono tabular-nums ${className}`}>{text}</span>;
}
