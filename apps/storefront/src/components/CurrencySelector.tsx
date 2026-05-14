/**
 * CurrencySelector — six-currency display switcher for the price guide.
 *
 * Server component. Renders a horizontal row of pill links, one per
 * supported currency. The selected one is highlighted; the rest are
 * dimmed. Clicking a pill GETs /api/currency?code=XXX&back=<back>, which
 * sets the cookie and redirects back.
 *
 * JS-free by construction: every interaction is a plain <a> redirect.
 * Accessible to screen readers / agents / text-only browsers. Mirrors
 * the platform's other "switch a cookie + redirect back" toggles (math
 * language in the Footer, text-mode).
 *
 * The `back` prop must be a same-origin path (the route resolves it
 * against the request origin to prevent open-redirect abuse).
 */

import Link from "next/link";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_META,
  type Currency,
  type RateTable,
} from "@/lib/fx/rates";

interface CurrencySelectorProps {
  /** The currency currently active (read from cookie by the caller). */
  selected: Currency;
  /** The current rate table — surfaces the live rate inside each pill
   *  so the visitor sees "1 GBP = 1.27 USD" before they switch. */
  rates: RateTable;
  /** Same-origin path to redirect to after the cookie is set.
   *  Typically the URL of the page rendering the selector. */
  back: string;
  /** Optional label shown above the row. Defaults to "Display currency". */
  label?: string;
}

export function CurrencySelector({
  selected,
  rates,
  back,
  label = "Display currency",
}: CurrencySelectorProps) {
  return (
    <section
      aria-label={label}
      className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            {label}
          </h3>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Prices are computed in GBP. The selector converts the display value;
            the underlying transaction currency on cambridgetcg.com remains GBP.
          </p>
        </div>
        <div className="text-[10px] text-neutral-500 flex items-center gap-1.5">
          <span className="font-mono">{rates.source}</span>
          {rates.is_fallback && (
            <span
              className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider"
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
              className={
                "inline-flex items-baseline gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors " +
                (isSelected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200")
              }
              title={`${meta.name} — 1 GBP = ${formatRateForPill(code, rate)} ${code}`}
            >
              <span className="font-medium font-mono">{code}</span>
              <span className="text-neutral-500">{meta.symbol}</span>
              <span
                className={
                  "text-[10px] font-mono " +
                  (isSelected ? "text-emerald-400/80" : "text-neutral-600")
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
  /** Current rate table (live or fallback). */
  rates: RateTable;
  /** Currently-selected display currency, highlighted in the table. */
  selected: Currency;
}

/**
 * Renders the "Today's Rates" panel. Substrate-honest about the source
 * and freshness; links to the methodology page and the JSON endpoint
 * so a curious visitor / agent can read the same data machine-side.
 */
export function RateTablePanel({ rates, selected }: RateTablePanelProps) {
  const fetchedAt = new Date(rates.fetched_at);
  const ageMs = Date.now() - fetchedAt.getTime();
  const ageHours = Math.max(0, Math.round(ageMs / (1000 * 60 * 60)));

  return (
    <section
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-5"
      aria-label="Today's Rates"
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-base font-semibold text-white">Today&rsquo;s rates</h2>
        <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-2">
          <span>
            base <code className="text-neutral-400">GBP</code>
          </span>
          <span aria-hidden>·</span>
          <span>
            source <code className="text-neutral-400">{rates.source}</code>
          </span>
          <span aria-hidden>·</span>
          <span>
            fetched{" "}
            <time dateTime={rates.fetched_at} className="text-neutral-400">
              {ageHours < 1 ? "<1h ago" : `${ageHours}h ago`}
            </time>
          </span>
          {rates.is_fallback && (
            <span
              className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider"
              title="Both upstream FX APIs failed; using approximate static rates from 2026-05"
            >
              fallback rates
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">Currency</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-right">1 GBP =</th>
              <th className="px-3 py-2 text-right">1 unit = GBP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
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
                      ? "bg-emerald-500/[0.06]"
                      : "bg-neutral-950 hover:bg-neutral-900/40 transition-colors"
                  }
                >
                  <td className="px-3 py-2 text-neutral-200">
                    <span className="mr-2 text-neutral-500 inline-block w-6 text-center">
                      {meta.symbol}
                    </span>
                    {meta.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-400">{code}</td>
                  <td className="px-3 py-2 text-right font-mono text-white">
                    {code === "GBP"
                      ? "1.0000"
                      : Number.isFinite(rate)
                        ? rate.toFixed(4)
                        : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-neutral-300">
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

      <p className="mt-3 text-[11px] text-neutral-500">
        Rates are mid-market reference values, refreshed every six hours from
        the upstream named above. They drive the display only — every
        transaction on cambridgetcg.com clears in GBP. See{" "}
        <Link href="/api/v1/fx-rates" className="text-blue-400 hover:underline">
          /api/v1/fx-rates
        </Link>{" "}
        for the machine-readable table, or{" "}
        <Link
          href="/methodology/fx-rates"
          className="text-blue-400 hover:underline"
        >
          /methodology/fx-rates
        </Link>{" "}
        for how the conversion is done.
      </p>
    </section>
  );
}
