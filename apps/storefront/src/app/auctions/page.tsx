"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { AuctionSummary } from "@/lib/auction/types";
import AuctionCard from "@/components/auction/AuctionCard";
import { WhyLink, ErrorAlert } from "@/lib/ui";

type Tab = "live" | "scheduled" | "ended";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Upcoming" },
  { key: "ended", label: "Ended" },
];

export default function AuctionsPage() {
  const [tab, setTab] = useState<Tab>("live");
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [serverTime, setServerTime] = useState<string>(new Date().toISOString());

  const fetchAuctions = useCallback(async (status: Tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auctions?status=${status}&limit=40&offset=0`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setAuctions(data.auctions || []);
      setTotal(data.total || 0);
      if (data.server_time) setServerTime(data.server_time);
      setFetchError(false);
    } catch {
      // Outage ≠ empty: clear the list but flag the failure so the UI
      // renders an error state instead of "No auctions".
      setAuctions([]);
      setTotal(0);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuctions(tab);
  }, [tab, fetchAuctions]);

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-semibold text-ink">Auctions</h1>
          <p className="text-ink-muted mt-1">
            Bid on cards, sealed product, and more
          </p>
        </div>

        {/* Sell CTA */}
        <div className="bg-surface border border-border-subtle rounded-lg p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-ink font-bold">Have a card to sell?</h2>
            <p className="text-ink-muted text-sm mt-1">List your cards at auction. We handle verification, escrow, and delivery. 12% commission on sale, capped at £50 per item.<WhyLink href="/methodology/fees" tooltip="Every fee, plain language — and the per-item cap" /></p>
          </div>
          <Link href="/auctions/sell" className="shrink-0 px-5 py-2.5 bg-ink text-page text-sm font-bold rounded-lg hover:opacity-90 transition">
            Sell at Auction
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface border border-border-subtle rounded-lg p-1 w-fit mb-8">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 text-sm font-medium rounded-md transition ${
                tab === t.key
                  ? "bg-ink text-page"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-surface border border-border-subtle rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-surface-subtle" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-surface-subtle rounded w-3/4" />
                  <div className="h-6 bg-surface-subtle rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : fetchError ? (
          /* Error state — distinct from "no auctions right now" */
          <ErrorAlert
            title="Auctions are temporarily unreachable"
            description="Try again in a minute."
          />
        ) : auctions.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-ink-faint mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-ink-muted">No auctions</h2>
            <p className="text-ink-faint text-sm mt-1">
              {tab === "live" && "No live auctions right now. Check back soon!"}
              {tab === "scheduled" && "No upcoming auctions scheduled."}
              {tab === "ended" && "No ended auctions to show."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {auctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} serverTime={serverTime} />
              ))}
            </div>
            {total > auctions.length && (
              <p className="text-center text-ink-faint text-sm mt-6">
                Showing {auctions.length} of {total} auctions
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
