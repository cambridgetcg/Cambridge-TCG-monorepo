"use client";

// Shared frame for every /admin/* page. Wraps the existing HMAC-cookie
// auth — no server changes, the shell just owns the login form and the
// nav so individual pages stop reimplementing it. Children render only
// once authed.

import { useEffect, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavItem {
  href: string;
  label: string;
  // Group pills into sections in the nav. "ops" = day-to-day fulfilment,
  // "money" = payouts/disputes/fraud, "content" = catalog/rewards,
  // "system" = meta (emails, verifications, og).
  group: "ops" | "money" | "content" | "system";
}

// Central registry. Update here → reflected in the top nav and admin
// index page. Keep the order stable; it's also the display order on
// /admin. Don't prune without checking the matching /admin/* route.
export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin",                       label: "Overview",     group: "ops" },
  { href: "/admin/trade-ins",             label: "Trade-Ins",    group: "ops" },
  { href: "/admin/quotes",                label: "Quotes",       group: "ops" },
  { href: "/admin/bounty/redemptions",    label: "Redemptions",  group: "ops" },
  { href: "/admin/auctions",              label: "Auctions",     group: "ops" },
  { href: "/admin/verifications",         label: "Verifications", group: "ops" },

  { href: "/admin/payouts",               label: "Payouts",      group: "money" },
  { href: "/admin/disputes",              label: "Disputes",     group: "money" },
  { href: "/admin/fraud",                 label: "Fraud",        group: "money" },

  { href: "/admin/rewards",               label: "Rewards",      group: "content" },
  { href: "/admin/bounty/pull-tiers",     label: "Pull Tiers",   group: "content" },
  { href: "/admin/market",                label: "Market",       group: "content" },
  { href: "/admin/tiers",                 label: "Tiers",        group: "content" },

  { href: "/admin/emails",                label: "Emails",       group: "system" },
  { href: "/admin/og",                    label: "OG Cards",     group: "system" },
];

interface AdminShellProps {
  title: string;
  subtitle?: string;
  // Optional probe endpoint — we fire a HEAD/GET against it to detect
  // whether the admin_token cookie is still valid. Defaults to the
  // cheapest admin-guarded endpoint: /api/admin/overview.
  authProbe?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminShell({
  title,
  subtitle,
  authProbe = "/api/admin/overview",
  actions,
  children,
}: AdminShellProps) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    fetch(authProbe, { cache: "no-store" })
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, [authProbe]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setLoginError("Wrong password.");
        return;
      }
      setAuthed(true);
      setPassword("");
    } catch {
      setLoginError("Network error.");
    }
  }, [password]);

  if (authed === null) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-600 text-sm">Checking…</div>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm px-4">
          <h1 className="text-2xl font-bold text-white text-center mb-8">Admin</h1>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-4"
          />
          {loginError && <p className="text-sm text-red-400 mb-4">{loginError}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Log In
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <AdminTopBar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-neutral-500 mt-1 max-w-xl">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}

function AdminTopBar() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-30 bg-neutral-950/80 backdrop-blur border-b border-neutral-900">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/admin" className="text-sm font-bold text-white hover:text-amber-400 transition whitespace-nowrap">
          <span className="text-amber-400">⚑</span> Admin
        </Link>
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {ADMIN_NAV.filter((i) => i.href !== "/admin").map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 rounded-full transition whitespace-nowrap ${
                  active
                    ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40"
                    : "text-neutral-500 hover:text-white hover:bg-neutral-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto">
          <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400 transition">
            ← Site
          </Link>
        </div>
      </div>
    </nav>
  );
}
