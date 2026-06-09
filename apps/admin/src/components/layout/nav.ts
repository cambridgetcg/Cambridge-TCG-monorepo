/**
 * Admin sidebar navigation — the single source of truth for the IA.
 *
 * Extracted from Sidebar.tsx (kingdom: substrate-honesty pass) so the
 * structure can be imported by both the React component AND the nav test
 * without a duplicated copy that silently drifts. Before this split, the
 * test re-declared a stale copy of NAV and asserted "27 items" while the
 * live sidebar had grown to 28 (+ /trust/agents) — green, but verifying
 * nothing. There is now one NAV; the test validates the real one.
 *
 * 7 groups from the IA design:
 *   Overview
 *   Ops        → Stock, Orders, Fulfillment, Channels
 *   Commerce   → Pricing, Trade-Ins, Auctions, Market, Bounty
 *   Money      → Payouts, Chargebacks, Rewards, Membership
 *   Trust      → Fraud, Disputes, Reviews, KYC, Agents
 *   Catalog    → Cards (+ Classify, Review queue), Games, Clients, Users
 *   System     → Deploys, Cron, Email, Audit, Admin
 */

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

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional sub-items — expanded inline when the parent or any sub is active. */
  subItems?: { href: string; label: string }[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
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
