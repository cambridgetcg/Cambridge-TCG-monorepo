"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Active-state-aware nav for the play module.
 *
 * Client subcomponent of /play/layout.tsx (which stays server-rendered).
 * Reads usePathname() to bold the current page's link. Without this, every
 * nav link looked identical regardless of which page you were on.
 *
 * E2E test finding (kingdom-070 follow-through): the original server-only
 * nav had no active-state signal; users had no visual confirmation of where
 * they were within the module.
 */

/** Player path only. Welcome/Casual/Compete/Spec stay reachable by URL and
 *  in-page links — just not in the primary nav. */
const NAV_LINKS = [
  { href: "/play", label: "Play", note: "Browser practice and account play status" },
  { href: "/play/adventure", label: "Practice levels", note: "Choose a browser practice opponent" },
  { href: "/play/starters", label: "Starter decks", note: "Pre-built decks for beginners" },
  { href: "/play/tutorial", label: "Tutorial", note: "Never played? Start here" },
  { href: "/play/deck-check", label: "Check a deck", note: "Validate a deck" },
  { href: "/play/meta", label: "Competitive play", note: "Tiers, tournaments, banlist" },
] as const;

/** Match exactly OR a route's nested child (so /play/casual/foo highlights
 *  Casual; /play/adventure/[levelId] highlights Adventure; the bare /play
 *  matches only the lobby root, not every /play/* page). */
function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/play") return pathname === "/play";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function PlayNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Play module navigation"
      className="border-b border-border-subtle bg-surface"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-1 text-sm">
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              title={link.note}
              className={
                active
                  ? "inline-flex min-h-11 items-center px-3 py-2 rounded-md text-accent bg-accent-wash border border-accent/50 font-medium"
                  : "inline-flex min-h-11 items-center px-3 py-2 rounded-md text-ink-muted hover:text-ink hover:bg-surface-subtle transition-colors border border-transparent"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
