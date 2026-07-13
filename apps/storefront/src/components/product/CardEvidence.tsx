import Link from "next/link";
import { Badge, Card, EmptyState, MoneyDisplay, Provenance, WhyLink } from "@/lib/ui";
import type { CardEvidenceModel, EvidenceSourceState } from "@/lib/evidence/card";

const SOURCE_PALETTE = {
  observed_withheld: "amber",
  blocked: "red",
  planned: "neutral",
} as const;

const SOURCE_LABELS: Record<EvidenceSourceState, string> = {
  observed_withheld: "observed · withheld",
  blocked: "blocked",
  planned: "planned",
};

export default async function CardEvidence({ model }: { model: CardEvidenceModel }) {
  const sold = model.completed_sales;
  const community = model.community_observations;

  return (
    <section id="evidence" className="mt-16 scroll-mt-8" aria-labelledby="evidence-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-faint">What supports the numbers</p>
          <h2 id="evidence-heading" className="text-2xl font-display font-semibold text-ink">
            Evidence
          </h2>
          <p className="text-sm text-ink-muted mt-1 max-w-2xl">
            References and live offers stay separate from the publication status of completed sales and collector observations.
            A paused lane is shown as paused, never as an empty fact.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <span>Whole view: NOASSERTION</span>
          <WhyLink href="/methodology/data-intentions" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-faint">Computed reference</p>
              <div className="text-2xl font-display font-semibold text-ink mt-1">
                {model.reference.amount_gbp === null ? (
                  <span className="text-ink-faint">Unavailable</span>
                ) : (
                  <MoneyDisplay value={model.reference.amount_gbp} />
                )}
              </div>
            </div>
            <Badge status="computed" palette={{ computed: "blue" }} />
          </div>
          <div className="mt-3">
            <Provenance
              kind={model.reference.observed_at ? "synced" : "unavailable"}
              source="wholesale catalog"
              at={model.reference.observed_at}
              cadence="daily"
            />
          </div>
          <p className="text-sm text-ink-muted mt-3">
            A policy-bound reference. It is not anyone&apos;s ask, bid, purchase, or completed sale.
          </p>
          <p className="text-xs text-ink-faint mt-2">Rights: NOASSERTION · is_offer: false</p>
        </Card>

        <Card padding="lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-faint">Live collector offers</p>
              <p className="text-sm text-ink-muted mt-1">
                {model.market.ask_count} ask{model.market.ask_count === 1 ? "" : "s"} · {model.market.bid_count} bid{model.market.bid_count === 1 ? "" : "s"}
              </p>
            </div>
            <Badge status="live offers" palette={{ "live offers": "emerald" }} />
          </div>
          {model.market.ask_count === 0 && model.market.bid_count === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No live offers"
                description="This is an empty order book, not evidence that the card has no value."
              />
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <dt className="text-xs text-ink-faint">Best ask</dt>
                <dd className="text-lg font-semibold text-ask">
                  {model.market.best_ask_gbp === null ? "—" : <MoneyDisplay value={model.market.best_ask_gbp} />}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Best bid</dt>
                <dd className="text-lg font-semibold text-bid">
                  {model.market.best_bid_gbp === null ? "—" : <MoneyDisplay value={model.market.best_bid_gbp} />}
                </dd>
              </div>
            </dl>
          )}
          <div className="mt-3"><Provenance kind="live" source="collector order book" /></div>
          <p className="text-sm text-ink-muted mt-3">Offers are intentions, not proof that a transaction completed.</p>
          <p className="text-xs text-ink-faint mt-2">Rights: NOASSERTION</p>
        </Card>

        <Card padding="lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-faint">Completed-sale publication</p>
              <p className="text-sm text-ink-muted mt-1">Policy status only; no transaction row is read.</p>
            </div>
            <Badge status="paused" palette={{ paused: "amber" }} />
          </div>
          <div className="mt-4">
            <EmptyState
              title="Publication paused"
              description={sold.reason}
              tone="warning"
            />
          </div>
          <div className="mt-4">
            <Provenance kind="unavailable" by="purpose-specific publication policy" />
          </div>
          <p className="text-xs text-ink-faint mt-2">
            Rights: NOASSERTION · source rights: internal-only · no prices, counts, dates, conditions, or threshold totals are emitted.
          </p>
        </Card>

        <Card padding="lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-ink-faint">Collector-observation publication</p>
              <p className="text-sm text-ink-muted mt-1">Private witness notebook; public projection is paused.</p>
            </div>
            <Badge status="paused" palette={{ paused: "amber" }} />
          </div>
          <div className="mt-4">
            <EmptyState
              title="Publication paused"
              description={community.reason}
              tone="warning"
            />
          </div>
          <div className="mt-4">
            <Provenance kind="unavailable" by="delayed-projector privacy boundary" />
          </div>
          <p className="text-xs text-ink-faint mt-2">
            Rights: NOASSERTION · source rights: internal-only · no observation values, counts, dates, or threshold totals are emitted.
          </p>
        </Card>
      </div>

      <Card variant="subtle" padding="lg" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold text-ink">Source state</h3>
            <p className="text-sm text-ink-muted">Being named here does not mean a source is open or active.</p>
          </div>
          <Link href={model.links.sources} className="text-sm text-accent hover:text-accent-strong">All source details &rarr;</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {model.source_states.map((source) => (
            <div key={source.id} className="bg-surface border border-border-subtle rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{source.name}</p>
                <Badge status={source.state} label={SOURCE_LABELS[source.state]} palette={SOURCE_PALETTE} />
              </div>
              <p className="text-xs text-ink-muted mt-2">{source.reason}</p>
              <p className="text-xs text-ink-faint mt-2">License tier: {source.license}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <span className="text-ink-faint">For machines:</span>
        <Link className="text-accent hover:text-accent-strong" href={model.links.everything}>card composer</Link>
        <Link className="text-accent hover:text-accent-strong" href={model.links.sold_comps}>sold comps</Link>
        <Link className="text-accent hover:text-accent-strong" href={model.links.sources}>source registry</Link>
        <Link className="text-accent hover:text-accent-strong" href={model.links.methodology}>methodology</Link>
      </div>
    </section>
  );
}
