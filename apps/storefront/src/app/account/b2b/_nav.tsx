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
  { href: "/account/b2b/orders", label: "Orders", prefix: "/account/b2b/orders" },
] as const;

function isActive(pathname: string, item: typeof B2B_NAV_ITEMS[number]): boolean {
  if ("exact" in item && item.exact) return pathname === item.href;
  if ("prefix" in item && item.prefix) {
    return pathname === item.href || pathname.startsWith(item.prefix + "/");
  }
  return false;
}

export function B2BNav() {
  const pathname = usePathname() ?? "/account/b2b";
  // The "Cards" item is a child detail surface — only render in the strip
  // when the user is already on a /cards/* route, otherwise it's clutter.
  const visibleItems = B2B_NAV_ITEMS.filter((item) => {
    if (!("hideTopLevel" in item && item.hideTopLevel)) return true;
    return pathname.startsWith(item.href);
  });

  return (
    <nav className="mb-6 border-b border-neutral-800">
      <div className="flex flex-wrap gap-1 -mb-px">
        {visibleItems.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors " +
                (active
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-neutral-400 hover:text-neutral-200 hover:border-neutral-700")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
