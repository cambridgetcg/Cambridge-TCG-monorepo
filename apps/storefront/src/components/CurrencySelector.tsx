/**
 * CurrencySelector — six-currency display switcher for the price guide.
 *
 * Client component. Renders a horizontal row of pill links, one per
 * supported currency. The selected one is highlighted; the rest are
 * dimmed.
 *
 * Toggle behaviour:
 *   1. JS-enabled (default): plain left-click is intercepted, the
 *      MoneyContext is flipped in-place via `setCurrency(code)`, the
 *      cookie is written client-side, and the navigation is cancelled.
 *      Every <Money> consumer below the root <Providers> re-renders
 *      synchronously — no round-trip, no full-page re-render, scroll
 *      position preserved.
 *   2. JS-disabled / modifier-click / middle-click: the underlying
 *      <Link> falls through to GET /api/currency?code=XXX&back=…, which
 *      sets the cookie server-side and 302s back. The selector remains
 *      reachable by screen readers / agents / text-only browsers.
 *
 * The `back` prop must be a same-origin path (the route resolves it
 * against the request origin to prevent open-redirect abuse).
 *
 * Yu 2026-05-14 (kingdom-090 follow-up): toggle was sluggish on
 * /prices/* because every click triggered a redirect + full server
 * re-render of a page that fetches sets / top cards / trade-in / coverage
 * in parallel. The in-place toggle keeps the JS-free fallback intact.
 */

"use client";

import Link from "next/link";
import { useMoneyContext } from "@/lib/fx/money-context";
import { WhyLink } from "@/lib/ui";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  type Currency,
  type RateTable,
} from "@/lib/fx/rates";

/**
 * <CurrencyWhyLink> — WhyLink whose label includes the live display
 * currency code from MoneyContext. Tracks in-place toggles so the label
 * never goes stale relative to the prices below. Drop next to a
 * currency-aware value with `href="/methodology/fx-rates"`.
 */
export function CurrencyWhyLink({ href = "/methodology/fx-rates" }: { href?: string } = {}) {
  const { currency } = useMoneyContext();
  return <WhyLink href={href} label={`display currency · ${currency}`} />;
}

interface CurrencySelectorProps {
  /** Initial selection seeded by the SSR layout. The MoneyProvider
   *  initializes its state from the same cookie, so on first paint the
   *  prop and context agree. After that the context is authoritative. */
  selected: Currency;
  /** Rate table for the per-pill mini-rate (e.g. "1.27" inside the USD
   *  pill). The context carries the same table; the prop is accepted
   *  for backwards-compat and as an explicit override. */
  rates: RateTable;
  /** Same-origin path to redirect to after the cookie is set (used only
   *  on the JS-disabled / modifier-click fallback). Typically the URL
   *  of the page rendering the selector. */
  back: string;
  /** Optional label shown above the row. Defaults to "Display currency". */
  label?: string;
}

