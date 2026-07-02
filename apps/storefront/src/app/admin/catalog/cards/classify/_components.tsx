/**
 * Client components for the classify Manager page (kingdom-089).
 *
 * Three pieces:
 *   - <ClassifyForm>      — operator override form (select + reason textarea)
 *   - <RevokeButton>      — revoke an existing operator override
 *   - <SkuLookupForm>     — landing-page SKU search box
 *
 * All three use useTransition for action state and surface error messages
 * inline rather than via window.alert (the admin app's standard pattern
 * uses prompts for short flows, but this surface is rich enough to keep
 * everything on-page).
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  classifyCardAction,
  revokeClassificationAction,
  lookupCardBySkuAction,
} from "./_actions";
import type { ClassifiableAttribute } from "@cambridge-tcg/data-ingest";

export function ClassifyForm({
  sku,
  attribute,
  currentValue,
  vocab,
}: {
  sku: string;
  attribute: ClassifiableAttribute;
  currentValue: string | null;
  vocab: readonly string[];
}) {
  const [value, setValue] = useState<string>(currentValue ?? vocab[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!reason.trim()) {
          setError("Reason required.");
          return;
        }
        start(async () => {
          const result = await classifyCardAction({
            sku,
            attribute,
            value,
            reason,
          });
          if (!result.ok) {
            setError(result.error);
          } else {
            setReason("");
            setSuccess(
              result.data.applied
                ? "Override saved and promoted to cards."
                : "Claim recorded as shadowed (lower priority than current winner).",
            );
          }
        });
      }}
      className="space-y-3 rounded-md border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${attribute}-value`}
          className="text-xs uppercase tracking-wider text-ink-muted"
        >
          Set {attribute.replace("_", " ")} to
        </label>
        <select
          id={`${attribute}-value`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          className="rounded-md border border-border-strong bg-page px-3 py-2 text-sm text-ink"
        >
          {vocab.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${attribute}-reason`}
          className="text-xs uppercase tracking-wider text-ink-muted"
        >
          Reason for override
        </label>
        <textarea
          id={`${attribute}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          rows={2}
          placeholder="e.g. Confirmed alt-art print from Bandai event listing 2026-03"
          className="rounded-md border border-border-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-neutral-600"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save operator override"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-secondary">{success}</p>}
      </div>
    </form>
  );
}

export function RevokeButton({
  sku,
  attribute,
}: {
  sku: string;
  attribute: ClassifiableAttribute;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => {
        const reason = window.prompt(
          `Reason for revoking the operator override on ${attribute}?`,
        );
        if (!reason) return;
        start(async () => {
          const result = await revokeClassificationAction({
            sku,
            attribute,
            reason,
          });
          if (!result.ok) {
            window.alert(`Revoke failed: ${result.error}`);
          }
        });
      }}
      disabled={pending}
      className="rounded-md border border-amber-700 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-accent-strong hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Revoking…" : "Revert operator override"}
    </button>
  );
}

export function SkuLookupForm() {
  const router = useRouter();
  const [sku, setSku] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await lookupCardBySkuAction({ sku });
          if (!result.ok) {
            setError(result.error);
          } else {
            router.push(
              `/admin/catalog/cards/classify/${encodeURIComponent(result.sku)}`,
            );
          }
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface p-4 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1">
        <label
          htmlFor="sku-lookup"
          className="text-xs uppercase tracking-wider text-ink-muted"
        >
          Card SKU
        </label>
        <input
          id="sku-lookup"
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          disabled={pending}
          placeholder="op-op01-001-ja"
          className="rounded-md border border-border-strong bg-page px-3 py-2 text-sm text-ink placeholder:text-neutral-600"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending || !sku.trim()}
        className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
      >
        {pending ? "Looking up…" : "Open classify"}
      </button>
    </form>
  );
}
