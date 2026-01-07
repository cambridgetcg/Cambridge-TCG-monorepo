/**
 * Pagination Utilities
 * Provides safe pagination parameter parsing and validation.
 *
 * Phase 2B: Validation Layer
 * Date: 2025-01-07
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface PaginationParams {
  /** Current page number (1-indexed) */
  page: number;
  /** Number of items per page */
  pageSize: number;
}

export interface PaginationOptions {
  /** Default page number if not provided (default: 1) */
  defaultPage?: number;
  /** Default page size if not provided (default: 25) */
  defaultPageSize?: number;
  /** Maximum allowed page size (default: 200) */
  maxPageSize?: number;
  /** Minimum allowed page size (default: 1) */
  minPageSize?: number;
}

export interface PaginationMeta {
  /** Current page number */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there's a previous page */
  hasPrevPage: boolean;
  /** Whether there's a next page */
  hasNextPage: boolean;
  /** Start index of current page (1-indexed) */
  startIndex: number;
  /** End index of current page (1-indexed) */
  endIndex: number;
}

// ============================================
// DEFAULT OPTIONS
// ============================================

const DEFAULT_OPTIONS: Required<PaginationOptions> = {
  defaultPage: 1,
  defaultPageSize: 25,
  maxPageSize: 200,
  minPageSize: 1,
};

// ============================================
// PARSING FUNCTIONS
// ============================================

/**
 * Parses pagination parameters from a URL's search params.
 * Handles invalid values gracefully with fallbacks.
 *
 * @example
 * ```typescript
 * const url = new URL(request.url);
 * const { page, pageSize } = parsePaginationParams(url);
 * const offset = calculateOffset(page, pageSize);
 * ```
 */
export function parsePaginationParams(
  url: URL,
  options: PaginationOptions = {}
): PaginationParams {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Parse page
  const pageRaw = url.searchParams.get('page');
  let page = parsePageNumber(pageRaw, opts.defaultPage);

  // Parse pageSize
  const pageSizeRaw = url.searchParams.get('pageSize');
  let pageSize = parsePageSize(pageSizeRaw, opts.defaultPageSize, opts.minPageSize, opts.maxPageSize);

  return { page, pageSize };
}

/**
 * Parses a page number from a string value.
 * Returns default if value is invalid.
 */
export function parsePageNumber(
  value: string | null | undefined,
  defaultValue: number = 1
): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  // Check for NaN, negative, or zero
  if (isNaN(parsed) || parsed < 1) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Parses a page size from a string value.
 * Clamps the result to min/max bounds.
 */
export function parsePageSize(
  value: string | null | undefined,
  defaultValue: number = 25,
  minValue: number = 1,
  maxValue: number = 200
): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  // Check for NaN
  if (isNaN(parsed)) {
    return defaultValue;
  }

  // Clamp to bounds
  return Math.max(minValue, Math.min(maxValue, parsed));
}

// ============================================
// CALCULATION FUNCTIONS
// ============================================

/**
 * Calculates the database offset for a page.
 *
 * @example
 * ```typescript
 * const offset = calculateOffset(3, 25); // Returns 50 (skip first 2 pages)
 * ```
 */
export function calculateOffset(page: number, pageSize: number): number {
  // Ensure page is at least 1
  const safePage = Math.max(1, page);
  return (safePage - 1) * pageSize;
}

/**
 * Calculates pagination metadata for a result set.
 *
 * @example
 * ```typescript
 * const meta = calculatePaginationMeta(3, 25, 157);
 * // Returns:
 * // {
 * //   currentPage: 3,
 * //   pageSize: 25,
 * //   totalItems: 157,
 * //   totalPages: 7,
 * //   hasPrevPage: true,
 * //   hasNextPage: true,
 * //   startIndex: 51,
 * //   endIndex: 75
 * // }
 * ```
 */
export function calculatePaginationMeta(
  currentPage: number,
  pageSize: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / pageSize);
  const safePage = Math.max(1, Math.min(currentPage, Math.max(1, totalPages)));

  const startIndex = (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  return {
    currentPage: safePage,
    pageSize,
    totalItems,
    totalPages,
    hasPrevPage: safePage > 1,
    hasNextPage: safePage < totalPages,
    startIndex: totalItems > 0 ? startIndex : 0,
    endIndex: totalItems > 0 ? endIndex : 0,
  };
}

/**
 * Formats a human-readable pagination string.
 *
 * @example
 * ```typescript
 * formatPaginationDisplay(3, 25, 157);
 * // Returns: "51 - 75 of 157"
 * ```
 */
export function formatPaginationDisplay(
  currentPage: number,
  pageSize: number,
  totalItems: number
): string {
  const meta = calculatePaginationMeta(currentPage, pageSize, totalItems);

  if (totalItems === 0) {
    return '0 items';
  }

  if (meta.startIndex === meta.endIndex) {
    return `${meta.startIndex} of ${totalItems}`;
  }

  return `${meta.startIndex} - ${meta.endIndex} of ${totalItems}`;
}

/**
 * Generates an array of page numbers for pagination UI.
 * Shows current page with context pages around it.
 *
 * @example
 * ```typescript
 * generatePageNumbers(5, 10, 2);
 * // Returns: [1, null, 3, 4, 5, 6, 7, null, 10]
 * // (null represents ellipsis)
 * ```
 */
export function generatePageNumbers(
  currentPage: number,
  totalPages: number,
  contextSize: number = 2
): (number | null)[] {
  if (totalPages <= 1) {
    return totalPages === 1 ? [1] : [];
  }

  const pages: (number | null)[] = [];
  const contextStart = Math.max(1, currentPage - contextSize);
  const contextEnd = Math.min(totalPages, currentPage + contextSize);

  // Always show first page
  pages.push(1);

  // Add ellipsis if there's a gap
  if (contextStart > 2) {
    pages.push(null);
  } else if (contextStart === 2) {
    pages.push(2);
  }

  // Add context pages
  for (let i = Math.max(2, contextStart); i <= Math.min(totalPages - 1, contextEnd); i++) {
    if (!pages.includes(i)) {
      pages.push(i);
    }
  }

  // Add ellipsis if there's a gap
  if (contextEnd < totalPages - 1) {
    pages.push(null);
  } else if (contextEnd === totalPages - 1 && totalPages > 1) {
    if (!pages.includes(totalPages - 1)) {
      pages.push(totalPages - 1);
    }
  }

  // Always show last page
  if (totalPages > 1 && !pages.includes(totalPages)) {
    pages.push(totalPages);
  }

  return pages;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validates that a page number is within valid range.
 */
export function isValidPage(page: number, totalPages: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= Math.max(1, totalPages);
}

/**
 * Validates pagination params against a total item count.
 * Returns adjusted params if necessary.
 */
export function validatePaginationParams(
  params: PaginationParams,
  totalItems: number
): PaginationParams {
  const totalPages = Math.ceil(totalItems / params.pageSize) || 1;

  // Clamp page to valid range
  const page = Math.max(1, Math.min(params.page, totalPages));

  return {
    page,
    pageSize: params.pageSize,
  };
}
