"use client";

import { useEffect, useState, useCallback } from "react";
import {
  UK_POSTCODE_REGEX,
  VERIFICATION_DOC_LABELS,
} from "@/lib/trust/types";
import type { UserVerification, VerificationDocument } from "@/lib/trust/types";
import {
  VERIFICATION_TIMELINE,
  getVerificationStep,
  isVerificationTerminal,
} from "@/lib/trust/verification-timeline";

type FieldErrors = Record<string, string>;

export default function VerifyPage() {
  const [verification, setVerification] = useState<UserVerification | null>(null);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [postcode, setPostcode] = useState("");
  const [phone, setPhone] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [uploadType, setUploadType] = useState<string>("id_front");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [vRes, dRes] = await Promise.all([
      fetch("/api/trust/verify"),
      fetch("/api/trust/verify/documents"),
    ]);
    if (vRes.ok) {
      const d = await vRes.json();
      if (d?.verification) setVerification(d.verification);
    }
    if (dRes.ok) {
      const d = await dRes.json();
      setDocuments(d.documents ?? []);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setLoggedIn(!!data?.user?.email))
      .catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    if (loggedIn === false) { setLoading(false); return; }
    if (loggedIn === null) return;
    loadAll().finally(() => setLoading(false));
  }, [loggedIn, loadAll]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setFieldErrors({}); setSuccess(false);

    if (!UK_POSTCODE_REGEX.test(postcode)) {
      setFieldErrors({ postcode: "Enter a valid UK postcode." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/trust/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullLegalName: fullName,
          dateOfBirth: dob,
          addressLine1,
          addressLine2: addressLine2 || null,
          city,
          county: county || null,
          postcode: postcode.toUpperCase(),
          phone: phone || null,
          bankSortCode: sortCode || null,
          bankAccountNumber: accountNumber || null,
          bankAccountName: accountName || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.fields && typeof data.fields === "object") {
          setFieldErrors(data.fields as FieldErrors);
        }
        setError(data?.error || "Failed to submit verification.");
        return;
      }

      setSuccess(true);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadError(null); setUploading(true);
    try {
      const presignRes = await fetch("/api/trust/verify/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!presignRes.ok) {
        const d = await presignRes.json().catch(() => null);
        throw new Error(d?.error || "Could not prepare upload.");
      }
      const { uploadUrl, imageUrl, s3Key } = await presignRes.json();
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed.");
      const persistRes = await fetch("/api/trust/verify/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ s3Key, url: imageUrl, docType: uploadType, mimeType: file.type }),
      });
      if (!persistRes.ok) {
        const d = await persistRes.json().catch(() => null);
        throw new Error(d?.error || "Upload record failed.");
      }
      const { document } = await persistRes.json();
      setDocuments((prev) => [document, ...prev]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    if (!confirm("Remove this document?")) return;
    const res = await fetch(`/api/trust/verify/documents?id=${id}`, { method: "DELETE" });
    if (res.ok) setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-neutral-800 rounded w-48 animate-pulse" />
        <div className="h-64 bg-neutral-900 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="bg-neutral-900 rounded-xl p-8 text-center">
        <p className="text-neutral-400 mb-3">You need to be signed in to verify your identity.</p>
        <a href="/login" className="text-amber-400 hover:underline text-sm font-medium">Sign in</a>
      </div>
    );
  }

  const status = verification?.status ?? null;
  const showForm = !verification || status === "rejected" || status === "expired";
  const canUpload = !status || status === "pending" || status === "rejected" || status === "expired";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Verification</h1>

      {verification && <VerificationTimelineBar verification={verification} />}

      {status === "verified" && (
        <StatusCard tone="emerald" title="Verified">
          Your identity was verified on{" "}
          <span className="text-white">
            {verification?.verified_at
              ? new Date(verification.verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "N/A"}
          </span>. You can participate in P2P trades.
        </StatusCard>
      )}

      {status === "pending" && (
        <StatusCard tone="amber" title="Under Review">
          We&apos;re reviewing your submission — usually 1-2 business days.
          {verification?.resubmitted_count != null && verification.resubmitted_count > 0 && (
            <span className="text-xs text-neutral-500 block mt-1">
              Resubmission {verification.resubmitted_count + 1}.
            </span>
          )}
        </StatusCard>
      )}

      {status === "rejected" && (
        <StatusCard tone="red" title="Rejected">
          {verification?.rejected_reason && (
            <p className="text-red-200 text-sm mb-2">
              <span className="text-neutral-400">Reason:</span> {verification.rejected_reason}
            </p>
          )}
          <p>Fix the issues below and resubmit.</p>
        </StatusCard>
      )}

      {status === "expired" && (
        <StatusCard tone="amber" title="Verification expired">
          Your prior verification lapsed. Re-submit to restore P2P access.
        </StatusCard>
      )}

      {canUpload && (
        <div className="bg-neutral-900 rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Identity Documents</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Government-issued photo ID and a recent proof of address. Images or PDF.
            </p>
          </div>

          {documents.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="relative group">
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                     className="block rounded-lg border border-neutral-800 overflow-hidden hover:border-amber-500/40 transition">
                    {doc.mime_type?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={doc.url} alt={doc.doc_type} className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="aspect-square w-full bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs">PDF</div>
                    )}
                    <p className="text-[11px] text-neutral-400 px-2 py-1 truncate">
                      {VERIFICATION_DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                    </p>
                  </a>
                  {/* canUpload gate above ensures status isn't 'verified' here */}
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-neutral-300 hover:bg-red-900/80 hover:text-white opacity-0 group-hover:opacity-100 transition text-xs"
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50"
            >
              {Object.entries(VERIFICATION_DOC_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-sm transition ${
              uploading
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-amber-500 text-black hover:bg-amber-400"
            }`}>
              {uploading ? "Uploading…" : "Upload document"}
              <input
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
                className="hidden"
              />
            </label>
          </div>
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <p className="text-emerald-400 text-sm font-medium">
            Verification submitted! We&apos;ll review within 1-2 business days.
          </p>
        </div>
      )}

      {showForm && (
        <>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
            <p className="text-amber-200/80 text-sm">
              UK residents only. Your information is encrypted and never shared.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <FieldsCard title="Personal Details">
              <Field label="Full legal name *" value={fullName} onChange={setFullName} required placeholder="As it appears on your ID" error={fieldErrors.fullLegalName} />
              <Field label="Date of birth *" type="date" value={dob} onChange={setDob} required error={fieldErrors.dateOfBirth} />
            </FieldsCard>

            <FieldsCard title="UK Address">
              <Field label="Address line 1 *" value={addressLine1} onChange={setAddressLine1} required error={fieldErrors.addressLine1} />
              <Field label="Address line 2" value={addressLine2} onChange={setAddressLine2} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="City *" value={city} onChange={setCity} required error={fieldErrors.city} />
                <Field label="County" value={county} onChange={setCounty} />
              </div>
              <div className="max-w-[200px]">
                <Field label="Postcode *" value={postcode} onChange={setPostcode} required placeholder="SW1A 1AA" error={fieldErrors.postcode} className="uppercase" />
              </div>
              <Field label="Phone (optional)" value={phone} onChange={setPhone} type="tel" placeholder="+44" />
            </FieldsCard>

            <FieldsCard title="Bank Details" hint="Optional — add later if you prefer.">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sort code" value={sortCode} onChange={setSortCode} placeholder="00-00-00" error={fieldErrors.bankSortCode} />
                <Field label="Account number" value={accountNumber} onChange={setAccountNumber} placeholder="12345678" error={fieldErrors.bankAccountNumber} />
              </div>
              <Field label="Account name" value={accountName} onChange={setAccountName} placeholder="Name on your bank account" error={fieldErrors.bankAccountName} />
            </FieldsCard>

            {error && Object.keys(fieldErrors).length === 0 && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg font-bold text-sm bg-amber-500 text-black hover:bg-amber-400 transition disabled:opacity-50"
            >
              {submitting
                ? "Submitting…"
                : status === "rejected"
                  ? "Resubmit Verification"
                  : status === "expired"
                    ? "Re-verify"
                    : "Submit Verification"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ── Presentation components ──────────────────────────────────────────────────

function VerificationTimelineBar({ verification }: { verification: UserVerification }) {
  const activeIdx = getVerificationStep(verification.status);
  const terminal = isVerificationTerminal(verification.status);
  const isRejected = verification.status === "rejected";

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
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
                ? "bg-amber-400 text-black ring-2 ring-offset-2 ring-offset-neutral-900 ring-amber-400/40"
                : "bg-neutral-700 text-neutral-600";
          const labelClass = isRejected && i === 2
            ? "text-red-400"
            : done
              ? "text-emerald-400"
              : current
                ? "text-amber-400"
                : "text-neutral-600";

          return (
            <div key={step.key} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center min-w-[88px]">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${dotClass}`}>
                  {done ? (isRejected && i === 2 ? "✗" : "✓") : i + 1}
                </div>
                <span className={`text-[10px] mt-1.5 text-center leading-tight ${labelClass}`}>
                  {step.key === "resolved" && isRejected ? "Rejected" : step.label}
                </span>
                {ts && done && (
                  <span className="text-[9px] text-neutral-500 font-mono whitespace-nowrap mt-0.5">
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

function StatusCard({
  tone, title, children,
}: { tone: "emerald" | "amber" | "red"; title: string; children: React.ReactNode }) {
  const cls = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    amber:   "bg-amber-500/10 border-amber-500/30 text-amber-300",
    red:     "bg-red-500/10 border-red-500/30 text-red-300",
  }[tone];
  return (
    <div className={`rounded-xl p-5 border ${cls}`}>
      <p className="font-semibold text-sm mb-1">{title}</p>
      <div className="text-sm text-neutral-300">{children}</div>
    </div>
  );
}

function FieldsCard({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-neutral-900 rounded-xl p-6 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-white uppercase tracking-wide">{title}</h2>
        {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, placeholder, error, className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
  className?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 bg-neutral-800 border rounded-lg text-white text-sm focus:outline-none transition ${
          error
            ? "border-red-500/50 focus:border-red-500"
            : "border-neutral-700 focus:border-amber-500/50"
        } ${className ?? ""}`}
      />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}
