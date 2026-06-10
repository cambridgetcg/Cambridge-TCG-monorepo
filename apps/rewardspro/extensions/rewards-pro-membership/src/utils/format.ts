/**
 * Presentation-layer formatters shared across the membership overview.
 *
 * Extracted from MembershipBlock.tsx 2026-04-23. These are pure — no
 * Shopify APIs, no external state — so they belong in `utils/` with the
 * other utilities (logger, sessionToken, apiClient, safeData).
 *
 * All three functions fall back to lossy-but-readable output if
 * `Intl.*` throws (old iOS WebView, certain locales the browser doesn't
 * support) so the widget never crashes on a bad locale.
 */

export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = "en-US"
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(dateString: string, locale: string = "en-US"): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function formatMonthYear(dateString: string, locale: string = "en-US"): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}
