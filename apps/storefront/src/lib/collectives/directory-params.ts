import {
  DIRECTORY_CONTROL_CHARACTER_RE,
  DIRECTORY_MAX_LANGUAGE_LENGTH,
  DIRECTORY_MAX_PAGE,
  DIRECTORY_MAX_QUERY_LENGTH,
  DIRECTORY_MAX_REGION_LENGTH,
  DIRECTORY_PAGE_SIZE,
} from "./directory-contract";
import { COLLECTIVE_KINDS } from "./types";
import type { CollectiveKind } from "./types";

export interface DirectoryActiveFilters {
  kind?: CollectiveKind;
  region?: string;
  language?: string;
  q?: string;
}

export interface DirectoryPageSearchParams {
  kind?: string | string[];
  region?: string | string[];
  language?: string | string[];
  q?: string | string[];
  page?: string | string[];
}

export interface NormalizedDirectoryPageParams {
  active: DirectoryActiveFilters;
  pageNumber: number;
  adjusted: boolean;
}

export interface ReconciledDirectoryPage {
  pageNumber: number;
  lastPage: number;
  adjusted: boolean;
  needsRequery: boolean;
}

function boundedSingle(
  value: string | string[] | undefined,
  maxLength: number,
): { value?: string; rejected: boolean } {
  if (Array.isArray(value)) return { rejected: true };
  if (value && DIRECTORY_CONTROL_CHARACTER_RE.test(value)) {
    return { rejected: true };
  }
  const trimmed = value?.trim();
  if (!trimmed) return { rejected: false };
  if (trimmed.length > maxLength) return { rejected: true };
  return { value: trimmed, rejected: false };
}

/** Normalize manually edited HTML URLs without throwing during rendering.
 * Ambiguous repeated values are ignored, and `adjusted` tells the page to
 * disclose that choice rather than silently broadening the directory. */
export function normalizeDirectoryPageParams(
  supplied: DirectoryPageSearchParams,
): NormalizedDirectoryPageParams {
  const kind = boundedSingle(supplied.kind, 40);
  const region = boundedSingle(supplied.region, DIRECTORY_MAX_REGION_LENGTH);
  const language = boundedSingle(
    supplied.language,
    DIRECTORY_MAX_LANGUAGE_LENGTH,
  );
  const q = boundedSingle(supplied.q, DIRECTORY_MAX_QUERY_LENGTH);
  const kindAccepted =
    !kind.value || (COLLECTIVE_KINDS as readonly string[]).includes(kind.value);
  const pageValue = supplied.page;
  const pageRepeated = Array.isArray(pageValue);
  const rawPage = Array.isArray(pageValue) ? undefined : pageValue;
  const pageSyntaxValid = rawPage === undefined || /^\d+$/.test(rawPage);
  let requestedPage = 1;
  let pageAboveWindow = false;
  if (rawPage !== undefined && pageSyntaxValid) {
    // Avoid parsing attacker-sized integers. Any syntactically valid decimal
    // beyond the bounded window lands on the final supported page.
    const canonical = rawPage.replace(/^0+/, "") || "0";
    const maximum = String(DIRECTORY_MAX_PAGE);
    pageAboveWindow =
      canonical.length > maximum.length ||
      (canonical.length === maximum.length && canonical > maximum);
    requestedPage = pageAboveWindow ? DIRECTORY_MAX_PAGE : Number(canonical);
  }
  const pageNumber = Math.min(Math.max(requestedPage, 1), DIRECTORY_MAX_PAGE);

  return {
    active: {
      kind: kindAccepted
        ? (kind.value as CollectiveKind | undefined)
        : undefined,
      region: region.value,
      language: language.value,
      q: q.value,
    },
    pageNumber,
    adjusted:
      kind.rejected ||
      !kindAccepted ||
      region.rejected ||
      language.rejected ||
      q.rejected ||
      pageRepeated ||
      !pageSyntaxValid ||
      pageAboveWindow ||
      (supplied.page !== undefined && pageNumber !== requestedPage),
  };
}

/** Reconcile a bounded requested page with the count returned by the DB.
 * Empty directories always render as page 1 and never trigger a redundant
 * second query. */
export function reconcileDirectoryPage(
  pageNumber: number,
  total: number,
): ReconciledDirectoryPage {
  const lastPage = Math.min(
    Math.max(Math.ceil(total / DIRECTORY_PAGE_SIZE), 1),
    DIRECTORY_MAX_PAGE,
  );
  if (total === 0) {
    return {
      pageNumber: 1,
      lastPage,
      adjusted: pageNumber !== 1,
      needsRequery: false,
    };
  }
  if (pageNumber > lastPage) {
    return {
      pageNumber: lastPage,
      lastPage,
      adjusted: true,
      needsRequery: true,
    };
  }
  return { pageNumber, lastPage, adjusted: false, needsRequery: false };
}
