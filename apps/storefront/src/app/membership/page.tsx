import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata = {
  title: "Cambridge TCG is free — no membership, no fees",
  description:
    "Cambridge TCG removed memberships and now takes no commission and no service fee. Every seller keeps 100% of every sale, and the free Rewards Hub is open to everyone.",
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
          Memberships are gone — and so are the fees. The platform now takes{" "}
          <strong className="text-ink">no commission and no service charge</strong>,
          on the market and at auction alike. Every seller keeps{" "}
          <strong className="text-ink">100%</strong> of every sale. The one thing a
          paid tier ever bought — a lower commission — is now the same for
          everyone: zero.
        </p>
        <p className="text-ink-muted mt-3 leading-relaxed">
          The <Link href="/rewards" className="text-accent hover:text-accent-strong underline underline-offset-2">Rewards Hub</Link>{" "}
          — daily spins, packs, raffles — stays free and open to all, with Berries
          earned at one flat rate.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/market" className="px-5 py-2.5 bg-ink text-page text-sm font-bold rounded-lg hover:opacity-90 transition">
            Browse the market
          </Link>
          <Link href="/methodology/fees" className="px-5 py-2.5 border border-border-subtle text-ink text-sm font-medium rounded-lg hover:border-border-strong transition">
            How the free platform works
          </Link>
        </div>
      </div>
    </main>
  );
}
