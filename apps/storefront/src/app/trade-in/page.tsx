/**
 * /trade-in — the we-buy desk, kept as one honest page.
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md):
 * the trade-in desk closed on 2026-07-06. The dated close-out decision
 * records zero submissions and zero outstanding credit; this page does not
 * infer a current production balance from repository state. The buylist,
 * quote funnel, bundle/bulk/custom-quote forms all collapsed into
 * this page. It says plainly what trade-in was, that the platform no
 * longer buys, and that new paid commerce was retired on 2026-09-23. The old
 * sub-routes redirect here so no bookmark meets a 404.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Trade-in has closed — Cambridge TCG",
  description:
    "Cambridge TCG closed its trade-in desk on 6 July 2026 and retired new paid commerce on 23 September 2026. Existing records and support remain.",
  other: audienceMetadata("consumer", ["seller"]),
};

export default function TradeInPage() {
  return (
    <main className="min-h-screen bg-page">
      <Audience kind="consumer" contexts={["seller"]} />
      <div className="max-w-2xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-display font-semibold text-ink">
          The trade-in desk has closed
        </h1>
        <p className="text-ink-muted mt-4">
          Trade-in was Cambridge TCG buying cards from you — for store credit or
          cash, against a daily buylist. On 6 July 2026 the platform stopped
          buying and selling altogether and became a collectors&apos; market; new
          paid commerce was then retired on 23 September 2026.
          The dated 6 July close-out record reports that no trade-in or store
          credit balance was outstanding then. This page does not live-query
          the historical ledger. If you believe Cambridge TCG still owes you a
          trade-in payment or credit, contact support so the operational record
          can be checked.
        </p>
        <p className="text-ink-muted mt-3">
          New paid listings were retired on 23 September 2026; existing trades
          still settle from{" "}
          <Link href="/account/trades" className="text-accent hover:text-accent-strong transition">
            your account
          </Link>
          .
        </p>

        <p className="text-sm text-ink-faint mt-8">
          Not sure what your cards are worth? The{" "}
          <Link href="/prices" className="text-accent hover:text-accent-strong transition">
            price guide
          </Link>{" "}
          shows card identity and source coverage; legacy price values are
          withheld pending source rights, and every card&apos;s{" "}
          <Link href="/market" className="text-accent hover:text-accent-strong transition">
            market
          </Link>{" "}
          page keeps its order-book record. Reuse of reference data follows the
          source rights declared by its API response.
        </p>
      </div>
    </main>
  );
}
