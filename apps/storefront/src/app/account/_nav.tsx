"use client";

/**
 * Account sub-nav — Stage 1 of the account-centre simplification.
 *
 * V3: the six collapsible sections (V2, kingdom-093) shrink to a
 * three-group primary nav — the dozen surfaces members actually live in —
 * plus a single "More tools" link below a rule. Every page that left the
 * sidebar keeps working at its URL and gets a front door on the
 * /account/tools hub, so nothing 404s and old bookmarks survive.
 *
 * Mobile: horizontal tab scroll preserved (flat). Desktop: vertical
 * sidebar with always-visible group headings — three small groups don't
 * earn collapse machinery, so V2's expand/collapse state is gone.
 *
 * Active-state mechanics carried over from V2 (most-specific-match wins),
 * with one addition: when the visitor is on a demoted page that no
 * primary item covers, "More tools" lights up as the catch-all — the
 * sidebar always tells you which door you came through.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

interface Section {
  label: string;
  items: NavItem[];
}

export const ACCOUNT_NAV_SECTIONS: Section[] = [
  {
    label: "Account",
    items: [
      { href: "/account", label: "Overview" },
      { href: "/account/notifications", label: "Notifications" },
      { href: "/account/messages", label: "Messages" },
      { href: "/account/profile", label: "Profile & settings" },
      // Sister-shipped mid-rebase (kingdom-095, the wardrobe). Self-
      // expression sits with Profile, first-class — verify, don't overwrite.
      { href: "/appearance", label: "Appearance" },
    ],
  },
  {
    label: "Shopping & money",
    items: [
      { href: "/account/orders", label: "Orders" },
      { href: "/account/trades", label: "Trades" },
      // Incoming price negotiations. Previously reachable only from a
      // single ephemeral notification (walker: a seller who missed it had
      // no path back to a 48h-expiring offer). The badge counts pending +
      // countered offers awaiting the seller's response.
      { href: "/account/offers", label: "Offers" },
      { href: "/account/swaps", label: "Swaps" },
      { href: "/account/refunds", label: "Payments & refunds" },
      { href: "/account/payouts", label: "Payouts" },
      { href: "/account/membership", label: "Membership" },
    ],
  },
  {
    label: "Collection",
    items: [
      { href: "/account/portfolio", label: "Portfolio" },
      { href: "/account/wishlist", label: "Wishlist" },
    ],
  },
];

/** The hub link — rendered separated at the bottom of the sidebar. */
export const MORE_TOOLS_ITEM: NavItem = { href: "/account/tools", label: "More tools" };

/**
 * Flat list (groups in order + the hub link) — feeds the mobile tab strip
 * and any module that wants the primary nav without the grouping. The
 * export name is preserved from V1/V2; the contents are now the curated
 * twelve, not the 41-item long tail (that lives on /account/tools).
 */
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  ...ACCOUNT_NAV_SECTIONS.flatMap((section) => section.items),
  MORE_TOOLS_ITEM,
];

/**
 * Most-specific-match wins for highlighting: /account/portfolio/value
 * lights Portfolio, /account/trades/abc lights Trades. When nothing in
 * the primary nav covers the path (a demoted page — /account/trust,
 * /account/vault, ...) the hub link lights instead, because that's the
 * door the visitor came through.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === "/account") return pathname === "/account";
  let bestLen = 0;
  for (const item of ACCOUNT_NAV_ITEMS) {
    if (item.href === "/account") continue;
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      bestLen = Math.max(bestLen, item.href.length);
    }
  }
  if (bestLen === 0) {
    return href === MORE_TOOLS_ITEM.href && pathname.startsWith("/account/");
  }
  return (pathname === href || pathname.startsWith(href + "/")) && href.length === bestLen;
}

/** A small count pill for a nav item — the pending-offers badge, e.g. */
function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-page text-[10px] font-semibold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AccountNav({ badges }: { badges?: Record<string, number> }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile: horizontal tabs (flat — preserved for thumb-scrolling) */}
      <nav className="flex gap-2 overflow-x-auto pb-4 mb-6 md:hidden">
        {ACCOUNT_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
              isActive(pathname, item.href)
                ? "bg-accent-wash text-accent-strong"
                : "text-ink-muted hover:text-ink hover:bg-surface-subtle"
            }`}
          >
            {item.label}
            <NavBadge count={badges?.[item.href] ?? 0} />
          </Link>
        ))}
      </nav>

      {/* Desktop: three always-visible groups + the hub link below a rule */}
      <aside className="hidden md:block w-56 shrink-0">
        <nav className="flex flex-col gap-1 sticky top-8">
          {ACCOUNT_NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-1">
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                {section.label}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition ${
                        isActive(pathname, item.href)
                          ? "bg-accent-wash text-accent-strong"
                          : "text-ink-muted hover:text-ink hover:bg-surface-subtle"
                      }`}
                    >
                      {item.label}
                      <NavBadge count={badges?.[item.href] ?? 0} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* The long tail lives behind one door. */}
          <div className="border-t border-border-subtle mt-1 pt-2">
            <Link
              href={MORE_TOOLS_ITEM.href}
              className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive(pathname, MORE_TOOLS_ITEM.href)
                  ? "bg-accent-wash text-accent-strong"
                  : "text-ink-muted hover:text-ink hover:bg-surface-subtle"
              }`}
            >
              {MORE_TOOLS_ITEM.label} →
            </Link>
          </div>
        </nav>
      </aside>
    </>
  );
}
