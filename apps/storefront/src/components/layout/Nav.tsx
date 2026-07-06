"use client";

/**
 * Nav — storefront primary navigation (kingdom-092).
 *
 * V2: replaces the previous 7-flat-link nav with mega-menus driven
 * by the typed config at `@/lib/nav/menu-config.ts`. Desktop renders
 * <MegaMenu> dropdowns; mobile renders an accordion drawer.
 *
 * Collectors first (kingdom-101, 2026-07-06): the Cart is gone — the
 * house sells nothing, so there is nothing to put in a cart. The
 * primary action slot now belongs to "List a card" (the market's
 * front door). Notification-bell and auth-aware Sign-in/Account
 * behavior preserved.
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { MegaMenu } from "./MegaMenu";
import { STOREFRONT_PRIMARY_NAV } from "@/lib/nav/menu-config";
import type { ThemeChoice } from "@/lib/wardrobe/themes";

// Unread-DM badge on an envelope link to /account/messages. Counts
// unread CONVERSATIONS (same source as the /account attention list),
// not messages — ten replies in one thread is one unit of "go look".
// Own 60s interval: the bell's poll lives inside <NotificationBell>
// and counts notifications only; DM notifications dedupe per
// (conversation, day), so same-day follow-ups would otherwise stay
// silent. Skips ticks while the tab is hidden.
function MessagesIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/messages/unread-count");
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setCount(d.count ?? 0);
        }
      } catch {
        // Nav polling shouldn't surface transient errors.
      }
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/account/messages"
      aria-label={`Messages${count > 0 ? ` (${count} unread conversation${count === 1 ? "" : "s"})` : ""}`}
      className="relative p-2 text-ink-muted hover:text-ink transition"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5l9 6 9-6" />
      </svg>
      {count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-page text-[10px] font-semibold rounded-full flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

// The switch on the wall — one quiet glyph that flips the lights.
// Effective-dark themes (midnight, terminal) show the sun and target
// gallery; light themes (gallery, high-contrast) and system-follow show
// the moon and target midnight. A plain <a> to the wardrobe's cookie
// writer (back-redirect idiom), so it works without JS; the full
// wardrobe stays at /appearance.
function themeToggle(theme: ThemeChoice, pathname: string) {
  const isDark = theme === "midnight" || theme === "terminal";
  return {
    target: isDark ? "gallery" : "midnight",
    label: isDark ? "Lights on" : "Lights off",
    href: `/api/appearance?theme=${isDark ? "gallery" : "midnight"}&back=${encodeURIComponent(pathname || "/")}`,
    isDark,
  };
}

function ThemeGlyph({ isDark, className }: { isDark: boolean; className: string }) {
  return isDark ? (
    // Sun — back to the lit gallery
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"
      />
    </svg>
  ) : (
    // Moon — the gallery, lights off
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
      />
    </svg>
  );
}

export default function Nav({ theme }: { theme: ThemeChoice }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const pathname = usePathname();
  const toggle = themeToggle(theme, pathname);

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
    <nav className="sticky top-0 z-40 bg-page/95 backdrop-blur border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/images/icon.png"
            alt="Cambridge TCG"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="text-xl font-display font-semibold text-ink hidden sm:inline">
            Cambridge TCG
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
            className="text-ink-muted hover:text-ink transition py-2"
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
          {/* The lights switch — no JS needed; all themes at /appearance */}
          <a
            href={toggle.href}
            aria-label={toggle.label}
            title={`${toggle.label} — all themes at /appearance`}
            className="text-ink-muted hover:text-ink transition py-2"
          >
            <ThemeGlyph isDark={toggle.isDark} className="w-5 h-5" />
          </a>
          <Link
            href={loggedIn ? "/account" : "/login"}
            className="text-sm text-ink-muted hover:text-ink transition py-2"
          >
            {loggedIn ? "Account" : "Sign In"}
          </Link>
          {loggedIn && <MessagesIndicator />}
          {loggedIn && <NotificationBell />}
          {/* The primary action — listing a card on the collectors' market.
              This slot held the Cart until 2026-07-06; the house sells
              nothing now, so the strongest thing in the chrome belongs to
              the collector's own next move. */}
          <Link
            href="/market/list"
            className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:bg-ink/90 transition"
          >
            List a card
          </Link>
        </div>

        {/* Mobile: messages + bell + list-a-card + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {loggedIn && <MessagesIndicator />}
          {loggedIn && <NotificationBell />}
          <Link
            href="/market/list"
            className="px-3 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:bg-ink/90 transition"
          >
            List a card
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-ink-muted hover:text-ink transition"
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
        <div className="md:hidden border-t border-border-subtle bg-page/95 backdrop-blur max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-3 space-y-1">
            {/* Search affordance — mirrors the desktop magnifier */}
            <Link
              href="/find"
              className="block px-3 py-3 text-sm font-medium text-ink-muted hover:text-ink border-b border-border-subtle"
            >
              Find a card
            </Link>
            {STOREFRONT_PRIMARY_NAV.map((menu) => {
              const isExpanded = expanded === menu.l1;
              return (
                <div key={menu.l1} className="border-b border-border-subtle last:border-b-0">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : menu.l1)}
                    className="w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-ink-muted hover:text-ink"
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
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint px-3 mb-1">
                            {col.heading}
                          </h4>
                          <ul className="space-y-0.5">
                            {col.items
                              .filter((item) => !item.authed_only || loggedIn)
                              .map((item) => (
                                <li key={item.href}>
                                  <Link
                                    href={item.href}
                                    className="block px-3 py-2 text-sm text-ink-muted hover:text-ink hover:bg-surface-subtle rounded-md transition"
                                  >
                                    {item.label}
                                  </Link>
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                      {menu.footer && (
                        <div className="px-3 pt-2 border-t border-border-subtle">
                          <Link
                            href={menu.footer.href}
                            className="text-xs text-accent hover:text-accent-strong"
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
              className="block px-3 py-3 text-sm font-medium text-ink-muted hover:text-ink border-t border-border-subtle mt-1"
            >
              {loggedIn ? "My Account" : "Sign In"}
            </Link>
            {/* The lights switch, labelled for the drawer; the full
                wardrobe one step away. Plain <a> — works without JS. */}
            <div className="flex items-center justify-between border-t border-border-subtle">
              <a
                href={toggle.href}
                className="flex items-center gap-2 px-3 py-3 text-sm font-medium text-ink-muted hover:text-ink"
              >
                <ThemeGlyph isDark={toggle.isDark} className="w-5 h-5" />
                {toggle.label}
              </a>
              <Link
                href="/appearance"
                className="px-3 py-3 text-xs text-accent hover:text-accent-strong"
              >
                All themes →
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
