import Link from "next/link";
import { WhyLink } from "@/lib/ui";

export const metadata = {
  title: "Membership — How It Works — Cambridge TCG",
  description: "Cambridge TCG membership tiers explained. Earn Berries, get cashback, unlock rewards. Bronze, Silver, Gold, and Platinum tiers.",
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
            Every purchase, every trade, every interaction earns you rewards. The more you engage, the better it gets.
          </p>
        </div>
      </section>

      {/* How Each Element Works */}
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-display font-semibold text-ink mb-10">How It All Works</h2>

          {/* Berries */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Berries</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Earn <strong className="text-ink">10 Berries per £1 spent</strong> on every cash purchase. Your tier multiplies this — Silver earns 15 Berries/£, Gold earns 20, Platinum earns 30.</p>
              <p>Berries are earned <strong className="text-ink">only on the cash portion</strong> of your payment. Store credit used at checkout does not earn Berries.</p>
              <p>Spend your Berries in the <Link href="/rewards" className="text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2">Rewards Hub</Link> — on <strong className="text-ink">virtual booster packs</strong>, <strong className="text-ink">premium daily spins</strong>, <strong className="text-ink">raffles</strong> (enter for a chance to win high-value cards), and <strong className="text-ink">mystery boxes</strong> (guaranteed rewards — bonus Berries, store credit, or real cards).</p>
              <div className="bg-surface border border-border-subtle rounded-lg p-4 mt-3">
                <p className="text-xs text-ink-faint mb-2">Example: Buy a £100 card with cash as a Gold member</p>
                <p className="text-ink font-medium">£100 × 10 Berries × 2.0x = <span className="text-accent">2,000 Berries</span></p>
              </div>
            </div>
          </div>

          {/* Cashback */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Cashback</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Earn cashback as <strong className="text-ink">store credit</strong> on every purchase. Silver gets 3%, Gold gets 5%, Platinum gets 8%.</p>
              <p><strong className="text-ink">Cashback applies only to the cash you spend</strong> — not to any store credit used in the same transaction. This means if you pay £100 cash + £50 credit, cashback is calculated on the £100 cash portion only.</p>
              <p>Cashback is credited to your account <strong className="text-ink">instantly</strong> after your purchase completes. Use it on your next order or let it accumulate.</p>
              <div className="bg-surface border border-border-subtle rounded-lg p-4 mt-3">
                <p className="text-xs text-ink-faint mb-2">Example: Buy a £100 card paying £60 cash + £40 credit as a Silver member</p>
                <p className="text-ink font-medium">Cashback: £60 (cash) × 3% = <span className="text-ok">£1.80 store credit</span></p>
                <p className="text-xs text-ink-faint mt-1">The £40 credit portion does not earn cashback.</p>
              </div>
            </div>
          </div>

          {/* Store Discount */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Store Discount</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p><strong className="text-ink">Platinum members only.</strong> Get <strong className="text-ink">12% off every purchase</strong> in the store — applied automatically at checkout.</p>
              <p>The discount reduces the actual price you pay. It applies to <strong className="text-ink">both cash and credit payments</strong>. A £100 card costs a Platinum member £88.</p>
              <p>This is different from cashback: the discount saves you money <strong className="text-ink">before</strong> you pay, while cashback gives you credit <strong className="text-ink">after</strong> you pay.</p>
              <div className="bg-surface border border-border-subtle rounded-lg p-4 mt-3">
                <p className="text-xs text-ink-faint mb-2">Example: Platinum member buys a £100 card paying cash</p>
                <p className="text-ink font-medium">Price: £100 - 12% = <span className="text-ink">£88.00</span></p>
                <p className="text-ink font-medium mt-1">Cashback: £88 × 8% = <span className="text-ok">£7.04 store credit</span></p>
                <p className="text-ink font-medium mt-1">Berries: £88 × 10 × 3x = <span className="text-accent">2,640 Berries</span></p>
                <p className="text-xs text-ink-faint mt-2">Effective cost: £88 cash - £7.04 credit back = £80.96</p>
              </div>
            </div>
          </div>

          {/* Store Credit */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Store Credit</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Store credit is earned from <strong className="text-ink">cashback, trade-ins, and rewards</strong>. It can be used to pay for any purchase in the store.</p>
              <p>When you use store credit at checkout:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Store discount (Platinum) <strong className="text-ink">applies</strong> — the price is reduced before credit is deducted</li>
                <li>Cashback does <strong className="text-ink">not apply</strong> to the credit portion — only on cash you spend</li>
                <li>Berries are <strong className="text-ink">not earned</strong> on the credit portion — only on cash</li>
              </ul>
              <p>Store credit <strong className="text-ink">can only be used at Cambridge TCG</strong>. It cannot be withdrawn as cash.</p>
              <div className="bg-surface border border-border-subtle rounded-lg p-4 mt-3">
                <p className="text-xs text-ink-faint mb-2">Example: Gold member buys £100 card with £40 credit + £60 cash</p>
                <p className="text-ink font-medium">Price: £100 (no discount — Gold doesn&apos;t have store discount)</p>
                <p className="text-ink font-medium mt-1">Pays: £40 credit + £60 cash</p>
                <p className="text-ink font-medium mt-1">Cashback: £60 × 5% = <span className="text-ok">£3.00 credit</span> (on cash only)</p>
                <p className="text-ink font-medium mt-1">Berries: £60 × 10 × 2x = <span className="text-accent">1,200 Berries</span> (on cash only)</p>
              </div>
            </div>
          </div>

          {/* Tier Progression */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-display font-semibold text-ink">Tier Progression</h3>
            </div>
            <div className="space-y-3 text-ink-muted text-sm leading-relaxed pl-13">
              <p>Your tier is based on your <strong className="text-ink">annual cash spend</strong>. Spend more, unlock better rewards automatically.</p>
              <p>Platinum is a <strong className="text-ink">paid subscription</strong> (£22/month or £222/year) that unlocks the highest tier regardless of spend.</p>
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
                  <td className="py-3 pr-4 text-ink font-medium">Store Discount</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3 text-ok font-semibold">12% off</td>
                </tr>
                <tr className="border-b border-border-subtle">
                  <td className="py-3 pr-4 text-ink font-medium">Cashback (on cash)</td>
                  <td className="text-center py-3 px-3 text-ink-faint">—</td>
                  <td className="text-center py-3 px-3">3%</td>
                  <td className="text-center py-3 px-3">5%</td>
                  <td className="text-center py-3 px-3 text-ok font-semibold">8%</td>
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
              <h3 className="text-ink font-semibold mb-2">What earns cashback and Berries?</h3>
              <p><strong className="text-ok">Cash payments</strong> — Yes, cashback and Berries are earned.</p>
              <p><strong className="text-ink">Store credit</strong> — No. Credit used at checkout does not earn cashback or Berries.</p>
              <p className="text-ink-faint mt-2">This applies to all tiers including Platinum.</p>
            </div>

            <div className="bg-surface border border-border-subtle rounded-lg p-5">
              <h3 className="text-ink font-semibold mb-2">What does the Platinum discount apply to?</h3>
              <p>The 12% store discount applies to <strong className="text-ink">the entire purchase price</strong>, regardless of whether you pay with cash, credit, or a mix. A £100 card costs £88 for Platinum members no matter how they pay.</p>
            </div>

            <div className="bg-surface border border-border-subtle rounded-lg p-5">
              <h3 className="text-ink font-semibold mb-2">How is cashback paid?</h3>
              <p>Cashback is paid as <strong className="text-ink">store credit</strong>, not cash. It is added to your account balance instantly and can be used on your next purchase.</p>
            </div>

            <div className="bg-surface border border-border-subtle rounded-lg p-5">
              <h3 className="text-ink font-semibold mb-2">How are tiers calculated?</h3>
              <p>Bronze, Silver, and Gold are based on your <strong className="text-ink">rolling 12-month cash spend</strong> at Cambridge TCG. Your tier is recalculated on every purchase. Platinum is a paid subscription that overrides spend-based tiers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-display font-semibold text-ink mb-4">Start Earning</h2>
          <p className="text-ink-muted mb-8">
            Create a free account and start earning Berries on every purchase.
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
