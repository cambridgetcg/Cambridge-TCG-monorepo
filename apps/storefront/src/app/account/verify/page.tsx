"use client";

import { useEffect, useState, useCallback } from "react";
import {
  UK_POSTCODE_REGEX,
  VERIFICATION_DOC_LABELS,
} from "@/lib/trust/types";
import type { UserVerification } from "@/lib/trust/types";
import { Audience } from "@/lib/ui";
import {
  VERIFICATION_TIMELINE,
  getVerificationStep,
  isVerificationTerminal,
} from "@/lib/trust/verification-timeline";

type FieldErrors = Record<string, string>;
interface SafeVerificationDocument {
  id: string;
  doc_type: string;
  mime_type: string | null;
  uploaded_at: string;
  access: "withheld_pending_private_storage";
}

export default function VerifyPage() {
  const [verification, setVerification] = useState<UserVerification | null>(null);
  const [documents, setDocuments] = useState<SafeVerificationDocument[]>([]);
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
      <Audience kind="consumer" />
        <div className="h-8 bg-surface-subtle rounded w-48 animate-pulse" />
        <div className="h-64 bg-surface rounded-lg animate-pulse" />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="bg-surface rounded-lg p-8 text-center">
        <p className="text-ink-muted mb-3">You need to be signed in to verify your identity.</p>
        <a href="/login" className="text-accent hover:underline text-sm font-medium">Sign in</a>
      </div>
    );
  }

  const status = verification?.status ?? null;
  const intakePaused = true;
  const showForm = !intakePaused && (!verification || status === "rejected" || status === "expired");
  const canUpload = !intakePaused && (!status || status === "pending" || status === "rejected" || status === "expired");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Identity verification (optional)</h1>
        <p className="text-sm text-ink-muted mt-2 max-w-prose">
          Verification is voluntary. Trading needs an account, not an identity — verifying
          does not affect what you can trade or your trust score. This flow exists for users
          who want their identity on file with the platform, and is currently UK-identity
          only. A public verified badge is planned but not yet shipped.
        </p>
      </div>

      {verification && <VerificationTimelineBar verification={verification} />}

      <div className="mb-6 rounded-lg border border-accent/30 bg-accent-wash p-4">
        <p className="text-sm font-medium text-accent">New identity verification is paused.</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          We are not accepting more legal-name, bank or identity-document data
          until dedicated private document storage, signed access and a tested
          retention/deletion schedule are in place. Existing documents can be
          removed below; contact support for deletion help.
        </p>
      </div>

      {status === "verified" && (
        <StatusCard tone="emerald" title="Verified">
          Your identity was verified on{" "}
          <span className="text-ink">
            {verification?.verified_at
              ? new Date(verification.verified_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "N/A"}
          </span>. Your identity is on file with the platform.
        </StatusCard>
      )}

      {status === "pending" && (
        <StatusCard tone="amber" title="Under Review">
          We&apos;re reviewing your submission — usually 1-2 business days.
          {verification?.resubmitted_count != null && verification.resubmitted_count > 0 && (
            <span className="text-xs text-ink-faint block mt-1">
              Resubmission {verification.resubmitted_count + 1}.
            </span>
          )}
        </StatusCard>
      )}

      {status === "rejected" && (
        <StatusCard tone="red" title="Rejected">
          {verification?.rejected_reason && (
            <p className="text-danger text-sm mb-2">
              <span className="text-ink-muted">Reason:</span> {verification.rejected_reason}
            </p>
          )}
          <p>Fix the issues below and resubmit.</p>
        </StatusCard>
      )}

      {status === "expired" && (
        <StatusCard tone="amber" title="Verification expired">
          Your prior verification lapsed. Re-submit if you&apos;d like to keep your identity
          on file — trading is unaffected either way.
        </StatusCard>
      )}

      {(canUpload || documents.length > 0) && (
        <div className="bg-surface rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink uppercase tracking-wide">Identity Documents</h2>
            <p className="text-xs text-ink-faint mt-1">
              New uploads are paused. Existing object links are withheld while
              private storage is reviewed; you can still remove a stored document.
            </p>
          </div>

          {documents.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="relative rounded-lg border border-border-subtle bg-surface-subtle p-3">
                  <p className="text-xs font-medium text-ink">
                    {VERIFICATION_DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                  </p>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    Preview withheld · uploaded {new Date(doc.uploaded_at).toLocaleDateString("en-GB")}
                  </p>
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink/70 text-page/80 hover:bg-danger hover:text-page opacity-0 group-hover:opacity-100 transition text-xs"
                    title="Remove"
                  >×</button>
                </div>
              ))}
            </div>
          )}

          {canUpload && <div className="flex items-center gap-2 flex-wrap">
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              className="px-3 py-2 bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink focus:outline-none focus:border-accent/50"
            >
              {Object.entries(VERIFICATION_DOC_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-sm transition ${
              uploading
                ? "bg-surface-subtle text-ink-faint cursor-not-allowed"
                : "bg-ink text-page hover:opacity-90"
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
          </div>}
          {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
        </div>
      )}

      {success && (
        <div className="bg-ok/10 border border-ok/30 rounded-lg p-4">
          <p className="text-ok text-sm font-medium">
            Verification submitted! We&apos;ll review within 1-2 business days.
          </p>
        </div>
      )}

      {showForm && (
        <>
          <div className="bg-accent-wash border border-accent/30 rounded-lg p-4">
            <p className="text-accent text-sm">
              This optional flow is currently paused. Do not submit identity or bank data.
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
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
                <p className="text-danger text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg font-semibold text-sm bg-ink text-page hover:opacity-90 transition disabled:opacity-50"
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
    <div className="bg-surface border border-border-subtle rounded-lg p-4">
      <div className="flex items-center gap-0 overflow-x-auto">
        {VERIFICATION_TIMELINE.map((step, i) => {
          let ts: string | null = null;
          if (step.key === "submitted") ts = verification.created_at;
          else if (step.key === "reviewing") ts = verification.updated_at ?? verification.created_at;
          else if (step.key === "resolved") ts = verification.verified_at ?? verification.rejected_at ?? null;
          const done = i < activeIdx || (i === activeIdx && terminal);
          const current = !terminal && i === activeIdx;

          const dotClass = isRejected && i === 2
            ? "bg-danger text-page"
            : done
              ? "bg-ok text-page"
              : current
                ? "bg-ink text-page"
                : "bg-surface-subtle text-ink-faint";
          const labelClass = isRejected && i === 2
            ? "text-danger"
            : done
              ? "text-ok"
              : current
                ? "text-ink"
                : "text-ink-faint";

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
                  <span className="text-[9px] text-ink-faint font-mono whitespace-nowrap mt-0.5">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              {i < VERIFICATION_TIMELINE.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-5 ${done ? "bg-ok/50" : "bg-surface-subtle"}`} />
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
    emerald: "bg-ok/10 border-ok/30 text-ok",
    amber:   "bg-accent-wash border-accent/30 text-accent",
    red:     "bg-danger/10 border-danger/30 text-danger",
  }[tone];
  return (
    <div className={`rounded-lg p-5 border ${cls}`}>
      <p className="font-semibold text-sm mb-1">{title}</p>
      <div className="text-sm text-ink-muted">{children}</div>
    </div>
  );
}

function FieldsCard({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-lg p-6 space-y-4">
      <div>
        <h2 className="text-sm font-bold text-ink uppercase tracking-wide">{title}</h2>
        {hint && <p className="text-xs text-ink-faint mt-1">{hint}</p>}
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
      <label className="block text-xs text-ink-faint mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 bg-surface-subtle border rounded-lg text-ink text-sm focus:outline-none transition ${
          error
            ? "border-danger/50 focus:border-danger"
            : "border-border-subtle focus:border-accent/50"
        } ${className ?? ""}`}
      />
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
