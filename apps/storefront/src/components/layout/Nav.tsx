"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";
import { MoreMenu } from "./MoreMenu";
import { Icon } from "@/lib/ui";
import {
  isNavItemActive,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  navItemAriaCurrent,
  PRIMARY_NAV_ITEMS,
} from "@/lib/nav/menu-config";
import type { ThemeChoice } from "@/lib/wardrobe/themes";
import { applyLightsFlip } from "@/lib/wardrobe/flip";

function MessagesIndicator() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/messages/unread-count");
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setCount(data.count ?? 0);
        }
      } catch {
        // Nav polling should not surface transient errors.
      }
    };
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/account/messages"
      aria-label={`Messages${count > 0 ? ` (${count} unread conversation${count === 1 ? "" : "s"})` : ""}`}
      className="relative rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon name="message" size={21} />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-page">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function themeToggle(theme: ThemeChoice, effectiveDark: boolean, pathname: string) {
  if (theme === "high-contrast") {
    return { hidden: true as const, target: "", label: "", href: "", isDark: false };
  }
  const target = effectiveDark ? "gallery" : "midnight";
  return {
    hidden: false as const,
    target,
    label: effectiveDark ? "Lights on" : "Lights off",
    href: `/api/appearance?theme=${target}&back=${encodeURIComponent(pathname || "/")}`,
    isDark: effectiveDark,
  };
}

function ThemeGlyph({ isDark, className }: { isDark: boolean; className: string }) {
  return <Icon name={isDark ? "sun" : "moon"} size={20} className={className} />;
}

function activeLinkClass(active: boolean): string {
  return `rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? "bg-surface-subtle text-ink"
      : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
  }`;
}

