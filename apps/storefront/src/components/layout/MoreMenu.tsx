"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  isNavItemActive,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  NAV_SIGN_IN_REQUIRED,
  navDescription,
  navGroupHeading,
  navItemAriaCurrent,
  navLabel,
  SITE_MAP_NAV_ITEM,
  type NavItem,
} from "@/lib/nav/menu-config";
import type { UiLang } from "@/lib/lang-mode";
import { tx } from "@/lib/i18n";

const PANEL_ID = "more-navigation";

export function MoreMenu({ uiLang = "en", loggedIn = false }: { uiLang?: UiLang; loggedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = MORE_NAV_GROUPS.some((group) =>
    group.items.some((item) => isNavItemActive(item, pathname)),
  ) || MORE_NAV_FOOTER.some((item) => isNavItemActive(item, pathname));

  const toggleMenu = () => {
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    let focusWasInside = false;
    const rememberFocus = (event: FocusEvent | PointerEvent) => {
      focusWasInside = !!containerRef.current?.contains(event.target as Node);
    };
    const closeOnBreakpointChange = (event: MediaQueryListEvent) => {
      setOpen(false);
      if (!event.matches && focusWasInside) {
        window.requestAnimationFrame(() => {
          document.getElementById("mobile-navigation-trigger")?.focus();
        });
      }
    };
    document.addEventListener("focusin", rememberFocus);
    document.addEventListener("pointerdown", rememberFocus);
    desktopQuery.addEventListener("change", closeOnBreakpointChange);
    return () => {
      document.removeEventListener("focusin", rememberFocus);
      document.removeEventListener("pointerdown", rememberFocus);
      desktopQuery.removeEventListener("change", closeOnBreakpointChange);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <noscript>
        <a href={SITE_MAP_NAV_ITEM.href} className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-ink-muted">
          {navLabel(SITE_MAP_NAV_ITEM, uiLang)}
        </a>
      </noscript>
      <button
        id="desktop-more-navigation-trigger"
        ref={triggerRef}
        type="button"
        aria-controls={PANEL_ID}
        aria-expanded={open}
        onClick={toggleMenu}
        className={`inline-flex min-h-11 items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          active || open
            ? "bg-surface-subtle text-ink"
            : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
        }`}
      >
        {tx({ en: "More", ja: "そのほか", es: "Más", "zh-Hans": "还有", "zh-Hant": "更多" }, uiLang)}
        {active && <span className="sr-only">{tx({ en: " — contains current location", ja: " — 現在のページを含む", es: " — contiene la ubicación actual", "zh-Hans": " — 包含当前页面", "zh-Hant": " — 包含目前頁面" }, uiLang)}</span>}
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="m2.5 4.5 3.5 3 3.5-3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 pt-3">
          <div
            id={PANEL_ID}
            className="w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border-strong bg-surface"
          >
            <div className="grid grid-cols-2 gap-3 p-3">
              {MORE_NAV_GROUPS.map((group) => (
                <section key={group.heading} aria-labelledby={`more-${group.heading.replaceAll(" ", "-").toLowerCase()}`}>
                  <h2
                    id={`more-${group.heading.replaceAll(" ", "-").toLowerCase()}`}
                    className="px-3 pb-1 pt-2 text-sm font-semibold text-ink"
                  >
                    {navGroupHeading(group, uiLang)}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((item: NavItem) => {
                      const itemActive = isNavItemActive(item, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            prefetch={item.requiresSignIn ? false : undefined}
                            aria-current={navItemAriaCurrent(item, pathname)}
                            onClick={() => setOpen(false)}
                            className={`block min-h-11 rounded-md px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                              itemActive ? "bg-surface-subtle" : "hover:bg-surface-subtle"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-medium text-ink">
                                {navLabel(item, uiLang)}
                              </span>
                              <span className="mt-0.5 block text-xs text-ink-muted">
                                {navDescription(item, uiLang)}
                              </span>
                              {item.requiresSignIn && !loggedIn && <span className="mt-1 block text-xs text-ink-muted">{tx(NAV_SIGN_IN_REQUIRED, uiLang)}</span>}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle bg-surface-subtle/50 px-3 py-1">
              {MORE_NAV_FOOTER.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={navItemAriaCurrent(item, pathname)}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {navLabel(item, uiLang)} {item.href === "/map" ? "→" : ""}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
