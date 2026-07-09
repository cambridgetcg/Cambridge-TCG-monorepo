"use client";

/**
 * B2B shell sub-nav.
 *
 * A small horizontal tab strip at the top of every /account/b2b/* page.
 * The parent /account/layout.tsx already renders the full AccountNav
 * sidebar — this is the inner navigation specific to the wholesale
 * mini-app.
 *
 * Active-tab highlighting is path-prefix based (e.g. /account/b2b/cards/X
 * keeps "Catalog" active).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const B2B_NAV_ITEMS = [
  { href: "/account/b2b", label: "Overview", exact: true },
  { href: "/account/b2b/catalog", label: "Catalog", prefix: "/account/b2b/catalog" },
  { href: "/account/b2b/cards", label: "Cards", prefix: "/account/b2b/cards", hideTopLevel: true },
  { href: "/account/b2b/cart", label: "Cart", prefix: "/account/b2b/cart", badge: "cart" as const },
  { href: "/account/b2b/orders", label: "Orders", prefix: "/account/b2b/orders" },
] as const;

function isActive(pathname: string, item: typeof B2B_NAV_ITEMS[number]): boolean {
  if ("exact" in item && item.exact) return pathname === item.href;
  if ("prefix" in item && item.prefix) {
    return pathname === item.href || pathname.startsWith(item.prefix + "/");
  }
  return false;
}

export function B2BNav({ cartCount = 0 }: { cartCount?: number }) {
  const pathname = usePathname() ?? "/account/b2b";
  // The "Cards" item is a child detail surface — only render in the strip
  // when the user is already on a /cards/* route, otherwise it's clutter.
  const visibleItems = B2B_NAV_ITEMS.filter((item) => {
    if (!("hideTopLevel" in item && item.hideTopLevel)) return true;
    return pathname.startsWith(item.href);
  });

  return (
    <nav className="mb-6 border-b border-border-subtle">
      <div className="flex flex-wrap gap-1 -mb-px">
        {visibleItems.map((item) => {
          const active = isActive(pathname, item);
          const badge = "badge" in item && item.badge === "cart" && cartCount > 0 ? cartCount : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-1.5 " +
                (active
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink hover:border-border-strong")
              }
            >
              {item.label}
              {badge !== null && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-accent text-page text-xs font-semibold leading-none">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
