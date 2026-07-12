"use client";

// Shared frame for every /admin/* page. Uses NextAuth session with role
// check — admins authenticate via the standard magic-link flow and are
// identified by role='admin' on their user record.
//
// The middleware already gates /admin/* paths, so this shell is UX
// convenience (loading state, nav) rather than a security boundary.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavItem {
  href: string;
  label: string;
  group: "ops" | "money" | "content" | "system";
}

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
  { href: "/admin/feedback",              label: "Feedback",     group: "system" },
  { href: "/admin/og",                    label: "OG Cards",     group: "system" },
];

interface AdminShellProps {
  title: string;
  subtitle?: string;
  /** @deprecated No longer used — middleware handles auth. Kept for backward compat. */
  authProbe?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: AdminShellProps) {
  // The middleware redirects non-admins before this component ever mounts.
  // We still do a lightweight session check for the loading state UX.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Probe an admin endpoint to confirm the session is valid.
    // The middleware handles the actual auth — this is just for UX.
    fetch("/api/admin/overview", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          // Middleware should have caught this, but if the session expired
          // between page load and this check, redirect to login.
          window.location.href = "/login";
          return;
        }
        setReady(true);
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-600 text-sm">Loading…</div>
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
