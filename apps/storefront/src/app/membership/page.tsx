import Link from "next/link";
import { WhyLink } from "@/lib/ui";

export const metadata = {
  title: "Membership — How It Works — Cambridge TCG",
  description: "Cambridge TCG membership tiers explained. Lower commission on the market, Berries in the Rewards Hub, priority approval. Bronze, Silver, Gold, and Platinum tiers.",
};

export default function MembershipInfoPage() {
  return (
    <main className="min-h-screen bg-page">
      {/* Hero */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-display font-semibold text-ink">
            Membership <span className="text-accent">Rewards</span>
          </h1>
          <p className="text-lg text-ink-muted mt-4 max-w-xl mx-auto">
            Trade more, pay less. Tiers lower your commission on the market and at auction, and unlock rewards along the way.
          </p>
        </div>
      </section>

      {/* How Each Element Works */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-display font-semibold text-ink mb-10">How It All Works</h2>

          {/* Commission */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Lower Commission</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>The core benefit. Your tier lowers the commission you pay when you <strong className="text-ink">sell on the market or at auction</strong> — Platinum pays 0% on both. We always apply <strong className="text-ink">whichever rate is more favourable to you</strong>, tier or trust score.</p>
              <p>The full rate logic lives at <Link href="/methodology/commission-rate" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">/methodology/commission-rate</Link>.</p>
            </div>
          </div>

          {/* Berries */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Berries</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Berries are the rewards currency. Spend them in the <Link href="/rewards" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">Rewards Hub</Link> — on <strong className="text-ink">virtual booster packs</strong>, <strong className="text-ink">premium daily spins</strong>, <strong className="text-ink">raffles</strong> (enter for a chance to win high-value cards), and <strong className="text-ink">mystery boxes</strong>. Your tier multiplies what you earn.</p>
              <p className="text-xs text-ink-faint">Shop-era note: Berries used to accrue per £1 spent at the Cambridge TCG shop. The shop closed on 6 July 2026, so that earning door closed with it; your existing Berries are untouched and the Rewards Hub stays open.</p>
            </div>
          </div>

          {/* The shop era, honestly closed */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Cashback, Store Discount &amp; Store Credit (shop era — retired)</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>
                Until <strong className="text-ink">6 July 2026</strong>, membership also carried cashback (paid as store credit), a Platinum store discount, and store credit spendable at our own checkout. The shop era ended that day — Cambridge TCG no longer sells cards itself, so those benefits retired with it. <strong className="text-ink">No credit balances were outstanding</strong> when the door closed; nothing was taken from anyone.
              </p>
              <p>
                The full record lives at{" "}
                <Link href="/methodology/store-credit" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
                  /methodology/store-credit
                </Link>
                . Selling now happens between collectors on the <Link href="/market" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">market</Link>, in cash.
              </p>
            </div>
          </div>

          {/* Tier Progression */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Tier Progression</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Bronze, Silver, and Gold are based on your <strong className="text-ink">annual spend</strong> across the platform. Platinum is a <strong className="text-ink">paid subscription</strong> (£22/month or £222/year) that unlocks the highest tier regardless of spend.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tier Comparison */}
      <section className="border-b border-border-subtle">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-display font-semibold text-ink mb-8 text-center">Compare Tiers</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border-subtle text-ink-muted text-xs uppercase tracking-wide">
                  <th className="text-left py-3 pr-4">Perk</th>
                  <th className="text-center py-3 px-3">Bronze</th>
                  <th className="text-center py-3 px-3">Silver</th>
                  <th className="text-center py-3 px-3">Gold</th>
                  <th className="text-center py-3 px-3 text-ink font-medium">Platinum</th>
                </tr>
              </thead>
              <tbody className="text-ink-muted">
                <tr className="border-b border-border-subtle">
                  <td className="py-3 pr-4 text-ink font-medium">Requirement</td>
                  <td className="text-center py-3 px-3">Free</td>
                  <td className="text-center py-3 px-3">£100/yr spend</td>
                  <td className="text-center py-3 px-3">£500/yr spend</td>
                  <td className="text-center py-3 px-3 text-ink font-medium">£22/month</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-3 pr-4 text-ink font-medium">Berries Multiplier</td>
                  <td className="text-center py-3 px-3">1x</td>
                  <td className="text-center py-3 px-3">1.5x</td>
                  <td className="text-center py-3 px-3">2x</td>
                  <td className="text-center py-3 px-3 text-accent font-semibold">3x</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-3 pr-4 text-ink font-medium">P2P Commission</td>
                  <td className="text-center py-3 px-3">8%</td>
                  <td className="text-center py-3 px-3">6%</td>
                  <td className="text-center py-3 px-3">5%</td>
                  <td className="text-center py-3 px-3 text-ok font-semibold">0%</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-3 pr-4 text-ink font-medium">Auction Commission</td>
                  <td className="text-center py-3 px-3">12%</td>
                  <td className="text-center py-3 px-3">10%</td>
                  <td className="text-center py-3 px-3">8%</td>
                  <td className="text-center py-3 px-3 text-ok font-semibold">0%</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-ink font-medium">Priority Approval</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3">Yes</td>
                  <td className="text-center py-3 px-3 text-ok font-semibold">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Important Rules */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-display font-semibold text-ink mb-8">Important Details</h2>

          <div className="space-y-6 text-sm text-ink-muted leading-relaxed">
            <div className="bg-surface border border-border-subtle rounded-lg p-5">
              <h3 className="text-ink font-semibold mb-2">How are tiers calculated?</h3>
              <p>Bronze, Silver, and Gold are based on your <strong className="text-ink">rolling 12-month spend</strong> at Cambridge TCG. Platinum is a paid subscription that overrides spend-based tiers.</p>
            </div>

            <div className="bg-surface border border-border-subtle rounded-lg p-5">
              <h3 className="text-ink font-semibold mb-2">What happened to cashback, the store discount, and store credit?</h3>
              <p>They were shop-era benefits — they only made sense while Cambridge TCG sold cards itself. The shop era ended on <strong className="text-ink">6 July 2026</strong> with no credit balances outstanding. The record lives at <Link href="/methodology/store-credit" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">/methodology/store-credit</Link>.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-display font-semibold text-ink mb-4">Start Trading</h2>
          <p className="text-ink-muted mb-8">
            Create a free account, trade with other collectors, and let your tier lower your fees.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/login" className="px-8 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition">
              Sign Up Free
            </Link>
            <Link href="/account/membership" className="px-8 py-3 border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition">
              View My Membership
            </Link>
          </div>
          {/* Quiet onward links — where Berries go, and how tiers are decided. */}
          <p className="text-sm text-ink-faint mt-8">
            Berries are spent in the{" "}
            <Link href="/rewards" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">
              Rewards Hub
            </Link>
            .
            <WhyLink
              href="/methodology/membership-tier"
              tooltip="How membership tiers are calculated"
              label="how tiers are decided"
            />
          </p>
        </div>
      </section>
    </main>
  );
}
