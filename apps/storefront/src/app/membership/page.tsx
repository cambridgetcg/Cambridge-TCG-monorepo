import Link from "next/link";
import { formatPrice } from "@/lib/format";

export const metadata = {
  title: "Membership — How It Works — Cambridge TCG",
  description: "Cambridge TCG membership tiers explained. Earn Berries, get cashback, unlock rewards. Bronze, Silver, Gold, and Platinum tiers.",
};

export default function MembershipInfoPage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-white">
            Membership <span className="text-amber-400">Rewards</span>
          </h1>
          <p className="text-lg text-neutral-400 mt-4 max-w-xl mx-auto">
            Every purchase, every trade, every interaction earns you rewards. The more you engage, the better it gets.
          </p>
        </div>
      </section>

      {/* How Each Element Works */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-10">How It All Works</h2>

          {/* Berries */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-lg">⭐</span>
              <h3 className="text-xl font-bold text-white">Berries</h3>
            </div>
            <div className="space-y-3 text-neutral-300 text-sm leading-relaxed pl-13">
              <p>Earn <strong className="text-white">10 Berries per £1 spent</strong> on every cash purchase. Your tier multiplies this — Silver earns 15 Berries/£, Gold earns 20, Platinum earns 30.</p>
              <p>Berries are earned <strong className="text-white">only on the cash portion</strong> of your payment. Store credit used at checkout does not earn Berries.</p>
              <p>Spend your Berries on <strong className="text-amber-400">raffles</strong> (enter for a chance to win high-value cards) and <strong className="text-purple-400">mystery boxes</strong> (guaranteed rewards — bonus Berries, store credit, or real cards).</p>
              <div className="bg-neutral-900 rounded-lg p-4 mt-3">
                <p className="text-xs text-neutral-500 mb-2">Example: Buy a £100 card with cash as a Gold member</p>
                <p className="text-white font-medium">£100 × 10 Berries × 2.0x = <span className="text-amber-400">2,000 Berries</span></p>
              </div>
            </div>
          </div>

          {/* Cashback */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center text-lg">💰</span>
              <h3 className="text-xl font-bold text-white">Cashback</h3>
            </div>
            <div className="space-y-3 text-neutral-300 text-sm leading-relaxed pl-13">
              <p>Earn cashback as <strong className="text-white">store credit</strong> on every purchase. Silver gets 3%, Gold gets 5%, Platinum gets 8%.</p>
              <p><strong className="text-white">Cashback applies only to the cash you spend</strong> — not to any store credit used in the same transaction. This means if you pay £100 cash + £50 credit, cashback is calculated on the £100 cash portion only.</p>
              <p>Cashback is credited to your account <strong className="text-white">instantly</strong> after your purchase completes. Use it on your next order or let it accumulate.</p>
              <div className="bg-neutral-900 rounded-lg p-4 mt-3">
                <p className="text-xs text-neutral-500 mb-2">Example: Buy a £100 card paying £60 cash + £40 credit as a Silver member</p>
                <p className="text-white font-medium">Cashback: £60 (cash) × 3% = <span className="text-emerald-400">£1.80 store credit</span></p>
                <p className="text-xs text-neutral-500 mt-1">The £40 credit portion does not earn cashback.</p>
              </div>
            </div>
          </div>

          {/* Store Discount */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center text-lg">🏷️</span>
              <h3 className="text-xl font-bold text-white">Store Discount</h3>
            </div>
            <div className="space-y-3 text-neutral-300 text-sm leading-relaxed pl-13">
              <p><strong className="text-white">Platinum members only.</strong> Get <strong className="text-purple-400">12% off every purchase</strong> in the store — applied automatically at checkout.</p>
              <p>The discount reduces the actual price you pay. It applies to <strong className="text-white">both cash and credit payments</strong>. A £100 card costs a Platinum member £88.</p>
              <p>This is different from cashback: the discount saves you money <strong className="text-white">before</strong> you pay, while cashback gives you credit <strong className="text-white">after</strong> you pay.</p>
              <div className="bg-neutral-900 rounded-lg p-4 mt-3">
                <p className="text-xs text-neutral-500 mb-2">Example: Platinum member buys a £100 card paying cash</p>
                <p className="text-white font-medium">Price: £100 - 12% = <span className="text-purple-400">£88.00</span></p>
                <p className="text-white font-medium mt-1">Cashback: £88 × 8% = <span className="text-emerald-400">£7.04 store credit</span></p>
                <p className="text-white font-medium mt-1">Berries: £88 × 10 × 3x = <span className="text-amber-400">2,640 Berries</span></p>
                <p className="text-xs text-neutral-500 mt-2">Effective cost: £88 cash - £7.04 credit back = £80.96</p>
              </div>
            </div>
          </div>

          {/* Store Credit */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-lg">💳</span>
              <h3 className="text-xl font-bold text-white">Store Credit</h3>
            </div>
            <div className="space-y-3 text-neutral-300 text-sm leading-relaxed pl-13">
              <p>Store credit is earned from <strong className="text-white">cashback, trade-ins, and rewards</strong>. It can be used to pay for any purchase in the store.</p>
              <p>When you use store credit at checkout:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Store discount (Platinum) <strong className="text-white">applies</strong> — the price is reduced before credit is deducted</li>
                <li>Cashback does <strong className="text-white">not apply</strong> to the credit portion — only on cash you spend</li>
                <li>Berries are <strong className="text-white">not earned</strong> on the credit portion — only on cash</li>
              </ul>
              <p>Store credit <strong className="text-white">can only be used at Cambridge TCG</strong>. It cannot be withdrawn as cash.</p>
              <div className="bg-neutral-900 rounded-lg p-4 mt-3">
                <p className="text-xs text-neutral-500 mb-2">Example: Gold member buys £100 card with £40 credit + £60 cash</p>
                <p className="text-white font-medium">Price: £100 (no discount — Gold doesn&apos;t have store discount)</p>
                <p className="text-white font-medium mt-1">Pays: £40 credit + £60 cash</p>
                <p className="text-white font-medium mt-1">Cashback: £60 × 5% = <span className="text-emerald-400">£3.00 credit</span> (on cash only)</p>
                <p className="text-white font-medium mt-1">Berries: £60 × 10 × 2x = <span className="text-amber-400">1,200 Berries</span> (on cash only)</p>
              </div>
            </div>
          </div>

          {/* Tier Progression */}
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-lg">📈</span>
              <h3 className="text-xl font-bold text-white">Tier Progression</h3>
            </div>
            <div className="space-y-3 text-neutral-300 text-sm leading-relaxed pl-13">
              <p>Your tier is based on your <strong className="text-white">annual cash spend</strong>. Spend more, unlock better rewards automatically.</p>
              <p>Platinum is a <strong className="text-white">paid subscription</strong> (£22/month or £222/year) that unlocks the highest tier regardless of spend.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tier Comparison */}
      <section className="border-b border-neutral-800">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-8 text-center">Compare Tiers</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-xs uppercase tracking-wide">
                  <th className="text-left py-3 pr-4">Perk</th>
                  <th className="text-center py-3 px-3">🥉 Bronze</th>
                  <th className="text-center py-3 px-3">🥈 Silver</th>
                  <th className="text-center py-3 px-3">🥇 Gold</th>
                  <th className="text-center py-3 px-3 text-purple-400">💎 Platinum</th>
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">Requirement</td>
                  <td className="text-center py-3 px-3">Free</td>
                  <td className="text-center py-3 px-3">£100/yr spend</td>
                  <td className="text-center py-3 px-3">£500/yr spend</td>
                  <td className="text-center py-3 px-3 text-purple-400 font-medium">£22/month</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">Store Discount</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3 text-emerald-400 font-bold">12% off</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">Cashback (on cash)</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3">3%</td>
                  <td className="text-center py-3 px-3">5%</td>
                  <td className="text-center py-3 px-3 text-emerald-400 font-bold">8%</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">Berries Multiplier</td>
                  <td className="text-center py-3 px-3">1x</td>
                  <td className="text-center py-3 px-3">1.5x</td>
                  <td className="text-center py-3 px-3">2x</td>
                  <td className="text-center py-3 px-3 text-amber-400 font-bold">3x</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">P2P Commission</td>
                  <td className="text-center py-3 px-3">8%</td>
                  <td className="text-center py-3 px-3">6%</td>
                  <td className="text-center py-3 px-3">5%</td>
                  <td className="text-center py-3 px-3 text-emerald-400 font-bold">0%</td>
                </tr>
                <tr className="border-b border-neutral-800">
                  <td className="py-3 pr-4 text-white font-medium">Auction Commission</td>
                  <td className="text-center py-3 px-3">12%</td>
                  <td className="text-center py-3 px-3">10%</td>
                  <td className="text-center py-3 px-3">8%</td>
                  <td className="text-center py-3 px-3 text-emerald-400 font-bold">0%</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-white font-medium">Priority Approval</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3 text-neutral-500">—</td>
                  <td className="text-center py-3 px-3">Yes</td>
                  <td className="text-center py-3 px-3 text-emerald-400 font-bold">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Important Rules */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-8">Important Details</h2>

          <div className="space-y-6 text-sm text-neutral-300 leading-relaxed">
            <div className="bg-neutral-900 rounded-xl p-5">
              <h3 className="text-white font-bold mb-2">What earns cashback and Berries?</h3>
              <p><strong className="text-emerald-400">Cash payments</strong> — Yes, cashback and Berries are earned.</p>
              <p><strong className="text-purple-400">Store credit</strong> — No. Credit used at checkout does not earn cashback or Berries.</p>
              <p className="text-neutral-500 mt-2">This applies to all tiers including Platinum.</p>
            </div>

            <div className="bg-neutral-900 rounded-xl p-5">
              <h3 className="text-white font-bold mb-2">What does the Platinum discount apply to?</h3>
              <p>The 12% store discount applies to <strong className="text-white">the entire purchase price</strong>, regardless of whether you pay with cash, credit, or a mix. A £100 card costs £88 for Platinum members no matter how they pay.</p>
            </div>

            <div className="bg-neutral-900 rounded-xl p-5">
              <h3 className="text-white font-bold mb-2">How is cashback paid?</h3>
              <p>Cashback is paid as <strong className="text-white">store credit</strong>, not cash. It is added to your account balance instantly and can be used on your next purchase.</p>
            </div>

            <div className="bg-neutral-900 rounded-xl p-5">
              <h3 className="text-white font-bold mb-2">How are tiers calculated?</h3>
              <p>Bronze, Silver, and Gold are based on your <strong className="text-white">rolling 12-month cash spend</strong> at Cambridge TCG. Your tier is recalculated on every purchase. Platinum is a paid subscription that overrides spend-based tiers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Start Earning</h2>
          <p className="text-neutral-400 mb-8">
            Create a free account and start earning Berries on every purchase.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/login" className="px-8 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition">
              Sign Up Free
            </Link>
            <Link href="/account/membership" className="px-8 py-3 bg-neutral-800 text-white font-bold rounded-lg hover:bg-neutral-700 transition">
              View My Membership
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