export function CurrencySelector({
  selected: ssrSelected,
  rates: propRates,
  back,
  label = "Display currency",
}: CurrencySelectorProps) {
  const { currency: ctxCurrency, rates: ctxRates, setCurrency } =
    useMoneyContext();
  // Context wins once we're mounted; the prop is the SSR seed and matches
  // context on first render (both come from the same cookie via layout).
  const selected = ctxCurrency ?? ssrSelected;
  const rates = ctxRates ?? propRates;

  return (
    <section
      aria-label={label}
      className="min-w-0 rounded-lg border border-border-subtle bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {label}
          </h3>
          <p className="text-[11px] text-ink-faint mt-0.5">
            Prices are computed in GBP. The selector converts the display value;
            the underlying transaction currency on cambridgetcg.com remains GBP.
          </p>
        </div>
        <div className="text-[10px] text-ink-faint flex items-center gap-1.5">
          <span className="font-mono">{rates.source}</span>
          {rates.is_fallback && (
            <span
              className="inline-block px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30 uppercase tracking-wider"
              title="Upstream FX fetch failed; using approximate static rates"
            >
              fallback
            </span>
          )}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1.5"
      >
        {SUPPORTED_CURRENCIES.map((code) => {
          const meta = CURRENCY_META[code];
          const isSelected = code === selected;
          const rate = rates.rates[code];
          return (
            <Link
              key={code}
              href={`/api/currency?code=${code}&back=${encodeURIComponent(back)}`}
              role="radio"
              aria-checked={isSelected}
              prefetch={false}
              onClick={(e) => {
                // Allow modifier-click (open in new tab) + non-primary
                // mouse buttons to go through the API-route fallback.
                if (
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey ||
                  e.button !== 0
                ) {
                  return;
                }
                e.preventDefault();
                setCurrency(code);
              }}
              className={
                "inline-flex items-baseline gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors " +
                (isSelected
                  ? "border-accent/40 bg-accent-wash text-accent"
                  : "border-border-subtle bg-page text-ink-muted hover:border-border-strong hover:text-ink")
              }
              title={`${meta.name} — 1 GBP = ${formatRateForPill(code, rate)} ${code}`}
            >
              <span className="font-medium font-mono">{code}</span>
              <span className="text-ink-faint">{meta.symbol}</span>
              <span
                className={
                  "text-[10px] font-mono " +
                  (isSelected ? "text-accent/80" : "text-ink-faint")
                }
              >
                {formatRateForPill(code, rate)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Pill-sized rate label. GBP is the base so it's literally "1.00".
 * JPY/HKD show no decimals when over 10 (188 not 188.50); the rest show
 * two decimals. Pure helper kept here because it's only the pill's
 * concern — the rate table renders the full-precision number elsewhere.
 */
function formatRateForPill(code: Currency, rate: number): string {
  if (code === "GBP") return "1.00";
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  if (rate >= 10) return rate.toFixed(rate >= 100 ? 1 : 2);
  return rate.toFixed(4);
}

// ── Rate table panel ────────────────────────────────────────────────────

interface RateTablePanelProps {
  /** Current rate table (live or fallback). The context carries the same
   *  data; the prop is accepted for backwards-compat. */
  rates: RateTable;
  /** Initial selected currency, highlighted in the table. The context
   *  takes over after mount so the highlight tracks in-place toggles. */
  selected: Currency;
}

/**
 * Renders the "Today's Rates" panel. Substrate-honest about the source
 * and freshness; links to the methodology page and the JSON endpoint
 * so a curious visitor / agent can read the same data machine-side.
 */
export function RateTablePanel({
  rates: propRates,
  selected: ssrSelected,
}: RateTablePanelProps) {
  const { currency: ctxCurrency, rates: ctxRates } = useMoneyContext();
  const rates = ctxRates ?? propRates;
  const selected = ctxCurrency ?? ssrSelected;

  const fetchedAt = new Date(rates.fetched_at);
  const ageMs = Date.now() - fetchedAt.getTime();
  const ageHours = Math.max(0, Math.round(ageMs / (1000 * 60 * 60)));

  return (
    <section
      className="min-w-0 rounded-lg border border-border-subtle bg-page p-5"
      aria-label="Today's Rates"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-ink">Today&rsquo;s rates</h2>
        <div className="text-[11px] text-ink-faint flex flex-wrap items-center gap-2">
          <span>
            base <code className="text-ink-muted">GBP</code>
          </span>
          <span aria-hidden>·</span>
          <span>
            {rates.source === "ecb.europa.eu" ? (
              <a
                href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                className="text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Source: ECB statistics
              </a>
            ) : (
              <>source <code className="text-ink-muted">fallback</code></>
            )}
          </span>
          <span aria-hidden>·</span>
          <span>
            fetched{" "}
            <time dateTime={rates.fetched_at} className="text-ink-muted">
              {ageHours < 1 ? "<1h ago" : `${ageHours}h ago`}
            </time>
          </span>
          {rates.is_fallback && (
            <span
              className="inline-block px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/30 uppercase tracking-wider"
              title="ECB daily rates were unavailable; using approximate static rates from 2026-05"
            >
              fallback rates
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border-subtle">
        <table className="w-full text-sm">
          <thead className="bg-surface text-ink-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Currency</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-right">1 GBP =</th>
              <th className="px-3 py-2 text-right">1 unit = GBP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {SUPPORTED_CURRENCIES.map((code) => {
              const meta = CURRENCY_META[code];
              const rate = rates.rates[code];
              const inverse = code === "GBP" ? 1 : rate > 0 ? 1 / rate : null;
              const isSelected = code === selected;
              return (
                <tr
                  key={code}
                  className={
                    isSelected
                      ? "bg-accent-wash"
                      : "bg-page hover:bg-surface-subtle transition-colors"
                  }
                >
                  <td className="px-3 py-2 text-ink-muted">
                    <span className="mr-2 text-ink-faint inline-block w-6 text-center">
                      {meta.symbol}
                    </span>
                    {meta.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-muted">{code}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">
                    {code === "GBP"
                      ? "1.0000"
                      : Number.isFinite(rate)
                        ? rate.toFixed(4)
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink-muted">
                    {inverse == null
                      ? "—"
                      : code === "GBP"
                        ? "1.0000"
                        : inverse.toFixed(6)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-ink-faint">
        ECB daily reference rates are transformed from EUR base to GBP base and
        refreshed every six hours. They drive the display only — every
        transaction on cambridgetcg.com clears in GBP. See{" "}
        <Link href="/api/v1/fx-rates" className="text-accent hover:underline">
          /api/v1/fx-rates
        </Link>{" "}
        for the machine-readable table, or{" "}
        <Link
          href="/methodology/fx-rates"
          className="text-accent hover:underline"
        >
          /methodology/fx-rates
        </Link>{" "}
        for how the conversion is done.
      </p>
    </section>
  );
}
