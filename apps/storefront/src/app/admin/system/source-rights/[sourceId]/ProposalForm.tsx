"use client";

import { useState } from "react";
import {
  SOURCE_RIGHTS_PURPOSES,
  SOURCE_RIGHTS_VERDICTS,
  type SourceRightsPurpose,
  type SourceRightsVerdict,
} from "@/lib/source-rights/contract";

interface EvidenceDraft { url: string; title: string; observed_at: string }
interface CellDraft {
  proposed_field_path: string;
  purpose: SourceRightsPurpose;
  verdict: SourceRightsVerdict;
  conditions: string;
  attribution: string;
  retention_days: string;
}

const today = new Date().toISOString().slice(0, 10);

export default function ProposalForm({ sourceId }: { sourceId: string }) {
  const [summary, setSummary] = useState("");
  const [reviewTrigger, setReviewTrigger] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [agreementReference, setAgreementReference] = useState("");
  const [evidence, setEvidence] = useState<EvidenceDraft[]>([{ url: "", title: "", observed_at: today }]);
  const [cells, setCells] = useState<CellDraft[]>([{
    proposed_field_path: "card.name",
    purpose: "public-display",
    verdict: "unknown",
    conditions: "",
    attribution: "",
    retention_days: "",
  }]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/source-rights/${sourceId}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary,
          review_trigger: reviewTrigger,
          valid_until: validUntil || null,
          agreement_reference: agreementReference || null,
          public_evidence: evidence,
          cells: cells.map((cell) => ({
            ...cell,
            retention_days: cell.retention_days === "" ? null : Number(cell.retention_days),
          })),
        }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Proposal could not be recorded.");
      setMessage({ ok: true, text: "Draft recorded. It is not effective; submit it for review when ready." });
      window.location.reload();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Proposal could not be recorded." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
      <div>
        <h2 className="font-semibold text-white">New proposal revision</h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          This saves review evidence only. It cannot activate a source. Never paste credentials, signed URLs, contract files or private correspondence here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Summary">
          <textarea required maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} className={inputClass} rows={3} />
        </Field>
        <Field label="Review again when…">
          <textarea required maxLength={1000} value={reviewTrigger} onChange={(e) => setReviewTrigger(e.target.value)} className={inputClass} rows={3} />
        </Field>
        <Field label="Valid until (optional)">
          <input type="date" min={today} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Opaque agreement record ref (optional)">
          <input maxLength={200} value={agreementReference} onChange={(e) => setAgreementReference(e.target.value)} className={inputClass} placeholder="legal-register/2026/014" />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-200">Public evidence</h3>
          <button type="button" onClick={() => setEvidence([...evidence, { url: "", title: "", observed_at: today }])} className={smallButton}>Add evidence</button>
        </div>
        {evidence.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-neutral-800 p-3 md:grid-cols-[2fr_1fr_150px_auto]">
            <input required type="url" value={item.url} onChange={(e) => updateEvidence(index, "url", e.target.value)} className={inputClass} placeholder="https://official.example/terms" />
            <input required value={item.title} onChange={(e) => updateEvidence(index, "title", e.target.value)} className={inputClass} placeholder="Official terms" />
            <input required type="date" max={today} value={item.observed_at} onChange={(e) => updateEvidence(index, "observed_at", e.target.value)} className={inputClass} />
            <button type="button" disabled={evidence.length === 1} onClick={() => setEvidence(evidence.filter((_, i) => i !== index))} className={smallButton}>Remove</button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-neutral-200">Exact field and purpose cells</h3>
            <p className="text-xs text-neutral-600">Missing cells mean unknown. Wildcards are refused.</p>
          </div>
          <button type="button" onClick={() => setCells([...cells, {
            proposed_field_path: "card.name", purpose: "public-display", verdict: "unknown",
            conditions: "", attribution: "", retention_days: "",
          }])} className={smallButton}>Add cell</button>
        </div>
        {cells.map((cell, index) => (
          <div key={index} className="space-y-2 rounded-lg border border-neutral-800 p-3">
            <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_1fr_auto]">
              <input required value={cell.proposed_field_path} onChange={(e) => updateCell(index, "proposed_field_path", e.target.value)} className={`${inputClass} font-mono`} placeholder="card.image_url" aria-label="Proposed exact field path" />
              <select value={cell.purpose} onChange={(e) => updateCell(index, "purpose", e.target.value as SourceRightsPurpose)} className={inputClass}>
                {SOURCE_RIGHTS_PURPOSES.map((purpose) => <option key={purpose}>{purpose}</option>)}
              </select>
              <select value={cell.verdict} onChange={(e) => updateCell(index, "verdict", e.target.value as SourceRightsVerdict)} className={inputClass}>
                {SOURCE_RIGHTS_VERDICTS.map((verdict) => <option key={verdict}>{verdict}</option>)}
              </select>
              <button type="button" disabled={cells.length === 1} onClick={() => setCells(cells.filter((_, i) => i !== index))} className={smallButton}>Remove</button>
            </div>
            <div className="grid gap-2 md:grid-cols-[2fr_1fr_160px]">
              <input value={cell.conditions} onChange={(e) => updateCell(index, "conditions", e.target.value)} className={inputClass} placeholder="Conditions (required for conditional / contract-required)" />
              <input value={cell.attribution} onChange={(e) => updateCell(index, "attribution", e.target.value)} className={inputClass} placeholder="Attribution" />
              <input type="number" min={0} max={36500} value={cell.retention_days} onChange={(e) => updateCell(index, "retention_days", e.target.value)} className={inputClass} placeholder="Retention days" />
            </div>
          </div>
        ))}
      </div>

      {message && <p className={`text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p>}
      <button disabled={pending} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50">
        {pending ? "Recording…" : "Record non-effective draft"}
      </button>
    </form>
  );

  function updateEvidence(index: number, key: keyof EvidenceDraft, value: string) {
    setEvidence(evidence.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }

  function updateCell<K extends keyof CellDraft>(index: number, key: K, value: CellDraft[K]) {
    setCells(cells.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
}

const inputClass = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-500";
const smallButton = "rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-500 hover:text-white disabled:opacity-30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 text-xs text-neutral-500"><span>{label}</span>{children}</label>;
}
