"use client";

import { useState, useEffect, useCallback } from "react";
import type { FraudSignal, TrustProfile, ExternalRep } from "@/lib/escrow/types";
import { TRUST_TIERS } from "@/lib/escrow/types";
import AdminShell from "@/components/admin/AdminShell";

import { Audience, WhyLink } from "@/lib/ui";
// ── Types ──

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low" | "resolved";

interface ExternalRepRow {
  user_id: string;
  user_name: string | null;
  user_email: string;
  platform: string;
  username: string;
  profile_url: string | null;
  screenshot_url: string | null;
  verified: boolean;
}

interface InspectionTrade {
  trade_id: string;
  card_name: string | null;
  card_image: string | null;
  value: string;
  seller_trust_score: number;
  buyer_trust_score: number;
  seller_name: string | null;
  buyer_name: string | null;
  status: string;
  inspected: boolean;
}

// ── Helpers ──

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 animate-pulse",
  high: "bg-red-500/20 text-red-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-neutral-500/20 text-neutral-400",
};

function severityBadge(severity: string) {
  return SEVERITY_BADGE[severity] || "bg-neutral-500/20 text-neutral-400";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tierForScore(score: number) {
  let tier: (typeof TRUST_TIERS)[number] = TRUST_TIERS[0];
  for (const t of TRUST_TIERS) {
    if (score >= t.minScore) tier = t;
  }
  return tier;
}

// ── Component ──

export default function AdminFraudPage() {
  // Fraud signals
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [signalFilter, setSignalFilter] = useState<SeverityFilter>("all");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [userProfiles, setUserProfiles] = useState<Record<string, TrustProfile>>({});
  const [profileLoading, setProfileLoading] = useState<string | null>(null);

  // Resolve / suspend state per signal
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [suspendReason, setSuspendReason] = useState<Record<string, string>>({});
  const [suspendDuration, setSuspendDuration] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // External rep
  const [repRows, setRepRows] = useState<ExternalRepRow[]>([]);
  const [repLoading, setRepLoading] = useState(false);
  const [repActionLoading, setRepActionLoading] = useState<string | null>(null);

  // Inspection queue
  const [inspectionTrades, setInspectionTrades] = useState<InspectionTrade[]>([]);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState<Record<string, string>>({});
  const [inspectionActionLoading, setInspectionActionLoading] = useState<string | null>(null);

  // ── Data fetching ──

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const resolved = signalFilter === "resolved" ? "true" : "false";
      const res = await fetch(`/api/escrow/fraud?resolved=${resolved}`);
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [signalFilter]);

  const fetchRep = useCallback(async () => {
    setRepLoading(true);
    try {
      const res = await fetch("/api/escrow/external-rep");
      if (res.ok) {
        const data = await res.json();
        const unverified = (data.reps || []).filter((r: ExternalRepRow) => !r.verified);
        setRepRows(unverified);
      }
    } catch {
      // ignore
    } finally {
      setRepLoading(false);
    }
  }, []);

  const fetchInspections = useCallback(async () => {
    setInspectionLoading(true);
    try {
      const res = await fetch("/api/escrow/inspections?pending=true");
      if (res.ok) {
        const data = await res.json();
        setInspectionTrades(data.trades || []);
      }
    } catch {
      // ignore
    } finally {
      setInspectionLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
    fetchRep();
    fetchInspections();
  }, [fetchSignals, fetchRep, fetchInspections]);

  // ── Signal actions ──

  async function loadUserProfile(userId: string) {
    if (userProfiles[userId]) return;
    setProfileLoading(userId);
    try {
      const res = await fetch(`/api/escrow/trust-profile?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setUserProfiles((prev) => ({ ...prev, [userId]: data.profile }));
        }
      }
    } catch {
      // ignore
    } finally {
      setProfileLoading(null);
    }
  }

  function handleExpand(id: string, userId: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    loadUserProfile(userId);
  }

  async function handleResolve(signalId: string, dismiss?: boolean) {
    const notes = dismiss ? "Dismissed by admin" : resolveNotes[signalId]?.trim();
    if (!notes && !dismiss) return;
    setActionLoading(signalId);
    try {
      const res = await fetch("/api/escrow/fraud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, notes }),
      });
      if (res.ok) {
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSuspend(signalId: string, userId: string) {
    const reason = suspendReason[signalId]?.trim();
    const notes = resolveNotes[signalId]?.trim() || reason;
    if (!reason) return;
    setActionLoading(signalId);
    try {
      const res = await fetch("/api/escrow/fraud", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalId,
          notes,
          suspend: true,
          userId,
          suspendReason: reason,
          suspendDuration: suspendDuration[signalId] || "7d",
        }),
      });
      if (res.ok) {
        setSignals((prev) => prev.filter((s) => s.id !== signalId));
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  // ── External rep actions ──

  async function handleVerifyRep(userId: string, platform: string) {
    const key = `${userId}-${platform}`;
    setRepActionLoading(key);
    try {
      const res = await fetch("/api/escrow/external-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", userId, platform, notes: "Verified by admin" }),
      });
      if (res.ok) {
        setRepRows((prev) => prev.filter((r) => !(r.user_id === userId && r.platform === platform)));
      }
    } catch {
      // ignore
    } finally {
      setRepActionLoading(null);
    }
  }

  async function handleRejectRep(userId: string, platform: string) {
    const key = `${userId}-${platform}`;
    setRepActionLoading(key);
    try {
      const res = await fetch("/api/escrow/external-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", userId, platform, notes: "Rejected by admin" }),
      });
      if (res.ok) {
        setRepRows((prev) => prev.filter((r) => !(r.user_id === userId && r.platform === platform)));
      }
    } catch {
      // ignore
    } finally {
      setRepActionLoading(null);
    }
  }

  // ── Inspection actions ──

  async function handleInspection(tradeId: string, passed: boolean) {
    setInspectionActionLoading(tradeId);
    try {
      const res = await fetch(`/api/escrow/inspections/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passed,
          inspector_notes: inspectionNotes[tradeId]?.trim() || null,
        }),
      });
      if (res.ok) {
        setInspectionTrades((prev) => prev.filter((t) => t.trade_id !== tradeId));
      }
    } catch {
      // ignore
    } finally {
      setInspectionActionLoading(null);
    }
  }

  // ── Filtered signals ──

  const filtered =
    signalFilter === "all"
      ? signals.filter((s) => !s.resolved)
      : signalFilter === "resolved"
        ? signals
        : signals.filter((s) => s.severity === signalFilter && !s.resolved);

  const totalSignals = signals.length;
  const criticalCount = signals.filter((s) => s.severity === "critical" && !s.resolved).length;
  const highCount = signals.filter((s) => s.severity === "high" && !s.resolved).length;
  const unresolvedCount = signals.filter((s) => !s.resolved).length;

  // ── Main Dashboard ──

  return (
    <AdminShell
      title="Fraud Detection & Trust"
      authProbe="/api/escrow/fraud?resolved=false"
      actions={
        <button
          onClick={() => {
            fetchSignals();
            fetchRep();
            fetchInspections();
          }}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
      <Audience kind="operator" />
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {/* ═══════════════════════════════════════════
            SECTION 1: FRAUD SIGNALS
        ═══════════════════════════════════════════ */}

        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">Fraud Signals <WhyLink href="/methodology/fraud-flag" label="methodology" /></h2>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-neutral-900 rounded-xl p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-white mt-1">{totalSignals}</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Critical</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{criticalCount}</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">High</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{highCount}</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Unresolved</p>
              <p className="text-2xl font-bold text-white mt-1">{unresolvedCount}</p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {(
              [
                { key: "all", label: "All" },
                { key: "critical", label: "Critical" },
                { key: "high", label: "High" },
                { key: "medium", label: "Medium" },
                { key: "low", label: "Low" },
                { key: "resolved", label: "Resolved" },
              ] as { key: SeverityFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSignalFilter(tab.key)}
                className={`text-sm px-4 py-2 rounded-lg transition ${
                  signalFilter === tab.key
                    ? "bg-amber-500 text-black font-bold"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Signal list */}
          {filtered.length === 0 && !loading && (
            <p className="text-neutral-500 text-center py-8">No signals found.</p>
          )}

          <div className="space-y-3">
            {filtered.map((s) => {
              const isExp = expanded === s.id;
              const profile = userProfiles[s.user_id];
              const isBlocking = s.auto_action === "block_trade" || s.auto_action === "suspend";

              return (
                <div key={s.id} className="bg-neutral-900 rounded-xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => handleExpand(s.id, s.user_id)}
                    className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-800/50 transition"
                  >
                    {/* Severity badge */}
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${severityBadge(s.severity)}`}
                    >
                      {s.severity.toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold text-white">{s.signal_type}</span>
                        <span className="text-sm text-neutral-400">
                          {s.user_name || s.user_email || "Unknown user"}
                          {s.user_name && s.user_email && (
                            <span className="text-neutral-600 ml-1 text-xs">({s.user_email})</span>
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-500 mt-1 truncate">{s.description}</p>
                    </div>

                    {/* Auto-action badge */}
                    {s.auto_action && (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          isBlocking
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-neutral-700 text-neutral-300"
                        }`}
                      >
                        {s.auto_action}
                      </span>
                    )}

                    <div className="text-right shrink-0">
                      <p className="text-xs text-neutral-500">{formatDate(s.created_at)}</p>
                    </div>
                    <span className="text-neutral-600 text-sm">{isExp ? "\u25B2" : "\u25BC"}</span>
                  </button>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="px-4 pb-4 border-t border-neutral-800">
                      {/* Full description */}
                      <div className="mt-4 mb-4 text-sm">
                        <span className="text-neutral-500">Description</span>
                        <p className="text-neutral-300 mt-1">{s.description}</p>
                      </div>

                      {s.trade_id && (
                        <div className="mb-4 text-sm">
                          <span className="text-neutral-500">Trade ID</span>
                          <p className="text-white font-mono text-xs mt-1">{s.trade_id}</p>
                        </div>
                      )}

                      {/* Auto-action prominent display */}
                      {isBlocking && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
                          <span className="text-red-400 font-bold">Auto-action taken: {s.auto_action}</span>
                          <p className="text-red-300 mt-1 text-xs">
                            This action was applied automatically by the fraud detection system.
                          </p>
                        </div>
                      )}

                      {/* User trust profile summary */}
                      {profileLoading === s.user_id && (
                        <p className="text-neutral-500 text-sm mb-4">Loading trust profile...</p>
                      )}
                      {profile && (
                        <div className="mb-4 p-3 bg-neutral-800 rounded-lg">
                          <span className="text-xs text-neutral-500 uppercase tracking-wide block mb-2">
                            User Trust Profile
                          </span>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <span className="text-neutral-500">Trust Score</span>
                              <p className="text-white font-bold">
                                {profile.trust_score}
                                <span className="text-xs text-neutral-500 ml-1">
                                  ({tierForScore(profile.trust_score).name})
                                </span>
                              </p>
                            </div>
                            <div>
                              <span className="text-neutral-500">Trades</span>
                              <p className="text-white">
                                {profile.completed_trades}/{profile.total_trades}
                              </p>
                            </div>
                            <div>
                              <span className="text-neutral-500">Disputes</span>
                              <p className={`${profile.disputed_trades > 0 ? "text-red-400" : "text-white"}`}>
                                {profile.disputed_trades}
                                {profile.disputed_trades > 0 && (
                                  <span className="text-xs ml-1">
                                    (W:{profile.disputes_won} L:{profile.disputes_lost})
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="text-neutral-500">Avg Rating</span>
                              <p className="text-white">{profile.avg_rating}</p>
                            </div>
                          </div>
                          {profile.is_suspended && (
                            <p className="text-red-400 text-xs mt-2 font-medium">
                              Currently suspended: {profile.suspended_reason}
                              {profile.suspended_until && ` (until ${formatDate(profile.suspended_until)})`}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      {!s.resolved && (
                        <div className="border-t border-neutral-800 pt-4 space-y-3">
                          <span className="text-xs text-neutral-500 uppercase tracking-wide block">
                            Actions
                          </span>

                          {/* Resolve notes */}
                          <div>
                            <label className="text-xs text-neutral-500 block mb-1">Notes</label>
                            <textarea
                              value={resolveNotes[s.id] ?? ""}
                              onChange={(e) =>
                                setResolveNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                              }
                              rows={2}
                              placeholder="Resolution notes..."
                              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                            />
                          </div>

                          {/* Suspend fields */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs text-neutral-500 block mb-1">
                                Suspend Reason (optional)
                              </label>
                              <input
                                type="text"
                                value={suspendReason[s.id] ?? ""}
                                onChange={(e) =>
                                  setSuspendReason((prev) => ({ ...prev, [s.id]: e.target.value }))
                                }
                                placeholder="Reason for suspension..."
                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-neutral-500 block mb-1">
                                Suspend Duration
                              </label>
                              <select
                                value={suspendDuration[s.id] ?? "7d"}
                                onChange={(e) =>
                                  setSuspendDuration((prev) => ({ ...prev, [s.id]: e.target.value }))
                                }
                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
                              >
                                <option value="1d">1 Day</option>
                                <option value="3d">3 Days</option>
                                <option value="7d">7 Days</option>
                                <option value="14d">14 Days</option>
                                <option value="30d">30 Days</option>
                                <option value="permanent">Permanent</option>
                              </select>
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-3 flex-wrap">
                            <button
                              onClick={() => handleResolve(s.id)}
                              disabled={actionLoading === s.id || !resolveNotes[s.id]?.trim()}
                              className="px-5 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                            >
                              {actionLoading === s.id ? "..." : "Resolve"}
                            </button>
                            <button
                              onClick={() => handleSuspend(s.id, s.user_id)}
                              disabled={actionLoading === s.id || !suspendReason[s.id]?.trim()}
                              className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-400 transition disabled:opacity-50"
                            >
                              {actionLoading === s.id ? "..." : "Suspend User"}
                            </button>
                            <button
                              onClick={() => handleResolve(s.id, true)}
                              disabled={actionLoading === s.id}
                              className="px-5 py-2 bg-neutral-700 text-neutral-300 text-sm font-medium rounded-lg hover:bg-neutral-600 transition disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 2: PENDING EXTERNAL REP VERIFICATIONS
        ═══════════════════════════════════════════ */}

        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">
            Pending External Rep Verifications
            {repRows.length > 0 && (
              <span className="text-sm font-normal text-neutral-500 ml-2">({repRows.length})</span>
            )}
          </h2>

          {repLoading && <p className="text-neutral-500 text-sm py-4">Loading...</p>}

          {!repLoading && repRows.length === 0 && (
            <div className="bg-neutral-900 rounded-xl p-6 text-center">
              <p className="text-neutral-500">No pending verifications.</p>
            </div>
          )}

          <div className="space-y-3">
            {repRows.map((r) => {
              const key = `${r.user_id}-${r.platform}`;
              const isActioning = repActionLoading === key;

              return (
                <div
                  key={key}
                  className="bg-neutral-900 rounded-xl px-4 py-4 flex items-center gap-4 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        {r.user_name || r.user_email}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">
                        {r.platform}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-400 mt-1">
                      @{r.username}
                      {r.profile_url && (
                        <>
                          {" \u00B7 "}
                          <a
                            href={r.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-400 hover:text-amber-300 underline"
                          >
                            View Profile
                          </a>
                        </>
                      )}
                    </p>
                    {r.screenshot_url && (
                      <a
                        href={r.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2"
                      >
                        <div className="w-24 h-16 bg-neutral-800 rounded-lg overflow-hidden">
                          <img
                            src={r.screenshot_url}
                            alt="Screenshot"
                            className="w-full h-full object-cover hover:opacity-80 transition"
                          />
                        </div>
                      </a>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleVerifyRep(r.user_id, r.platform)}
                      disabled={isActioning}
                      className="px-4 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                    >
                      {isActioning ? "..." : "Verify"}
                    </button>
                    <button
                      onClick={() => handleRejectRep(r.user_id, r.platform)}
                      disabled={isActioning}
                      className="px-4 py-2 bg-red-500/20 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/30 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════
            SECTION 3: ESCROW INSPECTION QUEUE
        ═══════════════════════════════════════════ */}

        <section className="mb-12">
          <h2 className="text-lg font-bold text-white mb-4">
            Escrow Inspection Queue
            {inspectionTrades.length > 0 && (
              <span className="text-sm font-normal text-neutral-500 ml-2">
                ({inspectionTrades.length})
              </span>
            )}
          </h2>

          {inspectionLoading && <p className="text-neutral-500 text-sm py-4">Loading...</p>}

          {!inspectionLoading && inspectionTrades.length === 0 && (
            <div className="bg-neutral-900 rounded-xl p-6 text-center">
              <p className="text-neutral-500">No trades pending inspection.</p>
            </div>
          )}

          <div className="space-y-3">
            {inspectionTrades.map((t) => {
              const isActioning = inspectionActionLoading === t.trade_id;

              return (
                <div key={t.trade_id} className="bg-neutral-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-4">
                      {/* Card image */}
                      {t.card_image && (
                        <div className="w-16 h-22 shrink-0 bg-neutral-800 rounded-lg overflow-hidden">
                          <img
                            src={t.card_image}
                            alt={t.card_name || "Card"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold text-white">
                            {t.card_name || "Unknown Card"}
                          </span>
                          <span className="text-sm font-bold text-amber-400">
                            {t.value}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-sm">
                          <div>
                            <span className="text-neutral-500">Seller: </span>
                            <span className="text-white">{t.seller_name || "---"}</span>
                            <span className="text-xs text-neutral-500 ml-1">
                              (trust: {t.seller_trust_score})
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-500">Buyer: </span>
                            <span className="text-white">{t.buyer_name || "---"}</span>
                            <span className="text-xs text-neutral-500 ml-1">
                              (trust: {t.buyer_trust_score})
                            </span>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="mt-3">
                          <textarea
                            value={inspectionNotes[t.trade_id] ?? ""}
                            onChange={(e) =>
                              setInspectionNotes((prev) => ({
                                ...prev,
                                [t.trade_id]: e.target.value,
                              }))
                            }
                            rows={2}
                            placeholder="Inspector notes..."
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 mt-3">
                          <button
                            onClick={() => handleInspection(t.trade_id, true)}
                            disabled={isActioning}
                            className="px-5 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                          >
                            {isActioning ? "..." : "Pass"}
                          </button>
                          <button
                            onClick={() => handleInspection(t.trade_id, false)}
                            disabled={isActioning}
                            className="px-5 py-2 bg-red-500 text-white text-sm font-bold rounded-lg hover:bg-red-400 transition disabled:opacity-50"
                          >
                            {isActioning ? "..." : "Fail"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
    </AdminShell>
  );
}
