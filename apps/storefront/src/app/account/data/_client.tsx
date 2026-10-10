"use client";

import { useState } from "react";
import type { MemberKeySummary } from "@/lib/datafeed/member-keys";
import { Button, Card, ErrorAlert, Field, Input } from "@/lib/ui";

export function MemberDataClient({ initialKeys }: { initialKeys: MemberKeySummary[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<{ token: string; keyId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function mint(event: React.FormEvent) {
    event.preventDefault();
    if (pending || secret) return;
    setPending(true); setError(null); setNotice("");
    try {
      const response = await fetch("/api/account/data/keys", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Key creation failed.");
      setSecret({ token: body.token, keyId: body.key.id });
      setKeys(current => [body.key, ...current].slice(0, 100));
      setName(""); setNotice("Key created. Save it now; it cannot be recovered.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Key creation failed. Refresh the list before trying again."); }
    finally { setPending(false); }
  }

  async function revoke(keyId: string) {
    if (pending) return;
    setPending(true); setError(null); setNotice("");
    try {
      const response = await fetch("/api/account/data/keys", { method: "DELETE", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyId }) });
      const body = await response.json();
      if (!response.ok || body.revoked !== true) throw new Error(body.error ?? "Revocation was not confirmed.");
      // No optimistic revocation: disable permanently only after server confirmation.
      setKeys(current => current.map(key => key.id === keyId ? { ...key, revokedAt: new Date().toISOString() } : key));
      if (secret?.keyId === keyId) setSecret(null);
      setConfirmId(null); setNotice("Key revoked. New requests using it will be refused.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Revocation was not confirmed. Please try again."); }
    finally { setPending(false); }
  }

  async function copySecret() {
    if (!secret) return;
    try { await navigator.clipboard.writeText(secret.token); setNotice("Key copied. Keep it private."); }
    catch { setError("Clipboard access failed. Select and copy the key manually."); }
  }

  return <div className="space-y-5">
    <p className="text-sm text-ink-muted">Read-only <code>price-read</code> scope; 90-day expiry; up to five active keys. Each key allows 30 requests per minute, with no paid quota. We store only a hash, a short identifying prefix, and key-management details. Rate protection keeps minute counts, not a history of what you read; old buckets are pruned in bounded batches during valid requests, not by a scheduler.</p>
    {error && <ErrorAlert description={error} />}
    <p role="status" className="text-sm text-ink-muted">{notice}</p>
    {secret && <Card>
      <h2 className="font-display text-lg text-ink">Save this key once</h2>
      <p className="my-2 text-sm text-ink-muted">It is shown only here, held in this page&apos;s memory. Dismissing or leaving loses this copy. We cannot recover it.</p>
      <Field label="New member key" htmlFor="new-member-secret">
        <Input id="new-member-secret" readOnly value={secret.token} autoComplete="off" spellCheck={false} className="font-mono" />
      </Field>
      <div className="mt-3 flex gap-3">
        <Button variant="secondary" onClick={copySecret}>Copy key</Button>
        <Button variant="ghost" onClick={() => { setSecret(null); setNotice("Secret dismissed."); }}>I saved it — dismiss</Button>
      </div>
    </Card>}
    <form onSubmit={mint} className="space-y-3">
      <Field label="Key name" htmlFor="member-key-name" hint="A private label such as My spreadsheet. Do not put sensitive information here.">
        <Input id="member-key-name" value={name} onChange={event => setName(event.target.value)} required maxLength={80} disabled={pending || !!secret} autoComplete="off" />
      </Field>
      <Button type="submit" disabled={pending || !!secret || !name.trim()}>Create read-only key</Button>
    </form>
    <section aria-labelledby="your-member-keys" className="space-y-3">
      <h2 id="your-member-keys" className="font-display text-xl text-ink">Your keys</h2>
      <p className="text-xs text-ink-faint">Active keys first, followed by recent history; at most 100 keys shown. Revoke a lost key and create another. Revocation cannot recall a response already in flight.</p>
      {!keys.length && <p className="text-sm text-ink-muted">No keys yet. Browser downloads use your existing session and need no key.</p>}
      {keys.map(key => <Card key={key.id}>
        <h3 className="text-sm font-semibold text-ink">{key.name}</h3>
        <p className="text-xs font-mono text-ink-muted mt-1">{key.keyPrefix}… · {key.scope}</p>
        <p className="text-xs text-ink-muted my-2">Expires {new Date(key.expiresAt).toISOString().slice(0, 10)} UTC · {key.revokedAt ? "Revoked" : "Not revoked (valid only before expiry)"}</p>
        {confirmId === key.id ? <div className="space-y-2">
          <p className="text-sm text-ink-muted">Revoke this key? Scripts using it will need a replacement.</p>
          <div className="flex gap-3">
            <Button variant="danger" size="sm" disabled={pending} onClick={() => revoke(key.id)}>Confirm revoke</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmId(null)}>Cancel</Button>
          </div>
        </div> : <Button variant="secondary" size="sm" disabled={pending || !!key.revokedAt} onClick={() => setConfirmId(key.id)}>{key.revokedAt ? "Revoked" : "Revoke key"}</Button>}
      </Card>)}
    </section>
  </div>;
}
