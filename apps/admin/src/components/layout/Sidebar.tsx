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
      { href: "/commerce/trade-ins",  label: "Trade-Ins",  icon: ArrowLeftRight },
      { href: "/commerce/auctions",   label: "Auctions",   icon: Gavel },
      { href: "/commerce/market",     label: "Market",     icon: Store },
      { href: "/commerce/bounty",     label: "Bounty",     icon: Zap },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/money/payouts",     label: "Payouts",    icon: CreditCard },
      { href: "/money/chargebacks", label: "Chargebacks", icon: AlertTriangle },
      { href: "/money/rewards",     label: "Rewards",    icon: Gift },
      { href: "/money/membership",  label: "Membership", icon: Users2 },
    ],
  },
  {
    label: "Trust",
    items: [
      { href: "/trust/fraud",     label: "Fraud",     icon: Shield },
      { href: "/trust/disputes",  label: "Disputes",  icon: MessageSquare },
      { href: "/trust/reviews",   label: "Reviews",   icon: Star },
      { href: "/trust/kyc",       label: "KYC",       icon: UserCheck },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/catalog/cards",   label: "Cards",   icon: BookOpen },
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
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors",
                    active
                      ? "bg-blue-500/10 text-blue-400 font-medium"
                      : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800",
                  ].join(" ")}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
