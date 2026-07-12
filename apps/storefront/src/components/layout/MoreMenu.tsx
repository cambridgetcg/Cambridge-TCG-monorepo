"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/ui";
import {
  isNavItemActive,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  navItemAriaCurrent,
} from "@/lib/nav/menu-config";
import { trackAnalyticsEvent } from "@/lib/analytics/client";

const PANEL_ID = "more-navigation";

export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = MORE_NAV_GROUPS.some((group) =>
    group.items.some((item) => isNavItemActive(item, pathname)),
  ) || MORE_NAV_FOOTER.some((item) => isNavItemActive(item, pathname));

  const trackNavClick = (linkText: string, linkUrl: string) => {
    trackAnalyticsEvent("nav_click", {
      nav_area: "desktop_more",
      link_text: linkText,
      link_url: linkUrl,
      source_path: pathname || "/",
    });
  };

  const toggleMenu = () => {
    const opening = !open;
    setOpen(opening);
    if (opening) {
      trackAnalyticsEvent("more_open", { source_path: pathname || "/" });
    }
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
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeOnBreakpointChange = (event: MediaQueryListEvent) => {
      const focusWasInside = containerRef.current?.contains(document.activeElement);
      setOpen(false);
      if (!event.matches && focusWasInside) {
        window.requestAnimationFrame(() => {
          document.getElementById("mobile-navigation-trigger")?.focus();
        });
      }
    };
    desktopQuery.addEventListener("change", closeOnBreakpointChange);
    return () => desktopQuery.removeEventListener("change", closeOnBreakpointChange);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        id="desktop-more-navigation-trigger"
        ref={triggerRef}
        type="button"
        aria-controls={PANEL_ID}
        aria-expanded={open}
        onClick={toggleMenu}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          active || open
            ? "bg-surface-subtle text-ink"
            : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
        }`}
      >
        More
        {active && <span className="sr-only"> — contains current location</span>}
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
            className="w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-mat"
          >
            <div className="grid grid-cols-2 gap-3 p-3">
              {MORE_NAV_GROUPS.map((group) => (
                <section key={group.heading} aria-labelledby={`more-${group.heading.replaceAll(" ", "-").toLowerCase()}`}>
                  <h2
                    id={`more-${group.heading.replaceAll(" ", "-").toLowerCase()}`}
                    className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted"
                  >
                    {group.heading}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const itemActive = isNavItemActive(item, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={navItemAriaCurrent(item, pathname)}
                            onClick={() => {
                              trackNavClick(item.label, item.href);
                              setOpen(false);
                            }}
                            className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                              itemActive ? "bg-surface-subtle" : "hover:bg-surface-subtle"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-medium text-ink">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-ink-muted">
                                {item.description}
                              </span>
                            </span>
                            <Icon
                              name="arrow-right"
                              size={15}
                              className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                            />
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
                  onClick={() => {
                    trackNavClick(item.label, item.href);
                    setOpen(false);
                  }}
                  className="flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {item.label} {item.href === "/map" ? "→" : ""}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