function subscribeToSystemDark(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function readSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function Nav({
  theme,
  initialLoggedIn = false,
}: {
  theme: ThemeChoice;
  initialLoggedIn?: boolean;
}) {
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [wearing, setWearing] = useState<ThemeChoice>(theme);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [menuState, setMenuState] = useState({ pathname, open: false });
  const menuOpen = menuState.pathname === pathname && menuState.open;
  if (menuState.pathname !== pathname) {
    setMenuState({ pathname, open: false });
  }
  const systemDark = useSyncExternalStore(
    subscribeToSystemDark,
    readSystemDark,
    () => false,
  );
  const effectiveDark =
    wearing === "system" ? systemDark : wearing === "midnight" || wearing === "terminal";
  const toggle = themeToggle(wearing, effectiveDark, pathname);

  const toggleMobileMenu = () => {
    setMenuState({ pathname, open: !menuOpen });
  };

  const flipLights = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    applyLightsFlip(toggle);
    setWearing(toggle.target as ThemeChoice);
  };

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuState({ pathname, open: false });
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen, pathname]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const closeOnBreakpointChange = (event: MediaQueryListEvent) => {
      const activeElement = document.activeElement;
      const focusWasInside =
        activeElement === menuButtonRef.current ||
        mobileDrawerRef.current?.contains(activeElement);
      setMenuState({ pathname, open: false });
      if (event.matches && focusWasInside) {
        window.requestAnimationFrame(() => {
          document.getElementById("desktop-more-navigation-trigger")?.focus();
        });
      }
    };
    desktopQuery.addEventListener("change", closeOnBreakpointChange);
    return () => desktopQuery.removeEventListener("change", closeOnBreakpointChange);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen || !mobileDrawerRef.current) return;
    const drawer = mobileDrawerRef.current;
    const fitToViewport = () => {
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const available = Math.max(0, viewportBottom - drawer.getBoundingClientRect().top);
      const nextHeight = `${available}px`;
      if (drawer.style.maxHeight !== nextHeight) drawer.style.maxHeight = nextHeight;
    };

    fitToViewport();
    const animationFrame = window.requestAnimationFrame(fitToViewport);
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) fitToViewport();
    });
    window.addEventListener("resize", fitToViewport);
    window.addEventListener("scroll", fitToViewport, { passive: true });
    window.visualViewport?.addEventListener("resize", fitToViewport);
    window.visualViewport?.addEventListener("scroll", fitToViewport);
    const resizeObserver = new ResizeObserver(fitToViewport);
    resizeObserver.observe(document.body);
    const intersectionObserver = new IntersectionObserver(fitToViewport, {
      threshold: [0, 1],
    });
    intersectionObserver.observe(drawer);
    const nav = drawer.closest("nav");
    if (nav?.previousElementSibling instanceof HTMLElement) {
      resizeObserver.observe(nav.previousElementSibling);
    }
    return () => {
      active = false;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", fitToViewport);
      window.removeEventListener("scroll", fitToViewport);
      window.visualViewport?.removeEventListener("resize", fitToViewport);
      window.visualViewport?.removeEventListener("scroll", fitToViewport);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [menuOpen]);

  return (
    <nav
      aria-label="Primary navigation"
      className="sticky top-0 z-[60] border-b border-border-subtle bg-page/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          onClick={() => setMenuState({ pathname, open: false })}
          aria-label="Cambridge TCG home"
          className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Image
            src="/images/icon.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span className="hidden text-xl font-display font-semibold text-ink sm:inline lg:hidden xl:inline">
            Cambridge TCG
          </span>
        </Link>

        <div className="hidden min-w-0 items-center lg:flex">
          <div className="flex items-center gap-0.5">
            {PRIMARY_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={navItemAriaCurrent(item, pathname)}
                  className={activeLinkClass(active)}
                >
                  {item.label}
                </Link>
              );
            })}
            <MoreMenu key={pathname} />
          </div>

          <div className="ml-2 flex items-center gap-0.5 border-l border-border-subtle pl-2">
            <Link
              href="/find"
              aria-label="Search cards"
              aria-current={pathname === "/find" ? "page" : undefined}
              className={`rounded-full p-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                pathname === "/find"
                  ? "bg-surface-subtle text-ink"
                  : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
              }`}
            >
              <Icon name="search" size={20} />
            </Link>
            {!toggle.hidden && (
              <a
                href={toggle.href}
                onClick={flipLights}
                aria-label={toggle.label}
                title={`${toggle.label} — all themes at /appearance`}
                className="rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ThemeGlyph isDark={toggle.isDark} className="h-5 w-5" />
              </a>
            )}
            <Link
              href={loggedIn ? "/account" : "/login"}
              className="rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {loggedIn ? "Account" : "Sign in"}
            </Link>
            {loggedIn && <MessagesIndicator />}
            {loggedIn && <NotificationBell />}
            <Link
              href="/market/list"
              aria-label="List a card"
              aria-current={pathname === "/market/list" ? "page" : undefined}
              className="ml-1 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              List card
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <Link
            href="/market/list"
            onClick={() => setMenuState({ pathname, open: false })}
            aria-label="List a card"
            aria-current={pathname === "/market/list" ? "page" : undefined}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            List card
          </Link>
          <button
            id="mobile-navigation-trigger"
            ref={menuButtonRef}
            type="button"
            onClick={toggleMobileMenu}
            className="rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          ref={mobileDrawerRef}
          id="mobile-navigation"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border-subtle bg-page lg:hidden"
        >
          <div className="mx-auto max-w-7xl px-4 py-4">
            <Link
              href="/find"
              aria-current={pathname === "/find" ? "page" : undefined}
              onClick={() => setMenuState({ pathname, open: false })}
              className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm font-medium text-ink shadow-mat focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex items-center gap-2.5">
                <Icon name="search" size={19} className="text-ink-muted" />
                Search cards
              </span>
              <span aria-hidden className="text-ink-faint">→</span>
            </Link>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuState({ pathname, open: false })}
                    aria-current={navItemAriaCurrent(item, pathname)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      active
                        ? "bg-ink text-page"
                        : "bg-surface-subtle text-ink hover:bg-surface"
                    }`}
                  >
                    {item.label}
                    <span aria-hidden className={active ? "text-page/60" : "text-ink-faint"}>→</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-5 border-t border-border-subtle pt-4">
              {MORE_NAV_GROUPS.map((group) => (
                <section key={group.heading}>
                  <h2 className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    {group.heading}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = isNavItemActive(item, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMenuState({ pathname, open: false })}
                            aria-current={navItemAriaCurrent(item, pathname)}
                            className={`flex min-h-11 items-center rounded-lg px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                              active
                                ? "bg-surface-subtle font-semibold text-ink"
                                : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                            }`}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-border-subtle py-2">
              {MORE_NAV_FOOTER.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={navItemAriaCurrent(item, pathname)}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {item.label} {item.href === "/map" ? "→" : ""}
                </Link>
              ))}
            </div>

            <div className="border-t border-border-subtle pt-2">
              <div className="flex min-h-12 items-center justify-between">
                <Link
                  href={loggedIn ? "/account" : "/login"}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {loggedIn ? "Account" : "Sign in"}
                </Link>
                {loggedIn && (
                  <div className="flex items-center">
                    <MessagesIndicator />
                    <NotificationBell />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle">
                {!toggle.hidden ? (
                  <a
                    href={toggle.href}
                    onClick={flipLights}
                    className="flex items-center gap-2 rounded-lg px-2 py-3 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ThemeGlyph isDark={toggle.isDark} className="h-5 w-5" />
                    {toggle.label}
                  </a>
                ) : (
                  <span className="px-2 py-3 text-sm text-ink-muted">High contrast</span>
                )}
                <Link
                  href="/appearance"
                  aria-current={pathname === "/appearance" ? "page" : undefined}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="rounded-lg px-2 py-3 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Themes →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
