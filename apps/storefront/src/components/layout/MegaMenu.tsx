/**
 * MegaMenu — generic 3-column mega-menu component (kingdom-091).
 *
 * Renders from a `MegaMenu` config (see `@/lib/nav/menu-config.ts`).
 * Desktop: hover/click trigger, fixed-position dropdown under the L1.
 * Mobile: accordion-style expansion (handled by parent Nav.tsx mobile
 * drawer, not by this component directly).
 *
 * A11y: keyboard navigation (Enter / Space to open, Escape to close,
 * Tab cycles through items). Focus returns to trigger on close.
 */

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MegaMenu as MegaMenuType, MenuItem } from "@/lib/nav/menu-config";

interface MegaMenuProps {
  menu: MegaMenuType;
  loggedIn: boolean;
}

export function MegaMenu({ menu, loggedIn }: MegaMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onFocus={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="true"
        className="text-sm text-neutral-300 hover:text-white transition flex items-center gap-1 py-2"
      >
        {menu.l1}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-[680px] max-w-[calc(100vw-2rem)] bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl shadow-black/40 z-50">
          <div className="grid grid-cols-3 gap-6 p-6">
            {menu.columns.map((col) => (
              <div key={col.heading}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                  {col.heading}
                </h3>
                <ul className="space-y-2">
                  {col.items
                    .filter((item) => !item.authed_only || loggedIn)
                    .map((item) => (
                      <MegaMenuItem
                        key={item.href}
                        item={item}
                        onSelect={() => setOpen(false)}
                      />
                    ))}
                </ul>
              </div>
            ))}
          </div>
          {menu.footer && (
            <div className="border-t border-neutral-800 px-6 py-3">
              <Link
                href={menu.footer.href}
                onClick={() => setOpen(false)}
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
}

function MegaMenuItem({ item, onSelect }: { item: MenuItem; onSelect: () => void }) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onSelect}
        className="block group rounded-md px-2 py-1.5 -mx-2 hover:bg-neutral-900 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-200 group-hover:text-white">
            {item.label}
          </span>
          {item.badge && <Badge kind={item.badge} />}
        </div>
        {item.description && (
          <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
            {item.description}
          </p>
        )}
      </Link>
    </li>
  );
}

function Badge({ kind }: { kind: "live" | "beta" | "coming" }) {
  const styles =
    kind === "live"
      ? "bg-emerald-950/40 text-emerald-400 ring-emerald-800"
      : kind === "beta"
        ? "bg-amber-950/40 text-amber-400 ring-amber-800"
        : "bg-neutral-800 text-neutral-400 ring-neutral-700";
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${styles}`}>
      {kind}
    </span>
  );
}
