import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata = {
  title: "Cambridge TCG is free — no membership, no fees",
  description:
    "Cambridge TCG removed memberships in July 2026 and takes no commission or service fee. New paid commerce was retired on 23 September 2026. Trades agreed on or after 21 July 2026 carry 0% commission, including those still settling; earlier trades keep the commission recorded when they were matched.",
  other: audienceMetadata("consumer", ["seller", "documentation"]),
};

export default function MembershipRetiredPage() {
  return (
    <main className="min-h-screen bg-page">
      <Audience kind="consumer" contexts={["seller"]} />
      <div className="max-w-2xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-display font-semibold text-ink">
          Cambridge TCG is free
        </h1>
        <p className="text-ink-muted mt-4 leading-relaxed">
          Memberships were removed in July 2026, and so were the fees. Commission
          has been <strong className="text-ink">0%</strong> since 21 July 2026, and
          new paid commerce was retired on 23 September 2026. Trades agreed on or
          after 21 July 2026 carry 0% commission, including those still settling;
          earlier trades keep the commission recorded when they were matched. The one
          thing a paid tier ever bought — a lower commission — is now the same for
          everyone: zero.
        </p>
        <p className="text-ink-muted mt-3 leading-relaxed">
          The <Link href="/rewards" className="text-accent hover:text-accent-strong underline underline-offset-2">Rewards Hub</Link>{" "}
          — daily spins, packs, raffles — stays free and open to all, with Berries
          earned at one flat rate.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/prices" className="px-5 py-2.5 bg-ink text-page text-sm font-bold rounded-lg hover:opacity-90 transition">
            Look up card prices
          </Link>
          <Link href="/methodology/fees" className="px-5 py-2.5 border border-border-subtle text-ink text-sm font-medium rounded-lg hover:border-border-strong transition">
            How the free platform works
          </Link>
        </div>
      </div>
    </main>
  );
}
