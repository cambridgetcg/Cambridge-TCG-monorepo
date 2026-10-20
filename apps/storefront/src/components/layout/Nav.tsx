"use client";

import Link from "next/link";
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
import { Icon } from "@/lib/ui/Icon";
import {
  isNavItemActive,
  MORE_NAV_FOOTER,
  MORE_NAV_GROUPS,
  NAV_SIGN_IN_REQUIRED,
  navGroupHeading,
  navItemAriaCurrent,
  navLabel,
  PRIMARY_NAV_ITEMS,
  SITE_MAP_NAV_ITEM,
  type NavItem,
} from "@/lib/nav/menu-config";
import type { UiLang } from "@/lib/lang-mode";
import { tx } from "@/lib/i18n";
import type { ThemeChoice } from "@/lib/wardrobe/themes";
import { applyLightsFlip } from "@/lib/wardrobe/flip";

/** Chrome labels in both prose languages (the-japanese-voice.md). */
const CHROME = {
  primary: { en: "Primary navigation", ja: "メインナビゲーション", es: "Navegación principal", "zh-Hans": "主导航", "zh-Hant": "主導覽" },
  home: { en: "Cambridge TCG home", ja: "Cambridge TCGのホーム", es: "Inicio de Cambridge TCG", "zh-Hans": "Cambridge TCG首页", "zh-Hant": "Cambridge TCG首頁" },
  search: { en: "Search cards", ja: "カードをさがす", "zh-Hant": "搜尋卡片", "zh-Hans": "搜索卡牌", es: "Buscar cartas" },
  find: { en: "Find a card", ja: "カードをさがす", "zh-Hant": "找卡", "zh-Hans": "找卡", es: "Buscar una carta" },
  account: { en: "Account", ja: "アカウント", es: "Cuenta", "zh-Hans": "账户", "zh-Hant": "帳戶" },
  signIn: { en: "Sign in", ja: "ログイン", es: "Iniciar sesión", "zh-Hans": "登录", "zh-Hant": "登入" },
  signInRequired: NAV_SIGN_IN_REQUIRED,
  menu: { en: "Menu", ja: "メニュー", es: "Menú", "zh-Hans": "菜单", "zh-Hant": "選單" },
  appearance: { en: "Appearance", ja: "表示設定", es: "Apariencia", "zh-Hans": "外观", "zh-Hant": "外觀" },
  highContrast: { en: "High contrast", ja: "ハイコントラスト", es: "Alto contraste", "zh-Hans": "高对比度", "zh-Hant": "高對比度" },
  menuOpen: { en: "Open menu", ja: "メニューを開く", es: "Abrir el menú", "zh-Hans": "打开菜单", "zh-Hant": "打開選單" },
  menuClose: { en: "Close menu", ja: "メニューを閉じる", es: "Cerrar el menú", "zh-Hans": "关闭菜单", "zh-Hant": "關閉選單" },
  lightsOn: { en: "Use light theme", ja: "ライトテーマにする", es: "Usar tema claro", "zh-Hans": "使用浅色主题", "zh-Hant": "使用淺色主題" },
  lightsOff: { en: "Use dark theme", ja: "ダークテーマにする", es: "Usar tema oscuro", "zh-Hans": "使用深色主题", "zh-Hant": "使用深色主題" },
  messages: { en: "Messages", ja: "メッセージ", es: "Mensajes", "zh-Hans": "消息", "zh-Hant": "訊息" },
} as const;

