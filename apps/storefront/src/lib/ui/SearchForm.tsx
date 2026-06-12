/**
 * SearchForm — GET-form search input with optional clear link.
 *
 * Pure HTML form: submits as a GET to the current page, putting the query
 * into ?q=. Hidden inputs preserve other URL state (filters, etc.). Clear
 * is a Link to the page without `q`. Server-renderable; no client state.
 *
 * Subsumes the half-dozen inline search-input blocks on /market,
 * /catalog, /account/portfolio/add, /account/orders.
 */

import * as React from "react";
import Link from "next/link";

interface SearchFormProps {
  /** Action URL — typically the current page path. */
  action: string;
  /** Current value of `q`. */
  value: string;
  placeholder?: string;
  /** URL when the user clears the search (everything except q). */
  clearHref: string;
  /** Other search params to preserve via hidden inputs. */
  preserve?: Record<string, string | undefined>;
  /** Submit-button label. Defaults to "Search". */
  submitLabel?: string;
}

export function SearchForm({
  action,
  value,
  placeholder = "Search…",
  clearHref,
  preserve = {},
  submitLabel = "Search",
}: SearchFormProps) {
  return (
    <form className="flex gap-2 flex-wrap" action={action}>
      {Object.entries(preserve)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <input
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="flex-1 min-w-[220px] px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition"
      >
        {submitLabel}
      </button>
      {value && (
        <Link
          href={clearHref}
          className="px-4 py-2 border border-neutral-800 text-neutral-400 hover:text-white text-sm rounded-lg transition"
        >
          Clear
        </Link>
      )}
    </form>
  );
}
