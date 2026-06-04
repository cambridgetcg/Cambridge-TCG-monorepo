"use client";

/**
 * Nav — storefront primary navigation (kingdom-092).
 *
 * V2: replaces the previous 7-flat-link nav with 7 mega-menus driven
 * by the typed config at `@/lib/nav/menu-config.ts`. Desktop renders
 * <MegaMenu> dropdowns; mobile renders an accordion drawer.
 *
 * Preserves the v0 cart-drawer, notification-bell, and auth-aware
 * Sign-in/Account behavior. URL space unchanged — only nav surface.
 */

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { MegaMenu } from "./MegaMenu";
import { STOREFRONT_PRIMARY_NAV } from "@/lib/nav/menu-config";

export default function Nav() {
  const { totalItems, openDrawer } = useCart();
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => {});
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
    setExpanded(null);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/images/icon.png"
            alt="Cambridge TCG"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="text-xl font-black text-white hidden sm:inline">
            Cambridge <span className="text-emerald-400">TCG</span>
          </span>
        </Link>

        {/* Desktop nav — mega-menus */}
        <div className="hidden md:flex items-center gap-6">
          {STOREFRONT_PRIMARY_NAV.map((menu) => (
            <MegaMenu key={menu.l1} menu={menu} loggedIn={loggedIn} />
          ))}
          <Link
            href="/catalog"
            className="text-sm text-neutral-300 hover:text-white transition py-2"
          >
            Browse cards
          </Link>
          <Link
            href={loggedIn ? "/account" : "/login"}
            className="text-sm text-neutral-300 hover:text-white transition py-2"
          >
            {loggedIn ? "Account" : "Sign In"}
          </Link>
          {loggedIn && <NotificationBell />}
          <button
            onClick={openDrawer}
            className="relative px-4 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 inline-block mr-1 -mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            Cart
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Mobile: bell + cart + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {loggedIn && <NotificationBell />}
          <button
            onClick={openDrawer}
            className="relative px-3 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition"
            aria-label="Open cart"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-neutral-300 hover:text-white transition"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer — accordion of mega-menus */}
      {menuOpen && (
        <div className="md:hidden border-t border-neutral-800 bg-neutral-950/95 backdrop-blur max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            {STOREFRONT_PRIMARY_NAV.map((menu) => {
              const isExpanded = expanded === menu.l1;
              return (
                <div key={menu.l1} className="border-b border-neutral-900 last:border-b-0">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : menu.l1)}
                    className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-neutral-200 hover:text-white"
                    aria-expanded={isExpanded}
                  >
                    {menu.l1}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="pb-3 pl-3 space-y-3">
                      {menu.columns.map((col) => (
                        <div key={col.heading}>
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 px-3 mb-1">
                            {col.heading}
                          </h4>
                          <ul className="space-y-0.5">
                            {col.items
                              .filter((item) => !item.authed_only || loggedIn)
                              .map((item) => (
                                <li key={item.href}>
                                  <Link
                                    href={item.href}
                                    className="block px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-md transition"
                                  >
                                    {item.label}
                                  </Link>
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                      {menu.footer && (
                        <div className="px-3 pt-2 border-t border-neutral-900">
                          <Link
                            href={menu.footer.href}
                            className="text-xs text-emerald-400 hover:text-emerald-300"
                          >
                            {menu.footer.label}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <Link
              href={loggedIn ? "/account" : "/login"}
              className="block px-3 py-3 text-sm font-medium text-neutral-200 hover:text-white border-t border-neutral-900 mt-1"
            >
              {loggedIn ? "My Account" : "Sign In"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
