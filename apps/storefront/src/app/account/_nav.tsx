"use client";

/**
 * Account sub-nav (kingdom-093 — Phase 3 of the nav upgrade).
 *
 * V2: the 41-item flat list is now grouped into 6 collapsible sections.
 * Mobile: horizontal tab scroll preserved (flat); desktop: vertical
 * sidebar with collapsible group headings.
 *
 * The ACCOUNT_NAV_ITEMS export shape is preserved (other modules read
 * it). The grouped structure adds ACCOUNT_NAV_SECTIONS alongside.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const ACCOUNT_NAV_ITEMS = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/portfolio", label: "Portfolio" },
  { href: "/account/sets", label: "Set Progress" },
  { href: "/account/portfolio/value", label: "Collection Value" },
  { href: "/account/wishlist", label: "Wishlist" },
  { href: "/account", label: "Overview" },
  { href: "/account/journey", label: "Activity" },
  { href: "/account/notifications", label: "Notifications" },
  { href: "/account/messages", label: "Messages" },
  { href: "/account/emails", label: "Email Preferences" },
  { href: "/account/followers", label: "Followers" },
  { href: "/account/following", label: "Following" },
  { href: "/account/collectives", label: "Collectives" },
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
  { href: "/account/agents", label: "Agents" },
  { href: "/account/trader", label: "Trader Dashboard" },
] as const;

type SectionId =
  | "overview"
  | "profile"
  | "collection"
  | "activity"
  | "buysell"
  | "trader"
  | "money";

interface Section {
  id: SectionId;
  label: string;
  items: { href: string; label: string }[];
}

export const ACCOUNT_NAV_SECTIONS: Section[] = [
  {
    id: "overview",
    label: "Overview",
    items: [{ href: "/account", label: "Overview" }],
  },
  {
    id: "profile",
    label: "Profile & Reputation",
    items: [
      { href: "/account/profile", label: "Profile" },
      { href: "/account/trust", label: "Trust Score" },
      { href: "/account/reviews", label: "Reviews" },
      { href: "/account/external-rep", label: "External Rep" },
      { href: "/account/verify", label: "Verification" },
    ],
  },
  {
    id: "collection",
    label: "Collection",
    items: [
      { href: "/account/portfolio", label: "Portfolio" },
      { href: "/account/portfolio/value", label: "Collection Value" },
      { href: "/account/sets", label: "Set Progress" },
      { href: "/account/wishlist", label: "Wishlist" },
      { href: "/account/vault", label: "Vault" },
      { href: "/account/proofs", label: "My Proofs" },
    ],
  },
  {
    id: "activity",
    label: "Activity & Social",
    items: [
      { href: "/account/journey", label: "Activity" },
      { href: "/account/notifications", label: "Notifications" },
      { href: "/account/messages", label: "Messages" },
      { href: "/account/emails", label: "Email Preferences" },
      { href: "/account/followers", label: "Followers" },
      { href: "/account/following", label: "Following" },
      { href: "/account/collectives", label: "Collectives" },
    ],
  },
  {
    id: "buysell",
    label: "Buy & Sell",
    items: [
      { href: "/account/orders", label: "Orders" },
      { href: "/account/trade-ins", label: "Trade-Ins" },
      { href: "/account/trades", label: "Trades" },
      { href: "/account/offers", label: "Offers" },
      { href: "/account/returns", label: "Returns" },
      { href: "/account/trade-cancels", label: "Cancellations" },
      { href: "/account/auctions", label: "My Auctions" },
      { href: "/account/auctions/won", label: "Auctions Won" },
      { href: "/account/lots", label: "My Lots" },
      { href: "/account/watchlist", label: "Watchlist" },
      { href: "/account/searches", label: "Saved Searches" },
      { href: "/account/demand", label: "Demand Signals" },
    ],
  },
  {
    id: "trader",
    label: "Trader operations",
    items: [
      { href: "/account/trader", label: "Trader Dashboard" },
      { href: "/account/pricing-rules", label: "Pricing Rules" },
      { href: "/account/vacation", label: "Vacation" },
      { href: "/account/agents", label: "Agents" },
    ],
  },
  {
    id: "money",
    label: "Money & Membership",
    items: [
      { href: "/account/payouts", label: "Payouts" },
      { href: "/account/rewards", label: "Prizes" },
      { href: "/account/membership", label: "Membership" },
      { href: "/account/billing", label: "Billing" },
      { href: "/account/chargebacks", label: "Chargebacks" },
      { href: "/account/refunds", label: "Refunds" },
      { href: "/account/payment-issues", label: "Payment Issues" },
      { href: "/account/standing", label: "Account Standing" },
    ],
  },
];

/**
 * Pick the section ID whose items contain the current pathname (deepest
 * match wins). Used to auto-expand the right section on mount.
 */
function sectionForPath(pathname: string): SectionId | null {
  let bestLen = 0;
  let best: SectionId | null = null;
  for (const section of ACCOUNT_NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        if (item.href.length > bestLen) {
          bestLen = item.href.length;
          best = section.id;
        }
      }
    }
  }
  return best;
}

export function AccountNav() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Set<SectionId>>(new Set());

  // Auto-expand the section matching the current route (on mount + path change)
  useEffect(() => {
    const active = sectionForPath(pathname);
    if (active) {
      setExpanded((prev) => {
        if (prev.has(active)) return prev;
        const next = new Set(prev);
        next.add(active);
        return next;
      });
    }
  }, [pathname]);

  // Most-specific-match wins for highlighting
  function isActive(href: string) {
    if (href === "/account") return pathname === "/account";
    let bestLen = 0;
    for (const section of ACCOUNT_NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.href === "/account") continue;
        if (pathname === item.href || pathname.startsWith(item.href + "/")) {
          bestLen = Math.max(bestLen, item.href.length);
        }
      }
    }
    return (pathname === href || pathname.startsWith(href + "/")) && href.length === bestLen;
  }

  function toggleSection(id: SectionId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {/* Mobile: horizontal tabs (flat — preserved for thumb-scrolling) */}
      <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 md:hidden">
        {ACCOUNT_NAV_ITEMS.map((item) => (
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

      {/* Desktop: grouped vertical sidebar with collapsible sections */}
      <aside className="hidden md:block w-56 shrink-0">
        <nav className="flex flex-col gap-1 sticky top-8">
          {ACCOUNT_NAV_SECTIONS.map((section) => {
            const isExpanded = expanded.has(section.id);
            const isOverview = section.id === "overview";
            // Overview section: render as a single link (no collapse)
            if (isOverview) {
              const item = section.items[0];
              return (
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
              );
            }
            return (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
                  aria-expanded={isExpanded}
                >
                  <span>{section.label}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <ul className="space-y-0.5 mt-1">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`block px-4 py-2 rounded-lg text-sm font-medium transition ${
                            isActive(item.href)
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "text-neutral-400 hover:text-white hover:bg-neutral-900"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
