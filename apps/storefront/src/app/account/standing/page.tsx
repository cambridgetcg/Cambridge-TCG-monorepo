"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WhyLink } from "@/lib/ui";

import { Audience } from "@/lib/ui";
interface Standing {
  trust_score: number;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
}

interface Flag {
  id: string;
  signal_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  auto_action: string;
  created_at: string;
}

interface Response {
  standing: Standing;
  flags: Flag[];
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger/10 text-danger border-danger/30",
  high:     "bg-accent-wash text-accent border-accent/30",
  medium:   "bg-info/10 text-info border-info/30",
  low:      "bg-surface-subtle text-ink-muted border-border-subtle",
};

// Plain-English, supportive guidance per signal_type — what we noticed
// and how support can help. Customers see THIS, not the internal
// detection description. Nothing here is a penalty; these are notes for
// a human, and escrow already protects everyone's money.
const FLAG_GUIDANCE: Record<string, { headline: string; advice: string }> = {
  rapid_listing: {
    headline: "A busy listing spell",
    advice: "We noticed a lot of orders in a short window. Nothing's blocked — this note clears on its own as activity settles, and support is happy to look if you'd like.",
  },
  self_trading: {
    headline: "A shared address with a recent counterparty",
    advice: "A recent counterparty shares a shipping address with you. If that's a household member, just let support know and we'll clear the note.",
  },
  velocity_spike: {
    headline: "A jump in your trading volume",
    advice: "Your volume rose sharply compared to your recent baseline. Nothing's held — the note clears as things level out.",
  },
  new_account_high_value: {
    headline: "A large order on a fresh account",
    advice: "Welcome! A big first order simply gets noticed. Nothing is withheld — your trust score grows with every completed trade.",
  },
  chargeback: {
    headline: "A chargeback came through",
    advice: "A bank chargeback was filed against a paid trade. Reach out to support with any context — we'll help sort it out.",
  },
};

export default function AccountStandingPage() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    setData(null);
    fetch("/api/account/standing")
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((d) => {
        // Guard the shape — a malformed payload must degrade to an error
        // state, never a page that reads `flags.length` on undefined (or
        // spins on "Loading…" forever, as the walkers saw).
        if (!d || !d.standing || !Array.isArray(d.flags)) {
          throw new Error("bad shape");
        }
        setData(d as Response);
      })
      .catch(() => setError("We couldn't load your standing right now."));
  }

  useEffect(() => {
    load();
    // A hard ceiling so the page can never spin silently: if nothing has
    // resolved in 15s, degrade to the retryable error state.
    const timer = setTimeout(() => {
      setData((cur) => {
        if (cur === null) setError("This is taking longer than expected.");
        return cur;
      });
    }, 15_000);
    return () => clearTimeout(timer);
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-ink-muted text-sm mb-3">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 text-xs font-semibold bg-ink text-page rounded-lg hover:opacity-90 transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-ink-faint">Loading…</div>;

  const { standing, flags } = data;
  const goodStanding = !standing.is_suspended && flags.length === 0;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">
        Account Standing
        <WhyLink href="/methodology/fraud-flag" tooltip="How does the platform flag accounts?" />
      </h1>
      <p className="text-sm text-ink-muted mb-6">
        Here&rsquo;s what we&rsquo;ve noticed on your account and how support can help. Escrow
        protects your money on every trade, either way. See your{" "}
        <Link href="/account/trust" className="text-accent underline">trust score</Link>{" "}
        for the full breakdown.
      </p>

      {/* Headline status */}
      <div className={`rounded-lg p-5 mb-6 border ${
        standing.is_suspended ? "border-accent/40 bg-accent-wash"
          : flags.length > 0 ? "border-accent/30 bg-accent-wash"
          : "border-ok/40 bg-ok/5"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`text-3xl ${
            standing.is_suspended || flags.length > 0 ? "text-accent" : "text-ok"
          }`}>
            {standing.is_suspended || flags.length > 0 ? "!" : "✓"}
          </span>
          <div>
            <p className="font-bold">
              {standing.is_suspended
                ? "Your account is on hold"
                : flags.length > 0
                  ? "Here's what we noticed"
                  : "All clear — nothing needs your attention"}
            </p>
            {standing.is_suspended && standing.suspended_reason && (
              <p className="text-xs text-ink-muted mt-0.5">{standing.suspended_reason}</p>
            )}
            {standing.is_suspended && (
              <p className="text-xs text-ink-muted mt-0.5">
                Reach out to{" "}
                <a href="mailto:support@cambridgetcg.com" className="text-accent underline">
                  support
                </a>{" "}
                and we&rsquo;ll help you get trading again.
              </p>
            )}
            {standing.is_suspended && standing.suspended_at && (
              <p className="text-xs text-ink-faint mt-0.5">
                On hold since {new Date(standing.suspended_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Active flags */}
      {flags.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">
            What we noticed
          </h2>
          <div className="space-y-3">
            {flags.map((f) => {
              const guide = FLAG_GUIDANCE[f.signal_type] ?? {
                headline: f.signal_type.replace(/_/g, " "),
                advice: f.description,
              };
              return (
                <div key={f.id} className={`rounded-lg border p-4 ${SEVERITY_TONE[f.severity] ?? "border-border-subtle bg-surface"}`}>
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-base">{guide.headline}</h3>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      {f.severity}
                    </span>
                  </div>
                  <p className="text-sm mt-1 opacity-90">{guide.advice}</p>
                  <p className="text-[11px] opacity-60 mt-2">
                    Noticed {new Date(f.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-surface border border-border-subtle rounded-lg text-sm text-ink-muted">
            <p>
              <strong className="text-ink">Here to help.</strong>{" "}
              These are notes for a person, not locks on your account — most settle on their
              own as your activity carries on. If you&rsquo;d like a hand or want to add context,
              reach out at{" "}
              <a href="mailto:support@cambridgetcg.com" className="text-accent underline">
                support@cambridgetcg.com
              </a>{" "}
              with your account email — we&rsquo;re glad to take a look.
            </p>
          </div>
        </section>
      )}

      {goodStanding && (
        <div className="text-center text-sm text-ink-faint mt-8">
          Your trust score is{" "}
          <Link href="/account/trust" className="text-ok underline">
            {standing.trust_score}
          </Link>
          . Keep trading well — every completed trade and positive review lifts it.
        </div>
      )}
    </div>
  );
}
