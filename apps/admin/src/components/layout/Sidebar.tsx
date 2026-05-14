"use client";

/**
 * Admin sidebar navigation — 7 groups from the IA design.
 *
 * Groups:
 *   Overview
 *   Ops        → Stock, Orders, Fulfillment, Channels
 *   Commerce   → Pricing, Trade-Ins, Auctions, Market, Bounty
 *   Money      → Payouts, Chargebacks, Rewards, Membership
 *   Trust      → Fraud, Disputes, Reviews, KYC
 *   Catalog    → Cards, Games, Clients, Users
 *   System     → Cron, Email, Audit, Admin
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wifi,
  Tag,
  ArrowLeftRight,
  Gavel,
  Store,
  Zap,
  CreditCard,
  AlertTriangle,
  Gift,
  Users2,
  Shield,
  MessageSquare,
  Star,
  UserCheck,
  BookOpen,
  Gamepad2,
  Building2,
  Users,
  Clock,
  Mail,
  ScrollText,
  Settings,
  Rocket,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * When true, href is an absolute URL to an external surface (e.g. storefront Manager).
   * Rendered as <a target="_self"> rather than next/link <Link>.
   */
  external?: boolean;
  /** Optional sub-items — expanded inline when the parent or any sub is active. */
  subItems?: { href: string; label: string }[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Ops",
    items: [
      { href: "/ops/stock",       label: "Stock",       icon: Package },
      { href: "/ops/orders",      label: "Orders",      icon: ShoppingCart },
      { href: "/ops/fulfillment", label: "Fulfillment", icon: Truck },
      { href: "/ops/channels",    label: "Channels",    icon: Wifi },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/commerce/pricing",    label: "Pricing",    icon: Tag },
      { href: "https://cambridgetcg.com/admin/trade-ins", label: "Trade-Ins", icon: ArrowLeftRight, external: true },
      { href: "https://cambridgetcg.com/admin/auctions", label: "Auctions",  icon: Gavel,          external: true },
      { href: "https://cambridgetcg.com/admin/market",   label: "Market",    icon: Store,           external: true },
      { href: "https://cambridgetcg.com/admin/bounty",   label: "Bounty",    icon: Zap,             external: true },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "https://cambridgetcg.com/admin/payouts",     label: "Payouts",     icon: CreditCard,    external: true },
      { href: "https://cambridgetcg.com/admin/chargebacks", label: "Chargebacks", icon: AlertTriangle,  external: true },
      { href: "https://cambridgetcg.com/admin/rewards",     label: "Rewards",     icon: Gift,           external: true },
      { href: "/money/membership",  label: "Membership", icon: Users2 },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "https://cambridgetcg.com/admin/fraud",     label: "Fraud",     icon: Shield,        external: true },
      { href: "https://cambridgetcg.com/admin/disputes",  label: "Disputes",  icon: MessageSquare, external: true },
      { href: "https://cambridgetcg.com/admin/reviews",   label: "Reviews",   icon: Star,          external: true },
      { href: "/trust/kyc",       label: "KYC",       icon: UserCheck },
      { href: "/trust/agents",    label: "Agents",    icon: Users2 },
    ],
  },
  {
    label: "Catalog",
    items: [
      {
        href: "/catalog/cards",
        label: "Cards",
        icon: BookOpen,
        // kingdom-089 sub-tree: classify is the first live sub-module under the
        // ComingSoon catalog Manager surface (kingdom-026 still pending).
        subItems: [
          { href: "/catalog/cards/classify",        label: "Classify" },
          { href: "/catalog/cards/classify/review", label: "Review queue" },
        ],
      },
      { href: "/catalog/games",   label: "Games",   icon: Gamepad2 },
      { href: "/catalog/clients", label: "Clients", icon: Building2 },
      { href: "/catalog/users",   label: "Users",   icon: Users },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/system/deploys", label: "Deploys", icon: Rocket },
      { href: "/system/cron",    label: "Cron",    icon: Clock },
      { href: "/system/email",   label: "Email",   icon: Mail },
      { href: "/system/audit",   label: "Audit",   icon: ScrollText },
      { href: "/system/admin",   label: "Admin",   icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-[220px] flex flex-col bg-neutral-950 border-r border-neutral-800">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-neutral-800 shrink-0">
        <span className="text-sm font-semibold text-white tracking-tight">Cambridge TCG</span>
        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 ml-auto">
          Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group label — hidden for Overview (single item) */}
            {group.label !== "Overview" && (
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-0.5">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              // External items are absolute URLs to storefront Manager; never "active" in admin.
              const active = !item.external && (pathname === item.href || pathname.startsWith(item.href + "/"));
              const Icon = item.icon;
              const linkClass = [
                "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-blue-500/10 text-blue-400 font-medium"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800",
              ].join(" ");
              return (
                <div key={item.href}>
                  {item.external ? (
                    <a href={item.href} target="_self" className={linkClass}>
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </a>
                  ) : (
                  <Link
                    href={item.href}
                    className={linkClass}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {item.label}
                  </Link>
                  )}
                  {item.subItems && active && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.subItems.map((sub) => {
                        const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={[
                              "block px-2 py-1 rounded-md text-xs transition-colors",
                              subActive
                                ? "bg-blue-500/10 text-blue-400 font-medium"
                                : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800",
                            ].join(" ")}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
