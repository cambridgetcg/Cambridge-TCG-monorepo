"use client";

/**
 * Admin sidebar navigation.
 *
 * The NAV structure (7 groups, the IA) lives in ./nav so it is one source of
 * truth shared with src/tests/nav.test.ts. This file is the rendering shell.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

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
                <div key={item.href}>
                  <Link
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
                  {item.subItems && active && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.subItems.map((sub) => {
                        const subActive = pathname === sub.href || pathname.startsWith(sub.href + "/");
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={[
                              "block px-2 py-1 rounded-md text-xs transition-colors",
                              subActive
                                ? "bg-blue-500/10 text-blue-400 font-medium"
                                : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800",
                            ].join(" ")}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
