"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/context/CartContext";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NotificationBell from "./NotificationBell";

const NAV_LINKS = [
  { href: "/catalog", label: "Shop" },
  { href: "/market", label: "Market" },
  { href: "/trade-in", label: "Sell" },
  { href: "/auctions", label: "Auctions" },
  { href: "/play", label: "Play" },
  { href: "/rewards", label: "Rewards" },
  { href: "/community", label: "Community" },
];

export default function Nav() {
  const { totalItems, openDrawer } = useCart();
  const [loggedIn, setLoggedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => {});
  }, []);

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image src="/images/icon.png" alt="Cambridge TCG" width={32} height={32} className="w-8 h-8" />
          <span className="text-xl font-black text-white hidden sm:inline">Cambridge <span className="text-emerald-400">TCG</span></span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm text-neutral-300 hover:text-white transition">
              {link.label}
            </Link>
          ))}
          <Link
            href={loggedIn ? "/account" : "/login"}
            className="text-sm text-neutral-300 hover:text-white transition"
          >
            {loggedIn ? "Account" : "Sign In"}
          </Link>
          {loggedIn && <NotificationBell />}
          <button
            onClick={openDrawer}
            className="relative px-4 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 inline-block mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            Cart
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
        </div>

        {/* Mobile: bell + cart + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          {loggedIn && <NotificationBell />}
          <button
            onClick={openDrawer}
            className="relative px-3 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-neutral-300 hover:text-white transition"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block px-3 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={loggedIn ? "/account" : "/login"}
              className="block px-3 py-2.5 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800/50 rounded-lg transition"
            >
              {loggedIn ? "My Account" : "Sign In"}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
