import type { ReactNode } from "react";
import { Badge, Card, WhyLink } from "@/lib/ui";

/**
 * The labelled reference block returned by /api/v1/cards/[sku]/everything.
 * `is_offer` is deliberately literal: collectors-first means this value can
 * never be presented as Cambridge inventory, a bid, or an ask.
 */
export interface ReferencePrice {
  reference_price_gbp: number | null;
  provenance: string;
  is_offer: false;
}

export interface PublishablePriceRow {
  source: string;
  amount_gbp: number;
}

export function formatGbp(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function NotAnOfferBadge() {
  return (
    <Badge
      status="not-an-offer"
      label="not an offer"
      palette={{ "not-an-offer": "blue" }}
    />
  );
}

/** Compact form used in the resolved card header. */
export function ReferencePriceSummary({
  reference,
}: {
  reference: ReferencePrice;
}) {
  if (reference.reference_price_gbp === null) return null;

  return (
    <div className="pt-2">
      <span className="text-sm text-ink-muted">Reference price:</span>{" "}
      <span className="text-lg font-semibold text-ink">
        {formatGbp(reference.reference_price_gbp)}
      </span>{" "}
      <NotAnOfferBadge />
    </div>
  );
}

/**
 * Compare unlike-but-useful data points without turning Cambridge's derived
 * reference into a shop price. Only rows already reviewed as publishable by
 * the composer reach this component.
 */
export function ReferenceComparison({
  reference,
  rows,
}: {
  reference: ReferencePrice;
  rows: readonly PublishablePriceRow[];
}) {
  const value = reference.reference_price_gbp;
  const published = rows
    .filter((row) => Number.isFinite(row.amount_gbp))
    .map((row) => ({ source: row.source, price: row.amount_gbp }))
    .sort((a, b) => a.price - b.price);

  if (published.length === 0 && value === null) return null;

  const lowest = published[0] ?? null;
  const average =
    published.length > 0
      ? published.reduce((sum, row) => sum + row.price, 0) / published.length
      : null;

  let explanation: ReactNode;
  if (value !== null && lowest) {
    const delta = value - lowest.price;
    const pct = lowest.price > 0 ? Math.abs(delta) / lowest.price : 0;
    const pctLabel = (pct * 100).toFixed(0);

    if (Math.abs(delta) < 0.01) {
      explanation = (
        <>The reference matches the lowest publishable source row ({lowest.source}).</>
      );
    } else if (delta < 0) {
      explanation = (
        <>
          The reference is{" "}
          <span className="font-semibold text-ok">
            {formatGbp(Math.abs(delta))} ({pctLabel}%) below
          </span>{" "}
          the lowest publishable source row, {lowest.source} at{" "}
          {formatGbp(lowest.price)}.
        </>
      );
    } else {
      explanation = (
        <>
          The reference is{" "}
          <span className="font-semibold text-accent">
            {formatGbp(delta)} ({pctLabel}%) above
          </span>{" "}
          the lowest publishable source row, {lowest.source} at{" "}
          {formatGbp(lowest.price)}.
        </>
      );
    }
  } else if (value !== null) {
    explanation = (
      <>
        No publishable source row is available for comparison. The reference
        remains a policy-bound guide, not an offer or an open-data grant.
      </>
    );
  } else {
    explanation = (
      <>
        Cambridge holds no reference value for this print. The source rows
        below are observations from their named publishers, not Cambridge
        offers.
      </>
    );
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">
            Reference value and published sources
          </h2>
          <WhyLink href="/methodology/pricing" />
        </div>

        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-ink-faint">Cambridge reference</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-ink">
              {formatGbp(value)}
              {value !== null ? <NotAnOfferBadge /> : null}
            </div>
          </div>

          {lowest ? (
            <div>
              <div className="text-xs text-ink-faint">
                Lowest publishable source
              </div>
              <div className="text-2xl font-bold text-ink-muted">
                {formatGbp(lowest.price)}
                <span className="ml-2 text-xs font-normal text-ink-faint">
                  {lowest.source}
                </span>
              </div>
            </div>
          ) : null}

          {average !== null && published.length > 1 ? (
            <div>
              <div className="text-xs text-ink-faint">
                Published-source average
              </div>
              <div className="text-2xl font-bold text-ink-muted">
                {formatGbp(average)}
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-sm text-ink-muted">{explanation}</p>
        <p className="text-xs text-ink-faint">
          Data-point comparison only. Cambridge does not buy or sell at the
          reference value. Restricted source rows remain withheld from this
          anonymous view.
        </p>
        {value !== null ? (
          <p className="text-xs text-ink-faint">
            Derivation: {reference.provenance}
          </p>
        ) : null}
        {published.length > 0 ? (
          <p className="text-xs text-ink-faint">
            Compared with {published.length}{" "}
            {published.length === 1 ? "publishable source" : "publishable sources"}:{" "}
            {published.map((row) => row.source).join(", ")}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
