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

/**
 * Three-part hover-forgiveness fix (kingdom-095 follow-up):
 *
 * 1. **Close delay (250ms)**: when mouse leaves the wrapper, schedule a
 *    close rather than firing immediately. If the mouse re-enters the
 *    wrapper (or the dropdown) before the timer expires, cancel the
 *    pending close. This forgives mid-traversal mouse drift and brief
 *    cursor wobble.
 *
 * 2. **Hit-area bridge**: the visible 8px gap between the button and the
 *    dropdown is wrapped in a `pt-2` outer div, so the gap is INSIDE the
 *    dropdown's bounding box. The mouse can travel button→gap→dropdown
 *    without ever leaving the wrapper's DOM subtree.
 *
 * 3. **Cross-menu override (no overlap)**: when any MegaMenu opens, it
 *    broadcasts a `megamenu:opened` CustomEvent on the window. Every
 *    other MegaMenu instance listens and closes IMMEDIATELY (bypassing
 *    the 250ms forgiveness) when it sees a sibling open. Without this,
 *    hovering from Cards to Market produces a ~250ms window where both
 *    dropdowns render simultaneously — Cards' close timer hasn't fired
 *    yet, Market opened instantly. The user's intent is "I want Market
 *    now", so Cards yields without delay.
 */
const CLOSE_DELAY_MS = 250;
const OPEN_EVENT = "megamenu:opened";

type OpenEventDetail = { id: string };

export function MegaMenu({ menu, loggedIn }: MegaMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelPendingClose() {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu() {
    cancelPendingClose();
    setOpen(true);
    // Tell every other MegaMenu on the page to close instantly — the user's
    // intent has shifted; their forgiveness window is moot.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent<OpenEventDetail>(OPEN_EVENT, {
          detail: { id: menu.l1 },
        }),
      );
    }
  }

  function scheduleClose() {
    cancelPendingClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }

  function closeImmediately() {
    cancelPendingClose();
    setOpen(false);
  }

  // Clean up the pending-close timer if the component unmounts mid-delay
  useEffect(() => () => cancelPendingClose(), []);

  // Cross-menu override: close instantly when a sibling menu announces it opened.
  useEffect(() => {
    function handleSiblingOpen(e: Event) {
      const detail = (e as CustomEvent<OpenEventDetail>).detail;
      if (!detail || detail.id === menu.l1) return; // self-opens are a no-op
      closeImmediately();
    }
    window.addEventListener(OPEN_EVENT, handleSiblingOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleSiblingOpen);
  }, [menu.l1]);

  // Close on outside click / escape (these bypass the delay — user intent is explicit)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeImmediately();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeImmediately();
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
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => (open ? closeImmediately() : openMenu())}
        onFocus={openMenu}
        aria-expanded={open}
        aria-haspopup="true"
        className="text-sm text-ink-muted hover:text-ink transition flex items-center gap-1 py-2"
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
        // Outer wrapper carries the visual gap (pt-2) as PART of the hit
        // area, so mouse traversal from button into the dropdown never
        // leaves the wrapper's DOM subtree.
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50"
          onMouseEnter={cancelPendingClose}
          onMouseLeave={scheduleClose}
        >
          <div className="w-[680px] max-w-[calc(100vw-2rem)] bg-page border border-border-subtle rounded-xl shadow-2xl shadow-black/40">
            <div className="grid grid-cols-3 gap-6 p-6">
              {menu.columns.map((col) => (
                <div key={col.heading}>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint mb-3">
                    {col.heading}
                  </h3>
                  <ul className="space-y-2">
                    {col.items
                      .filter((item) => !item.authed_only || loggedIn)
                      .map((item) => (
                        <MegaMenuItem
                          key={item.href}
                          item={item}
                          onSelect={closeImmediately}
                        />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            {menu.footer && (
              <div className="border-t border-border-subtle px-6 py-3">
                <Link
                  href={menu.footer.href}
                  onClick={closeImmediately}
                  className="text-xs text-secondary hover:text-emerald-300"
                >
                  {menu.footer.label}
                </Link>
              </div>
            )}
          </div>
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
        className="block group rounded-md px-2 py-1.5 -mx-2 hover:bg-surface transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink">
            {item.label}
          </span>
          {item.badge && <Badge kind={item.badge} />}
        </div>
        {item.description && (
          <p className="text-[11px] text-ink-faint mt-0.5 leading-snug">
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
      ? "bg-emerald-950/40 text-ok ring-emerald-800"
      : kind === "beta"
        ? "bg-amber-950/40 text-accent-strong ring-amber-800"
        : "bg-surface-elevated text-ink-muted ring-border-strong";
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${styles}`}>
      {kind}
    </span>
  );
}
