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

const NAV_LINKS = [
  { href: "/play", label: "Lobby", note: "Find rooms" },
  { href: "/play/welcome", label: "Welcome", note: "Pick your path" },
  { href: "/play/casual", label: "Casual", note: "For hobbyists" },
  { href: "/play/compete", label: "Compete", note: "For competitors" },
  { href: "/play/adventure", label: "Adventure", note: "Solo PvE" },
  { href: "/play/deck-check", label: "Deck Check", note: "Validate a deck" },
  { href: "/play/spec", label: "Spec", note: "Module structure" },
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
      className="border-b border-neutral-900 bg-neutral-950/80 sticky top-0 z-40 backdrop-blur-sm"
    >
      <div className="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center gap-1 text-sm">
        <span className="text-[10px] uppercase tracking-widest text-neutral-600 mr-3">
          play module
        </span>
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
                  ? "px-2.5 py-1 rounded text-amber-400 bg-amber-500/10 border border-amber-700/50 font-medium"
                  : "px-2.5 py-1 rounded text-neutral-400 hover:text-amber-400 hover:bg-neutral-900 transition-colors border border-transparent"
              }
            >
              {link.label}
            </Link>
          );
        })}
        <span className="ml-auto text-[10px] text-neutral-600 hidden sm:inline">
          fun-first · play-to-earn is opt-in
        </span>
      </div>
    </nav>
  );
}
