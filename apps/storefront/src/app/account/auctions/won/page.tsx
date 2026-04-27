"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

// Aggregate view of everything the user has won. Bidders used to have
// no landing page for their wins — they'd find out they won via email
// and then had to navigate back to the specific auction URL. This page
// pools them all in one list with enough detail to pay, track, and
// confirm without deep-linking.

interface WonAuction {
  id: string;
  title: string;
  auction_type: string;
  status: string;
  escrow_status: string | null;
  current_price: string;
  paid_at: string | null;
  payment_expires_at: string | null;
  is_consignment: boolean;
  seller_shipped_at: string | null;
  received_by_ctcg_at: string | null;
  shipped_to_buyer_at: string | null;
  buyer_received_at: string | null;
  tracking_to_buyer: string | null;
  carrier_to_buyer: string | null;
  actual_end_at: string | null;
  image_url: string | null;
}

// Stage label — what the winner should think about doing next.
function stageLabel(a: WonAuction): { label: string; tone: "amber" | "emerald" | "blue" | "neutral" } {
  if (a.status === "ended") return { label: "Pay now", tone: "amber" };
  if (a.escrow_status === "completed" || a.buyer_received_at) return { label: "Delivered", tone: "emerald" };
  if (a.escrow_status === "shipped_to_buyer") return { label: "Confirm receipt", tone: "amber" };
  if (a.escrow_status === "received_by_ctcg") return { label: "CTCG inspecting", tone: "blue" };
  if (a.escrow_status === "awaiting_shipment") return { label: "Awaiting seller", tone: "blue" };
  return { label: "In progress", tone: "neutral" };
}

const TONE_CLASS: Record<string, string> = {
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  neutral: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
};

export default function WonAuctionsPage() {
  const router = useRouter();
  const [auctions, setAuctions] = useState<WonAuction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) { router.push("/login"); return; }
        return fetch("/api/auctions/my/won").then((r) => r.json());
      })
      .then((data) => {
        if (data?.auctions) setAuctions(data.auctions);
        setLoading(false);
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Auctions You Won</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Pay, track, and confirm delivery across every auction you&apos;ve won.
          </p>
        </div>
        <Link
          href="/account/auctions"
          className="text-sm text-neutral-400 hover:text-white transition"
        >
          Your listings →
        </Link>
      </div>

      {auctions.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-500 mb-3">You haven&apos;t won any auctions yet.</p>
          <Link
            href="/auctions"
            className="inline-block px-5 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Browse live auctions
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {auctions.map((a) => {
            const stage = stageLabel(a);
            const trackUrl = buildTrackingUrl(a.carrier_to_buyer, a.tracking_to_buyer);
            return (
              <Link
                key={a.id}
                href={`/auctions/${a.id}`}
                className="block bg-neutral-900 hover:bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700 rounded-xl p-4 transition"
              >
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  {a.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-neutral-800 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-bold text-white truncate">{a.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${TONE_CLASS[stage.tone]}`}>
                        {stage.label}
                      </span>
                      {a.is_consignment && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 uppercase tracking-wide">
                          CTCG escrow
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-500 flex-wrap">
                      <span className="text-white font-mono">{formatPrice(parseFloat(a.current_price))}</span>
                      {a.actual_end_at && (
                        <span>Won {new Date(a.actual_end_at).toLocaleDateString("en-GB")}</span>
                      )}
                      {a.tracking_to_buyer && (
                        <span className="text-amber-400">✈ {a.tracking_to_buyer}</span>
                      )}
                    </div>
                  </div>

                  <span className="text-neutral-600 text-sm">→</span>
                </div>

                {/* Quick action row — inline on urgent states */}
                {a.status === "ended" && (
                  <p className="mt-3 text-xs text-amber-400">
                    Payment due{a.payment_expires_at
                      ? ` by ${new Date(a.payment_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                      : ""}. Click through to pay.
                  </p>
                )}
                {a.escrow_status === "shipped_to_buyer" && trackUrl && (
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 inline-block text-xs text-amber-400 hover:text-amber-300 font-mono"
                  >
                    Track with {a.carrier_to_buyer} ↗
                  </a>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
