"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface RepEntry {
  id: string;
  platform: string;
  username: string;
  profile_url: string;
  verified: boolean;
  verified_at: string | null;
  verification_code: string | null;
  last_check_at: string | null;
  decay_at: string | null;
  failed_check_count: number;
  rating: string | null;
  total_sales: number | null;
  positive_percent: string | null;
  member_since: string | null;
  created_at: string;
}

interface PlatformInfo {
  key: string;
  label: string;
  hosts: string[];
}

interface Response {
  entries: RepEntry[];
  platforms: PlatformInfo[];
}

export default function AccountExternalRepPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // New-entry form state
  const [platform, setPlatform] = useState("ebay");
  const [profileUrl, setProfileUrl] = useState("");
  const [username, setUsername] = useState("");
  const [issueResult, setIssueResult] = useState<{ code: string; repId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/account/external-rep");
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function issueCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIssuing(true);
    try {
      const r = await fetch("/api/account/external-rep", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "issue", platform, profileUrl, username }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Failed to issue code.");
        return;
      }
      setIssueResult({ code: d.verificationCode, repId: d.repId });
      setProfileUrl(""); setUsername("");
      load();
    } finally {
      setIssuing(false);
    }
  }

  async function verify(repId: string) {
    setVerifying(repId);
    try {
      const r = await fetch("/api/account/external-rep", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", repId }),
      });
      const d = await r.json();
      alert(d.message || (r.ok ? "Verified!" : "Verification failed."));
      load();
    } finally {
      setVerifying(null);
    }
  }

  async function remove(repId: string) {
    if (!confirm("Remove this rep entry? Your trust score will recompute.")) return;
    const r = await fetch("/api/account/external-rep", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repId }),
    });
    if (r.ok) load();
  }

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">External Reputation</h1>
      <p className="text-sm text-ink-muted mb-6">
        Verify your accounts on other marketplaces. Each verified platform
        contributes to your{" "}
        <Link href="/account/trust" className="text-accent-strong underline">trust score</Link>{" "}
        (up to 10 points). Verifications expire after 90 days and re-check automatically.
      </p>

      {/* Connect-platform form */}
      <section className="bg-surface border border-border-subtle rounded-xl p-5 mb-6">
        <h2 className="text-base font-bold mb-3">Connect a platform</h2>
        <form onSubmit={issueCode} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-faint block mb-1">Platform</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {(data?.platforms ?? []).map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-ink-faint block mb-1">Username on that platform</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-handle"
                required
                className="w-full bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-ink-faint block mb-1">Public profile URL</span>
            <input
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.ebay.co.uk/usr/your-handle"
              required
              type="url"
              className="w-full bg-surface-elevated border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </label>
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={issuing}
            className="px-4 py-2 bg-accent hover:bg-accent-strong text-black font-bold rounded-lg text-sm disabled:opacity-50"
          >
            {issuing ? "Issuing…" : "Get verification code"}
          </button>
        </form>

        {issueResult && (
          <div className="mt-4 p-4 bg-emerald-500/5 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-secondary font-bold mb-1">Code issued</p>
            <p className="text-xs text-ink-muted mb-3">
              Add this code anywhere on your public profile (about/me, listing description, etc),
              then click Verify below:
            </p>
            <code className="block font-mono text-lg text-accent-strong bg-page px-4 py-3 rounded mb-3 break-all">
              {issueResult.code}
            </code>
            <button
              onClick={() => verify(issueResult.repId)}
              disabled={verifying === issueResult.repId}
              className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded disabled:opacity-50"
            >
              {verifying === issueResult.repId ? "Verifying…" : "I've added it — verify"}
            </button>
          </div>
        )}
      </section>

      {/* Entries list */}
      <section>
        <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">
          Your platforms
        </h2>
        {loading ? (
          <p className="text-ink-faint">Loading…</p>
        ) : !data || data.entries.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
            No platforms connected yet. Use the form above to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {data.entries.map((e) => {
              const platformLabel = data.platforms.find((p) => p.key === e.platform)?.label ?? e.platform;
              const decayMs = e.decay_at ? new Date(e.decay_at).getTime() - Date.now() : null;
              const decayDays = decayMs != null ? Math.floor(decayMs / 86_400_000) : null;
              const decayWarn = decayDays != null && decayDays < 14;
              return (
                <div key={e.id} className={`bg-surface rounded-xl p-4 border ${
                  e.verified
                    ? (e.failed_check_count > 0 ? "border-accent/40" : "border-emerald-500/30")
                    : "border-border-subtle"
                }`}>
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="font-bold flex items-center gap-2 flex-wrap">
                        <span>{platformLabel}</span>
                        <span className="text-sm text-ink-muted font-mono">@{e.username}</span>
                        {e.verified ? (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-500/10 text-secondary border-emerald-500/30">
                            Verified
                          </span>
                        ) : e.verification_code ? (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-accent/10 text-accent-strong border-accent/30">
                            Awaiting verify
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-surface-elevated text-ink-muted border-border-strong">
                            Unverified
                          </span>
                        )}
                      </p>
                      <a href={e.profile_url} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-ink-faint hover:text-ink-muted underline truncate block">
                        {e.profile_url}
                      </a>
                    </div>
                    <button
                      onClick={() => remove(e.id)}
                      className="text-[11px] text-ink-faint hover:text-red-400 underline"
                    >
                      Remove
                    </button>
                  </div>

                  {e.verified && e.decay_at && (
                    <p className={`text-xs mt-2 ${decayWarn ? "text-accent-strong" : "text-ink-faint"}`}>
                      Re-verifies in {decayDays}d ({new Date(e.decay_at).toLocaleDateString("en-GB")})
                      {e.failed_check_count > 0 && (
                        <span className="ml-2 text-accent-strong">
                          · {e.failed_check_count} failed re-check{e.failed_check_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </p>
                  )}

                  {!e.verified && e.verification_code && (
                    <div className="mt-3 p-3 bg-page/50 rounded">
                      <p className="text-xs text-ink-faint mb-1">Code to paste on your profile:</p>
                      <code className="block font-mono text-accent-strong text-sm break-all mb-2">
                        {e.verification_code}
                      </code>
                      <button
                        onClick={() => verify(e.id)}
                        disabled={verifying === e.id}
                        className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded disabled:opacity-50"
                      >
                        {verifying === e.id ? "Verifying…" : "I've added it — verify now"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
