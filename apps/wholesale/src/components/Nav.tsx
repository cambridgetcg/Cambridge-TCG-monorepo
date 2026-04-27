"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useCart } from "@/lib/cart-context";
import { useEffect, useState, useCallback } from "react";

function useIsAdminHost() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(window.location.hostname.startsWith("admin."));
  }, []);
  return isAdmin;
}

export default function Nav() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const { itemCount, total, flushSync } = useCart();
  const isAdminHost = useIsAdminHost();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = useCallback(async () => {
    await flushSync();
    signOut({ callbackUrl: "/login" });
  }, [flushSync]);

  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL ?? "/admin";
  const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "/catalog";

  return (
    <nav className="border-b border-[#1e1e2e] bg-[#12121a] px-6 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Link href={isAdminHost ? "/admin" : "/catalog"} className="text-lg font-bold text-brand-500">
          TCG Wholesale
        </Link>

        {/* Mobile: cart badge + hamburger */}
        <div className="flex items-center gap-3 md:hidden">
          {!isAdminHost && itemCount > 0 && (
            <Link
              href="/orders/new"
              className="flex items-center gap-1.5 rounded bg-brand-600/20 border border-brand-600/30 px-3 py-1 text-brand-400 hover:bg-brand-600/30 transition text-sm"
            >
              <span>Cart ({itemCount})</span>
              <span className="text-green-400 font-medium">
                &pound;{total.toFixed(2)}
              </span>
            </Link>
          )}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex flex-col justify-center gap-1 p-1"
            aria-label="Toggle menu"
          >
            <span className={`block h-0.5 w-5 bg-gray-300 transition-transform ${menuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
            <span className={`block h-0.5 w-5 bg-gray-300 transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-gray-300 transition-transform ${menuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
          </button>
        </div>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          {isAdminHost ? (
            <>
              <Link href="/admin" className="hover:text-brand-500 transition">
                Dashboard
              </Link>
              <a href={storefrontUrl} className="hover:text-brand-500 transition">
                Storefront
              </a>
            </>
          ) : (
            <>
              <Link href="/catalog" className="hover:text-brand-500 transition">
                Catalog
              </Link>
              <Link href="/orders" className="hover:text-brand-500 transition">
                Orders
              </Link>
              <Link href="/fulfillment" className="hover:text-brand-500 transition">
                Fulfillment
              </Link>
              <Link href="/margin" className="hover:text-brand-500 transition">
                Margins
              </Link>
              {isAdmin && (
                <a href={adminUrl} className="hover:text-brand-500 transition">
                  Admin
                </a>
              )}
              {itemCount > 0 && (
                <Link
                  href="/orders/new"
                  className="flex items-center gap-1.5 rounded bg-brand-600/20 border border-brand-600/30 px-3 py-1 text-brand-400 hover:bg-brand-600/30 transition"
                >
                  <span>Cart ({itemCount})</span>
                  <span className="text-green-400 font-medium">
                    &pound;{total.toFixed(2)}
                  </span>
                </Link>
              )}
            </>
          )}
          <span className="text-gray-500">{session?.user?.email}</span>
          <button
            onClick={handleSignOut}
            className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="mt-3 flex flex-col gap-3 border-t border-[#1e1e2e] pt-3 text-sm md:hidden">
          {isAdminHost ? (
            <>
              <Link href="/admin" className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
              <a href={storefrontUrl} className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Storefront
              </a>
            </>
          ) : (
            <>
              <Link href="/catalog" className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Catalog
              </Link>
              <Link href="/orders" className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Orders
              </Link>
              <Link href="/fulfillment" className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Fulfillment
              </Link>
              <Link href="/margin" className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                Margins
              </Link>
              {isAdmin && (
                <a href={adminUrl} className="hover:text-brand-500 transition" onClick={() => setMenuOpen(false)}>
                  Admin
                </a>
              )}
            </>
          )}
          <span className="text-gray-500">{session?.user?.email}</span>
          <button
            onClick={handleSignOut}
            className="rounded bg-gray-800 px-3 py-1 text-xs hover:bg-gray-700 transition w-fit"
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
