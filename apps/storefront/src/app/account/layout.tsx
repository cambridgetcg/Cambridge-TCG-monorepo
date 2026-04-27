"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/portfolio", label: "Portfolio" },
  { href: "/account/sets", label: "Set Progress" },
  { href: "/account/portfolio/value", label: "Collection Value" },
  { href: "/account", label: "Overview" },
  { href: "/account/journey", label: "Activity" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/messages", label: "Messages" },
  { href: "/account/followers", label: "Followers" },
  { href: "/account/following", label: "Following" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/vault", label: "Vault" },
  { href: "/account/proofs", label: "My Proofs" },
  { href: "/account/trade-ins", label: "Trade-Ins" },
  { href: "/account/trades", label: "Trades" },
  { href: "/account/offers", label: "Offers" },
  { href: "/account/trade-cancels", label: "Cancellations" },
  { href: "/account/returns", label: "Returns" },
  { href: "/account/auctions", label: "My Auctions" },
  { href: "/account/auctions/won", label: "Auctions Won" },
  { href: "/account/lots", label: "My Lots" },
  { href: "/account/vacation", label: "Vacation" },
  { href: "/account/pricing-rules", label: "Pricing Rules" },
  { href: "/account/watchlist", label: "Watchlist" },
  { href: "/account/searches", label: "Saved Searches" },
  { href: "/account/demand", label: "Demand Signals" },
  { href: "/account/payouts", label: "Payouts" },
  { href: "/account/rewards", label: "Prizes" },
  { href: "/account/verify", label: "Verification" },
  { href: "/account/trust", label: "Trust Score" },
  { href: "/account/reviews", label: "Reviews" },
  { href: "/account/external-rep", label: "External Rep" },
  { href: "/account/chargebacks", label: "Chargebacks" },
  { href: "/account/refunds", label: "Refunds" },
  { href: "/account/payment-issues", label: "Payment Issues" },
  { href: "/account/standing", label: "Account Standing" },
  { href: "/account/membership", label: "Membership" },
  { href: "/account/billing", label: "Billing" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Most-specific-match wins so that nested routes (e.g.
  // /account/auctions/won) only highlight the deepest matching item
  // rather than both the parent and the child.
  function isActive(href: string) {
    if (href === "/account") return pathname === "/account";
    let bestLen = 0;
    for (const item of NAV_ITEMS) {
      if (item.href === "/account") continue;
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        bestLen = Math.max(bestLen, item.href.length);
      }
    }
    return (pathname === href || pathname.startsWith(href + "/")) && href.length === bestLen;
  }

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Mobile: horizontal tabs */}
        <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex gap-8">
          {/* Desktop: left sidebar */}
          <aside className="hidden md:block w-48 shrink-0">
            <nav className="flex flex-col gap-1 sticky top-8">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive(item.href)
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Page content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