function MessagesIndicator({ uiLang = "en" }: { uiLang?: UiLang }) {
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
      prefetch={false}
      aria-label={uiLang === "ja" ? `メッセージ${count > 0 ? `（未読${count}件）` : ""}` : `${tx(CHROME.messages, uiLang)}${count > 0 ? ` (${count})` : ""}`}
      className="relative rounded-md p-2.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

function themeToggle(theme: ThemeChoice, effectiveDark: boolean, pathname: string, uiLang: UiLang) {
  if (theme === "high-contrast") {
    return { hidden: true as const, target: "", label: "", href: "", isDark: false };
  }
  const target = effectiveDark ? "gallery" : "midnight";
  return {
    hidden: false as const,
    target,
    label: effectiveDark
      ? (tx(CHROME.lightsOn, uiLang))
      : (tx(CHROME.lightsOff, uiLang)),
    href: `/api/appearance?theme=${target}&back=${encodeURIComponent(pathname || "/")}`,
    isDark: effectiveDark,
  };
}

function ThemeGlyph({ isDark, className }: { isDark: boolean; className: string }) {
  return <Icon name={isDark ? "sun" : "moon"} size={20} className={className} />;
}

function activeLinkClass(active: boolean): string {
  return `inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? "bg-accent-wash text-accent-strong"
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
  uiLang = "en",
}: {
  theme: ThemeChoice;
  initialLoggedIn?: boolean;
  uiLang?: UiLang;
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
  const toggle = themeToggle(wearing, effectiveDark, pathname, uiLang);

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
    const desktopQuery = window.matchMedia("(min-width: 1280px)");
    // CSS can hide the focused control before the media-change event fires.
    // Keep its last focus location until another focus or pointer target wins.
    let focusWasInside = false;
    const rememberFocus = (event: FocusEvent | PointerEvent) => {
      focusWasInside = !!menuButtonRef.current?.contains(event.target as Node) ||
        !!mobileDrawerRef.current?.contains(event.target as Node);
    };
    const closeOnBreakpointChange = (event: MediaQueryListEvent) => {
      setMenuState({ pathname, open: false });
      if (event.matches && focusWasInside) {
        window.requestAnimationFrame(() => {
          document.getElementById("desktop-more-navigation-trigger")?.focus();
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
      aria-label={tx(CHROME.primary, uiLang)}
      className="sticky top-0 z-[60] border-b border-border-strong bg-page"
    >
      <noscript>
        <style>{"#mobile-navigation-trigger, #desktop-more-navigation-trigger { display: none; }"}</style>
      </noscript>
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href="/"
          prefetch={false}
          onClick={() => setMenuState({ pathname, open: false })}
          aria-label={tx(CHROME.home, uiLang)}
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <svg
            viewBox="0 0 32 36"
            aria-hidden="true"
            focusable="false"
            className="hidden h-8 w-7 shrink-0 text-accent sm:block"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 4h15a2 2 0 0 1 2 2v22" opacity="0.55" />
            <rect x="4" y="9" width="18" height="23" rx="2.5" />
            <path d="m13 16 3.5 4.5-3.5 4.5-3.5-4.5Z" fill="currentColor" stroke="none" />
          </svg>
          <span className="whitespace-nowrap font-display text-lg font-semibold tracking-[-0.04em] text-ink sm:text-xl">
            Cambridge TCG
          </span>
        </Link>

        <div className="hidden min-w-0 items-center xl:flex">
          <div className="flex items-center gap-0.5">
            {PRIMARY_NAV_ITEMS.map((item: NavItem) => {
              const active = isNavItemActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  aria-current={navItemAriaCurrent(item, pathname)}
                  aria-describedby={item.requiresSignIn && !loggedIn ? "nav-sign-in-required" : undefined}
                  title={item.requiresSignIn && !loggedIn ? tx(CHROME.signInRequired, uiLang) : undefined}
                  className={activeLinkClass(active)}
                >
                  {navLabel(item, uiLang)}
                </Link>
              );
            })}
            <MoreMenu key={pathname} uiLang={uiLang} loggedIn={loggedIn} />
          </div>

          <div className="ml-3 flex items-center gap-1 border-l border-border-subtle pl-3">
            {!toggle.hidden && (
              <a
                href={toggle.href}
                rel="nofollow"
                onClick={flipLights}
                aria-label={toggle.label}
                title={toggle.label}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2.5 text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <ThemeGlyph isDark={toggle.isDark} className="h-5 w-5" />
              </a>
            )}
            <Link
              href={loggedIn ? "/account" : "/login"}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {tx(loggedIn ? CHROME.account : CHROME.signIn, uiLang)}
            </Link>
            {loggedIn && <MessagesIndicator uiLang={uiLang} />}
            {loggedIn && <NotificationBell />}
            <Link
              href="/prices/search"
              prefetch={false}
              aria-label={tx(CHROME.find, uiLang)}
              aria-current={pathname === "/prices/search" ? "page" : undefined}
              className="ml-1 inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-page transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {tx(CHROME.find, uiLang)}
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-1 xl:hidden">
          <noscript>
            <a href={SITE_MAP_NAV_ITEM.href} className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-3 py-2 text-sm font-medium text-ink">
              {navLabel(SITE_MAP_NAV_ITEM, uiLang)}
            </a>
          </noscript>
          <button
            id="mobile-navigation-trigger"
            ref={menuButtonRef}
            type="button"
            onClick={toggleMobileMenu}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-3 py-2 text-sm font-medium text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={menuOpen ? (tx(CHROME.menuClose, uiLang)) : (tx(CHROME.menuOpen, uiLang))}
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
          >
            <span>{tx(CHROME.menu, uiLang)}</span>
            {menuOpen ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
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
                className="h-5 w-5"
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
      <span id="nav-sign-in-required" className="sr-only">{tx(CHROME.signInRequired, uiLang)}</span>

      {menuOpen && (
        <div
          ref={mobileDrawerRef}
          id="mobile-navigation"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border-subtle bg-surface xl:hidden"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
            <Link
              href="/prices/search"
              prefetch={false}
              aria-current={pathname === "/prices/search" ? "page" : undefined}
              onClick={() => setMenuState({ pathname, open: false })}
              className="flex min-h-11 items-center gap-2 rounded-full border border-border-strong bg-page px-4 py-2 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="flex items-center gap-2.5">
                <Icon name="search" size={19} className="text-accent" />
                {tx(CHROME.search, uiLang)}
              </span>
            </Link>

            {/* If the item count is odd, the last link spans the row. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PRIMARY_NAV_ITEMS.map((item: NavItem, i) => {
                const active = isNavItemActive(item, pathname);
                const spansRow =
                  i === PRIMARY_NAV_ITEMS.length - 1 && PRIMARY_NAV_ITEMS.length % 2 === 1;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMenuState({ pathname, open: false })}
                    aria-current={navItemAriaCurrent(item, pathname)}
                    className={`flex min-h-11 flex-col items-start justify-center rounded-xl border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${spansRow ? "col-span-2 " : ""}${
                      active
                        ? "border-ink bg-ink text-page"
                        : "border-border-subtle bg-page text-ink hover:bg-surface-subtle"
                    }`}
                  >
                    {navLabel(item, uiLang)}
                    {item.requiresSignIn && !loggedIn && <span className="mt-1 text-xs font-normal">{tx(CHROME.signInRequired, uiLang)}</span>}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-5 border-t border-border-subtle pt-4">
              {MORE_NAV_GROUPS.map((group) => (
                <section key={navGroupHeading(group, uiLang)}>
                  <h2 className="mb-1 px-2 text-sm font-semibold text-ink">
                    {navGroupHeading(group, uiLang)}
                  </h2>
                  <ul className="space-y-0.5">
                    {group.items.map((item: NavItem) => {
                      const active = isNavItemActive(item, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            prefetch={false}
                            onClick={() => setMenuState({ pathname, open: false })}
                            aria-current={navItemAriaCurrent(item, pathname)}
                            className={`flex min-h-11 flex-col items-start justify-center rounded-md px-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                              active
                                ? "bg-surface-subtle font-semibold text-ink"
                                : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
                            }`}
                          >
                            {navLabel(item, uiLang)}
                            {item.requiresSignIn && !loggedIn && <span className="mt-1 text-xs font-normal">{tx(CHROME.signInRequired, uiLang)}</span>}
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
                  prefetch={false}
                  aria-current={navItemAriaCurrent(item, pathname)}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {navLabel(item, uiLang)} {item.href === "/map" ? "→" : ""}
                </Link>
              ))}
            </div>

            <div className="border-t border-border-subtle pt-2">
              <div className="flex min-h-12 items-center justify-between">
                <Link
                  href={loggedIn ? "/account" : "/login"}
                  prefetch={false}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {tx(loggedIn ? CHROME.account : CHROME.signIn, uiLang)}
                </Link>
                {loggedIn && (
                  <div className="flex items-center">
                    <MessagesIndicator uiLang={uiLang} />
                    <NotificationBell />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-border-subtle">
                {!toggle.hidden ? (
                  <a
                    href={toggle.href}
                    rel="nofollow"
                    onClick={flipLights}
                    className="flex items-center gap-2 rounded-md px-2 py-3 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <ThemeGlyph isDark={toggle.isDark} className="h-5 w-5" />
                    {toggle.label}
                  </a>
                ) : (
                  <span className="px-2 py-3 text-sm text-ink-muted">{tx(CHROME.highContrast, uiLang)}</span>
                )}
                <Link
                  href="/appearance"
                  prefetch={false}
                  aria-current={pathname === "/appearance" ? "page" : undefined}
                  onClick={() => setMenuState({ pathname, open: false })}
                  className="rounded-md px-2 py-3 text-xs font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {tx(CHROME.appearance, uiLang)}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
