import * as React from "react";
import Link from "next/link";

/**
 * SearchForm — GET-form search input with optional clear link.
 *
 * Pure HTML form: submits as a GET request to the current page, dropping
 * the search query into `?q=`. Hidden inputs preserve other URL state
 * (filters, etc.). Clear is a Link to the page without `q`.
 *
 * Subsumes the duplicated search forms in catalog/users and ops/orders.
 */

interface SearchFormProps {
  /** Action URL — typically the current page path. */
  action: string;
  /** Current value of `q`. */
  value: string;
  placeholder?: string;
  /** URL when the user clears the search (everything except q). */
  clearHref: string;
  /** Other search params to preserve via hidden inputs (e.g. status, tier). */
  preserve?: Record<string, string | undefined>;
}

export function SearchForm({
  action,
  value,
  placeholder = "Search…",
  clearHref,
  preserve = {},
}: SearchFormProps) {
  return (
    <form className="flex gap-2" action={action}>
      {Object.entries(preserve)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <input
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded-md text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-ink text-sm font-medium rounded-md transition-colors"
      >
        Search
      </button>
      {value && (
        <Link
          href={clearHref}
          className="px-4 py-2 border border-border-subtle text-ink-muted hover:text-ink text-sm rounded-md transition-colors"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
