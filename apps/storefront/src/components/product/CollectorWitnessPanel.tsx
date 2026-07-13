"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select } from "@/lib/ui";

type ObservationKind = "purchase" | "completed_sale" | "asking_price";
type SharingMode = "private" | "anonymous_aggregate" | "cc0";

export interface CollectorObservation {
  id: string;
  submission_key: string;
  sku: string;
  observation_kind: ObservationKind;
  condition: string | null;
  price_amount: string;
  price_currency: string;
  observed_on: string;
  sharing_mode: SharingMode;
  sharing_terms_version: string;
  sharing_changed_at: string;
  cc0_acknowledged_at: string | null;
  evidence_sha256: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

function receiptMoment(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function CollectorPermissionReceipt({
  observation,
}: {
  observation: Pick<
    CollectorObservation,
    | "sharing_mode"
    | "sharing_terms_version"
    | "sharing_changed_at"
    | "cc0_acknowledged_at"
  >;
}) {
  return (
    <div className="text-xs text-ink-faint mt-2" aria-label="Sharing permission receipt">
      <p>
        Permission notice <code>{observation.sharing_terms_version}</code>
        {" · changed "}
        <time dateTime={observation.sharing_changed_at}>
          {receiptMoment(observation.sharing_changed_at)}
        </time>
      </p>
      {observation.sharing_mode === "cc0" && observation.cc0_acknowledged_at && (
        <p>
          CC0 acknowledged {" "}
          <time dateTime={observation.cc0_acknowledged_at}>
            {receiptMoment(observation.cc0_acknowledged_at)}
          </time>
        </p>
      )}
    </div>
  );
}

export interface WitnessForm {
  observationKind: ObservationKind;
  condition: string;
  amount: string;
  currency: string;
  observedOn: string;
  sharingMode: SharingMode;
  evidenceSha256: string;
  firstPartyAttested: boolean;
  cc0Acknowledged: boolean;
}

const KIND_LABELS: Record<ObservationKind, string> = {
  purchase: "I bought this card",
  completed_sale: "I completed this sale",
  asking_price: "I set this asking price",
};

const SHARING_LABELS: Record<SharingMode, string> = {
  private: "Private",
  anonymous_aggregate: "Future anonymous projection",
  cc0: "Future CC0 projection",
};

function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function emptyForm(): WitnessForm {
  return {
    observationKind: "purchase",
    condition: "",
    amount: "",
    currency: "GBP",
    observedOn: localToday(),
    sharingMode: "private",
    evidenceSha256: "",
    firstPartyAttested: false,
    cc0Acknowledged: false,
  };
}

function formFromObservation(observation: CollectorObservation): WitnessForm {
  return {
    observationKind: observation.observation_kind,
    condition: observation.condition ?? "",
    amount: observation.price_amount,
    currency: observation.price_currency,
    observedOn: observation.observed_on.slice(0, 10),
    sharingMode: observation.sharing_mode,
    evidenceSha256: observation.evidence_sha256 ?? "",
    firstPartyAttested: true,
    cc0Acknowledged: false,
  };
}

function comparablePrice(value: string): string {
  const match = value.match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
  if (!match) return value;
  return `${match[1]}.${(match[2] ?? "").padEnd(2, "0")}`;
}

export function buildWitnessPayload(input: {
  sku: string;
  form: WitnessForm;
  editing: CollectorObservation | null;
  submissionKey: string;
  evidenceTouched: boolean;
}): Record<string, unknown> {
  const { sku, form, editing, submissionKey, evidenceTouched } = input;
  if (!editing) {
    return {
      submission_key: submissionKey,
      sku,
      observation_kind: form.observationKind,
      condition: form.condition || null,
      price_amount: form.amount,
      price_currency: form.currency,
      observed_on: form.observedOn,
      sharing_mode: form.sharingMode,
      evidence_sha256: form.evidenceSha256 || null,
      first_party_attested: true,
      cc0_acknowledged: form.sharingMode === "cc0" ? form.cc0Acknowledged : false,
    };
  }

  const payload: Record<string, unknown> = { revision: editing.revision };
  const condition = form.condition || null;
  if (form.observationKind !== editing.observation_kind) {
    payload.observation_kind = form.observationKind;
  }
  if (condition !== editing.condition) payload.condition = condition;
  if (comparablePrice(form.amount) !== comparablePrice(editing.price_amount)) {
    payload.price_amount = form.amount;
  }
  if (form.currency !== editing.price_currency) payload.price_currency = form.currency;
  if (form.observedOn !== editing.observed_on.slice(0, 10)) {
    payload.observed_on = form.observedOn;
  }
  if (form.sharingMode !== editing.sharing_mode) {
    payload.sharing_mode = form.sharingMode;
    payload.cc0_acknowledged =
      form.sharingMode === "cc0" ? form.cc0Acknowledged : false;
  }
  if (evidenceTouched) {
    payload.evidence_sha256 = form.evidenceSha256 || null;
  }
  return payload;
}

async function responseMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as
    | { error?: string | { message?: string }; message?: string }
    | null;
  if (typeof body?.error === "string") return body.error;
  if (body?.error && typeof body.error === "object" && body.error.message) return body.error.message;
  return body?.message ?? `Request failed (${response.status}).`;
}

async function sha256(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Choose a file smaller than 25 MB. It stays on this device, but still has to fit in memory while hashing.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type NotebookLoad =
  | { access: "ready"; observations: CollectorObservation[] }
  | { access: "signed-out" | "not-ready"; observations: [] };

async function fetchNotebook(endpoint: string): Promise<NotebookLoad> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (response.status === 401) return { access: "signed-out", observations: [] };
  if (response.status === 503) return { access: "not-ready", observations: [] };
  if (!response.ok) throw new Error(await responseMessage(response));
  const body = await response.json() as { observations?: CollectorObservation[] };
  return {
    access: "ready",
    observations: Array.isArray(body.observations) ? body.observations : [],
  };
}

export default function CollectorWitnessPanel({ sku }: { sku: string }) {
  const [access, setAccess] = useState<"loading" | "ready" | "signed-out" | "not-ready" | "error">("loading");
  const [observations, setObservations] = useState<CollectorObservation[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<WitnessForm>(() => emptyForm());
  const [editing, setEditing] = useState<CollectorObservation | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [evidenceTouched, setEvidenceTouched] = useState(false);

  const endpoint = useMemo(
    () => `/api/account/observations?sku=${encodeURIComponent(sku)}`,
    [sku],
  );

  const load = useCallback(async () => {
    try {
      const result = await fetchNotebook(endpoint);
      setObservations(result.observations);
      setAccess(result.access);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The private notebook could not be loaded.");
      setAccess("error");
    }
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    void fetchNotebook(endpoint)
      .then((result) => {
        if (!active) return;
        setObservations(result.observations);
        setAccess(result.access);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "The private notebook could not be loaded.");
        setAccess("error");
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  function startNew() {
    setEditing(null);
    setSubmissionKey(null);
    setForm(emptyForm());
    setEvidenceTouched(false);
    setMessage(null);
    setFormOpen(true);
  }

  function startCorrection(observation: CollectorObservation) {
    setEditing(observation);
    setSubmissionKey(null);
    setForm(formFromObservation(observation));
    setEvidenceTouched(false);
    setMessage(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setEditing(null);
    setSubmissionKey(null);
    setEvidenceTouched(false);
    setMessage(null);
  }

  async function chooseEvidence(file: File | undefined) {
    if (!file) return;
    setHashing(true);
    setMessage(null);
    try {
      const digest = await sha256(file);
      setForm((current) => ({ ...current, evidenceSha256: digest }));
      setEvidenceTouched(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This file could not be hashed.");
    } finally {
      setHashing(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!form.firstPartyAttested) {
      setMessage("Please confirm that this is something you personally did, not a copied marketplace sighting.");
      return;
    }
    const permissionChanged = !editing || form.sharingMode !== editing.sharing_mode;
    if (permissionChanged && form.sharingMode === "cc0" && !form.cc0Acknowledged) {
      setMessage("CC0 sharing needs the separate public-domain acknowledgement.");
      return;
    }

    const key = submissionKey ?? crypto.randomUUID();
    const payload = buildWitnessPayload({
      sku,
      form,
      editing,
      submissionKey: key,
      evidenceTouched,
    });
    if (editing && Object.keys(payload).length === 1) {
      setMessage("Nothing changed.");
      return;
    }

    setBusy(true);
    try {
      if (!editing) setSubmissionKey(key);
      const response = await fetch(
        editing ? `/api/account/observations/${encodeURIComponent(editing.id)}` : "/api/account/observations",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await responseMessage(response));
      setFormOpen(false);
      setEditing(null);
      setSubmissionKey(null);
      setForm(emptyForm());
      setEvidenceTouched(false);
      setMessage(editing ? "Correction saved." : "Observation saved privately.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The observation could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(observation: CollectorObservation) {
    if (!window.confirm("Delete this observation permanently? It will no longer be eligible for any future projector.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/account/observations/${encodeURIComponent(observation.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response));
      setMessage("Observation deleted.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The observation could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="collector-witness" className="mt-8 scroll-mt-8" aria-labelledby="collector-witness-heading">
      <Card padding="lg" className="border-accent/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-wider text-accent">Collector Witnesses</p>
            <h2 id="collector-witness-heading" className="text-xl font-display font-semibold text-ink mt-1">Your private witness notebook</h2>
            <p className="text-sm text-ink-muted mt-2">
              Record a purchase, completed sale, or asking price you personally set. Private is the default.
              Cambridge never accepts receipt files, names, links, or notes here. Public projection is paused.
            </p>
          </div>
          {access === "ready" && !formOpen && <Button onClick={startNew}>Add an observation</Button>}
        </div>

        {message && (
          <p className={`mt-4 text-sm ${message.endsWith("saved.") || message.endsWith("deleted.") ? "text-ok" : "text-danger"}`} role="status">
            {message}
          </p>
        )}

        {access === "loading" && <p className="text-sm text-ink-faint mt-5">Opening your private notebook…</p>}

        {access === "signed-out" && (
          <div className="mt-5">
            <EmptyState
              title="Your notebook is private to your account"
              description="Sign in to record, correct, change sharing permission, or delete your own observations."
              action={<Link href={`/login?callbackUrl=${encodeURIComponent(`/product/${sku}#collector-witness`)}`} className="text-accent hover:text-accent-strong font-medium">Sign in &rarr;</Link>}
            />
          </div>
        )}

        {access === "not-ready" && (
          <div className="mt-5">
            <EmptyState
              title="The notebook is prepared, but not switched on"
              description="Its database migration has not been applied. No observation was accepted or lost."
              tone="warning"
            />
          </div>
        )}

        {access === "error" && (
          <div className="mt-5">
            <EmptyState title="The notebook could not be opened" description="The public card page still works; no private data was changed." tone="warning" action={<Button variant="secondary" onClick={() => { setAccess("loading"); void load(); }}>Try again</Button>} />
          </div>
        )}

        {access === "ready" && formOpen && (
          <form onSubmit={submit} className="mt-6 border-t border-border-subtle pt-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">{editing ? "Correct your observation" : "What did you personally witness?"}</h3>
              <Button variant="ghost" size="sm" onClick={closeForm} disabled={busy}>Close</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Kind" htmlFor="witness-kind">
                <Select id="witness-kind" value={form.observationKind} onChange={(event) => setForm({ ...form, observationKind: event.target.value as ObservationKind })}>
                  {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Date" htmlFor="witness-date" hint="Day only; no exact transaction time is collected.">
                <Input id="witness-date" type="date" max={localToday()} required value={form.observedOn} onChange={(event) => setForm({ ...form, observedOn: event.target.value })} />
              </Field>
              <Field label="Amount for one card" htmlFor="witness-amount">
                <Input id="witness-amount" inputMode="decimal" placeholder="12.50" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </Field>
              <Field label="Currency" htmlFor="witness-currency">
                <Select id="witness-currency" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
                  {['GBP', 'USD', 'EUR', 'JPY', 'HKD', 'CHF'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </Select>
              </Field>
              <Field label="Condition" htmlFor="witness-condition" hint="Leave unknown rather than guessing.">
                <Select id="witness-condition" value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>
                  <option value="">Unknown</option>
                  {['M', 'NM', 'LP', 'MP', 'HP', 'DMG'].map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                </Select>
              </Field>
              <Field label="Sharing permission" htmlFor="witness-sharing">
                <Select id="witness-sharing" value={form.sharingMode} onChange={(event) => {
                  const sharingMode = event.target.value as SharingMode;
                  setForm({ ...form, sharingMode, cc0Acknowledged: false });
                }}>
                  {Object.entries(SHARING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
            </div>

            <div className="rounded-lg bg-surface-subtle border border-border-subtle p-4 text-sm text-ink-muted">
              {form.sharingMode === "private" && "Only you can read this row. It never enters a public aggregate."}
              {form.sharingMode === "anonymous_aggregate" && "The raw row stays private. This records permission for a future delayed, closed, coarse projector; nothing is published now."}
              {form.sharingMode === "cc0" && "The raw row stays private. This records permission for a future privacy-reviewed projector and a possible CC0 dedication; nothing is published now."}
            </div>

            <Field label="Optional evidence commitment" htmlFor="witness-file" hint="Choose a receipt image or file. Your browser computes a SHA-256 fingerprint; the file never leaves this device.">
              <Input id="witness-file" type="file" disabled={hashing || busy} onChange={(event) => void chooseEvidence(event.target.files?.[0])} />
            </Field>
            {form.evidenceSha256 && (
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs font-medium text-ink-muted">SHA-256 commitment</p>
                <code className="block text-xs text-ink-faint break-all mt-1">{form.evidenceSha256}</code>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => {
                  setForm({ ...form, evidenceSha256: "" });
                  setEvidenceTouched(true);
                }}>Remove commitment</Button>
              </div>
            )}

            <label className="flex items-start gap-3 text-sm text-ink-muted">
              <input type="checkbox" className="mt-1" checked={form.firstPartyAttested} onChange={(event) => setForm({ ...form, firstPartyAttested: event.target.checked })} />
              <span>I confirm this describes something I personally bought, sold, or offered. It is not copied from another marketplace or person.</span>
            </label>

            {form.sharingMode === "cc0" && (
              <label className="flex items-start gap-3 text-sm text-ink-muted">
                <input type="checkbox" className="mt-1" checked={form.cc0Acknowledged} onChange={(event) => setForm({ ...form, cc0Acknowledged: event.target.checked })} />
                <span>I understand that nothing is published now. If a future privacy-reviewed projector releases a qualifying fact under CC0, deletion cannot recall copies already received by others.</span>
              </label>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy || hashing}>{busy ? "Saving…" : editing ? "Save correction" : "Save observation"}</Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}

        {access === "ready" && !formOpen && (
          <div className="mt-6">
            {observations.length === 0 ? (
              <EmptyState title="No observations for this card" description="Nothing is inferred from an empty notebook. Add one only if you want to." />
            ) : (
              <div className="space-y-3">
                {observations.map((observation) => (
                  <div key={observation.id} className="rounded-lg border border-border-subtle bg-surface-subtle p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{KIND_LABELS[observation.observation_kind]}</p>
                          <Badge status={observation.sharing_mode} label={SHARING_LABELS[observation.sharing_mode]} palette={{ private: "neutral", anonymous_aggregate: "purple", cc0: "emerald" }} />
                        </div>
                        <p className="text-sm text-ink-muted mt-1">
                          {observation.price_amount} {observation.price_currency} · {observation.condition ?? "condition unknown"} · {observation.observed_on.slice(0, 10)}
                        </p>
                        {observation.evidence_sha256 && <p className="text-xs text-ink-faint mt-1">Evidence committed · SHA-256 {observation.evidence_sha256.slice(0, 12)}…</p>}
                        <CollectorPermissionReceipt observation={observation} />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => startCorrection(observation)}>Correct</Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(observation)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
