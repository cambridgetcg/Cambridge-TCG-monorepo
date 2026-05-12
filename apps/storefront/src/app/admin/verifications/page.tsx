"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  UserVerification,
  VerificationStatus,
  VerificationDocument,
} from "@/lib/trust/types";
import { VERIFICATION_DOC_LABELS } from "@/lib/trust/types";
import {
  VERIFICATION_TIMELINE,
  getVerificationStep,
  isVerificationTerminal,
} from "@/lib/trust/verification-timeline";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
const STATUS_COLORS: Record<VerificationStatus, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  verified: "bg-emerald-500/20 text-emerald-400",
  rejected: "bg-red-500/20 text-red-400",
  expired: "bg-neutral-500/20 text-neutral-400",
};

// Common rejection reasons — admin can pick one-click. Anything
// specific goes in the free-text input next to these. Strings shown
// verbatim to the customer, so keep them tactful.
const COMMON_REJECTIONS = [
  "Document is blurry or unreadable.",
  "Document is expired.",
  "Name on document doesn't match submitted name.",
  "Address on document doesn't match submitted address.",
  "Document was not a recognised government-issued ID.",
  "Proof of address is too old (must be within 3 months).",
];

function maskValue(value: string | null): string {
  if (!value) return "---";
  if (value.length <= 4) return value;
  return "****" + value.slice(-4);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function computeAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function AdminVerificationsPage() {
  const [verifications, setVerifications] = useState<UserVerification[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [docsByUser, setDocsByUser] = useState<Record<string, VerificationDocument[]>>({});
  const [docsLoading, setDocsLoading] = useState<string | null>(null);

  const fetchVerifications = useCallback(async (pendingOnly = false) => {
    setLoading(true);
    try {
      const url = pendingOnly
        ? "/api/trust/verify?admin=true&pending=true"
        : "/api/trust/verify?admin=true";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setVerifications(data.verifications || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVerifications(filter === "pending"); }, [filter, fetchVerifications]);

  // Load documents lazily when a row expands. Admin-scoped endpoint
  // accepts ?user_id= so we don't need a separate per-verification API.
  useEffect(() => {
    if (!expanded) return;
    const userId = verifications.find((v) => v.id === expanded)?.user_id;
    if (!userId || docsByUser[userId] !== undefined) return;
    setDocsLoading(userId);
    fetch(`/api/trust/verify/documents?user_id=${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.documents) setDocsByUser((prev) => ({ ...prev, [userId]: d.documents }));
      })
      .finally(() => setDocsLoading(null));
  }, [expanded, verifications, docsByUser]);

  async function handleApprove(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/trust/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          userId,
          notes: adminNotes[userId] || null,
        }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((v) =>
            v.user_id === userId
              ? { ...v, status: "verified" as VerificationStatus, verified_at: new Date().toISOString(), admin_notes: adminNotes[userId] || v.admin_notes }
              : v
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(userId: string) {
    const reason = rejectReasons[userId];
    if (!reason?.trim()) return;
    setActionLoading(userId);
    try {
      const res = await fetch("/api/trust/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", userId, reason }),
      });
      if (res.ok) {
        setVerifications((prev) =>
          prev.map((v) =>
            v.user_id === userId
              ? { ...v, status: "rejected" as VerificationStatus, rejected_reason: reason }
              : v
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  // ── Stats ──
  const total = verifications.length;
  const pendingCount = verifications.filter((v) => v.status === "pending").length;
  const verifiedCount = verifications.filter((v) => v.status === "verified").length;
  const rejectedCount = verifications.filter((v) => v.status === "rejected").length;

  return (
    <AdminShell
      title="Verification Reviews"
      authProbe="/api/trust/verify?admin=true"
      actions={
        <button
          onClick={() => fetchVerifications(filter === "pending")}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
      <Audience kind="operator" />
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-white mt-1">{total}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Pending</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Verified</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{verifiedCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Rejected</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{rejectedCount}</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          {(["all", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm px-4 py-2 rounded-lg transition ${
                filter === f
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {f === "all" ? "All" : "Pending"}
            </button>
          ))}
        </div>

        {/* List */}
        {verifications.length === 0 && !loading && (
          <p className="text-neutral-500 text-center py-12">No verifications found.</p>
        )}

        <div className="space-y-3">
          {verifications.map((v) => (
            <div key={v.id} className="bg-neutral-900 rounded-xl overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-800/50 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-white">{v.full_legal_name}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[v.status]}`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-400 mt-1">
                    {v.postcode}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-neutral-500">{formatDate(v.created_at)}</p>
                </div>
                <span className="text-neutral-600 text-sm">
                  {expanded === v.id ? "\u25B2" : "\u25BC"}
                </span>
              </button>

              {/* Expanded detail */}
              {expanded === v.id && (
                <div className="px-4 pb-4 border-t border-neutral-800">
                  <AdminVerificationTimeline verification={v} />

                  {v.resubmitted_count != null && v.resubmitted_count > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-300">
                      Resubmission #{v.resubmitted_count + 1} — user has resubmitted {v.resubmitted_count} time{v.resubmitted_count === 1 ? "" : "s"} after prior rejection.
                    </div>
                  )}

                  <AdminDocumentGallery
                    userId={v.user_id}
                    docs={docsByUser[v.user_id]}
                    loading={docsLoading === v.user_id}
                  />

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 mb-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Full Address</span>
                      <p className="text-white">
                        {v.address_line1}
                        {v.address_line2 ? `, ${v.address_line2}` : ""}
                        <br />
                        {v.city}
                        {v.county ? `, ${v.county}` : ""}, {v.postcode}
                        <br />
                        {v.country}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500">Date of Birth</span>
                      <p className="text-white">{formatDate(v.date_of_birth)}</p>
                      <span className="text-neutral-500 mt-2 block">Age</span>
                      <p className="text-white">{computeAge(v.date_of_birth)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500">Phone</span>
                      <p className="text-white">
                        {v.phone || "---"}
                        {v.phone_verified && (
                          <span className="ml-2 text-xs text-emerald-400">verified</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Bank details (masked) */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Sort Code</span>
                      <p className="text-white font-mono">{maskValue(v.bank_sort_code)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500">Account Number</span>
                      <p className="text-white font-mono">{maskValue(v.bank_account_number)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-500">Account Name</span>
                      <p className="text-white">{v.bank_account_name || "---"}</p>
                    </div>
                  </div>

                  {v.rejected_reason && (
                    <div className="mb-4">
                      <span className="text-xs text-neutral-500">Rejection Reason</span>
                      <p className="text-sm text-red-400 mt-1">{v.rejected_reason}</p>
                    </div>
                  )}

                  {v.admin_notes && (
                    <div className="mb-4">
                      <span className="text-xs text-neutral-500">Admin Notes</span>
                      <p className="text-sm text-neutral-300 mt-1">{v.admin_notes}</p>
                    </div>
                  )}

                  {/* Actions for pending */}
                  {v.status === "pending" && (
                    <div className="border-t border-neutral-800 pt-4 space-y-3">
                      {/* Admin notes */}
                      <div>
                        <label className="text-xs text-neutral-500 block mb-1">Admin Notes</label>
                        <textarea
                          value={adminNotes[v.user_id] ?? ""}
                          onChange={(e) =>
                            setAdminNotes((prev) => ({ ...prev, [v.user_id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Optional notes..."
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                        />
                      </div>

                      <div className="flex items-end gap-3 flex-wrap">
                        {/* Approve */}
                        <button
                          onClick={() => handleApprove(v.user_id)}
                          disabled={actionLoading === v.user_id}
                          className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {actionLoading === v.user_id ? "..." : "Approve"}
                        </button>

                        {/* Reject */}
                        <div className="flex items-end gap-2 flex-1 min-w-[200px]">
                          <input
                            type="text"
                            value={rejectReasons[v.user_id] ?? ""}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({
                                ...prev,
                                [v.user_id]: e.target.value,
                              }))
                            }
                            placeholder="Rejection reason..."
                            className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                          />
                          <button
                            onClick={() => handleReject(v.user_id)}
                            disabled={
                              actionLoading === v.user_id ||
                              !rejectReasons[v.user_id]?.trim()
                            }
                            className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-500 transition disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      {/* Common rejection reasons — one click to fill the
                          text field with tactful, customer-ready copy. */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-neutral-600 mb-1.5">Quick reasons</p>
                        <div className="flex flex-wrap gap-1.5">
                          {COMMON_REJECTIONS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRejectReasons((prev) => ({ ...prev, [v.user_id]: r }))}
                              className="text-[11px] px-2 py-1 rounded-full bg-neutral-800 text-neutral-400 hover:bg-red-900/40 hover:text-red-300 transition"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
    </AdminShell>
  );
}

function AdminVerificationTimeline({ verification }: { verification: UserVerification }) {
  const activeIdx = getVerificationStep(verification.status);
  const terminal = isVerificationTerminal(verification.status);
  const isRejected = verification.status === "rejected";

  return (
    <div className="mb-4 bg-neutral-800/40 border border-neutral-700 rounded-lg p-3 mt-4">
      <div className="flex items-center gap-0 overflow-x-auto">
        {VERIFICATION_TIMELINE.map((step, i) => {
          let ts: string | null = null;
          if (step.key === "submitted") ts = verification.created_at;
          else if (step.key === "reviewing") ts = verification.updated_at ?? verification.created_at;
          else if (step.key === "resolved") ts = verification.verified_at ?? verification.rejected_at ?? null;
          const done = i < activeIdx || (i === activeIdx && terminal);
          const current = !terminal && i === activeIdx;
          const dotClass = isRejected && i === 2
            ? "bg-red-400 text-black"
            : done
              ? "bg-emerald-400 text-black"
              : current
                ? "bg-amber-400 text-black ring-2 ring-offset-2 ring-offset-neutral-800 ring-amber-400/40"
                : "bg-neutral-700 text-neutral-600";
          const labelClass = isRejected && i === 2
            ? "text-red-400"
            : done ? "text-emerald-400" : current ? "text-amber-400" : "text-neutral-600";
          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center min-w-[80px]">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${dotClass}`}>
                  {done ? (isRejected && i === 2 ? "✗" : "✓") : i + 1}
                </div>
                <span className={`text-[9px] mt-1 text-center leading-tight ${labelClass}`}>
                  {step.key === "resolved" && isRejected ? "Rejected" : step.label}
                </span>
                {ts && done && (
                  <span className="text-[8px] text-neutral-500 font-mono whitespace-nowrap mt-0.5">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              {i < VERIFICATION_TIMELINE.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-5 ${done ? "bg-emerald-400/50" : "bg-neutral-700"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminDocumentGallery({
  userId, docs, loading,
}: { userId: string; docs: VerificationDocument[] | undefined; loading: boolean }) {
  void userId; // present for future per-user filtering if needed
  if (loading) {
    return <p className="text-xs text-neutral-500 mb-3">Loading documents…</p>;
  }
  if (!docs) return null;
  if (docs.length === 0) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4 text-xs text-amber-300">
        No documents uploaded yet. Consider rejecting with &ldquo;Please upload a government-issued photo ID.&rdquo;
      </div>
    );
  }
  return (
    <div className="mb-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
        Documents ({docs.length})
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {docs.map((doc) => (
          <a
            key={doc.id}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border border-neutral-800 overflow-hidden hover:border-amber-500/40 transition"
          >
            {doc.mime_type?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.url} alt={doc.doc_type} className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square w-full bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs">
                PDF
              </div>
            )}
            <div className="px-2 py-1">
              <p className="text-[11px] text-neutral-300 truncate">
                {VERIFICATION_DOC_LABELS[doc.doc_type] ?? doc.doc_type}
              </p>
              <p className="text-[9px] text-neutral-600">
                {new Date(doc.uploaded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
