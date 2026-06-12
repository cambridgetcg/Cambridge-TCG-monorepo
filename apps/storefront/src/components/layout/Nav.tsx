"use client";

/**
 * Nav — storefront primary navigation (kingdom-092).
 *
 * V2: replaces the previous 7-flat-link nav with 7 mega-menus driven
 * by the typed config at `@/lib/nav/menu-config.ts`. Desktop renders
 * <MegaMenu> dropdowns; mobile renders an accordion drawer.
 *
 * Preserves the v0 notification-bell and auth-aware Sign-in/Account
 * behavior. URL space unchanged — only nav surface. The retail cart
 * affordance was removed with the regulator pivot (kingdom-101).
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { MegaMenu } from "./MegaMenu";
import { STOREFRONT_PRIMARY_NAV } from "@/lib/nav/menu-config";

export default function Nav() {
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
          {/* Search affordance — /find is the one-box card lookup */}
          <Link
            href="/find"
            aria-label="Find a card"
            className="text-neutral-300 hover:text-white transition py-2"
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
                d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
              />
            </svg>
          </Link>
          <Link
            href={loggedIn ? "/account" : "/login"}
            className="text-sm text-neutral-300 hover:text-white transition py-2"
          >
            {loggedIn ? "Account" : "Sign In"}
          </Link>
          {loggedIn && <NotificationBell />}
        </div>

        {/* Mobile: bell + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {loggedIn && <NotificationBell />}
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
            {/* Search affordance — mirrors the desktop magnifier */}
            <Link
              href="/find"
              className="block px-3 py-3 text-sm font-medium text-neutral-200 hover:text-white border-b border-neutral-900"
            >
              Find a card
            </Link>
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
