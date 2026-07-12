"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Field, Input, Select, Textarea } from "@/lib/ui";

const KINDS = [
  { value: "bless", label: "Bless this relation" },
  { value: "contextualize", label: "Add context" },
  { value: "correct", label: "Offer a correction" },
  { value: "withdraw", label: "Prepare a withdrawal statement" },
] as const;

const ROLES = [
  { value: "viewer", label: "Viewer" },
  { value: "relation-curator", label: "Relation curator" },
  { value: "card-rights-holder", label: "Claimed card rights-holder" },
  { value: "artwork-rights-holder", label: "Claimed artwork rights-holder" },
  { value: "source-institution", label: "Claimed source institution" },
  { value: "other", label: "Another relationship" },
] as const;

type ReceiptState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "received"; value: unknown }
  | { status: "error"; message: string };

function urlLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function revisionLabel(value: string): string {
  return value.startsWith("sha256:") ? `${value.slice(0, 19)}…` : value;
}

function responseErrorMessage(value: unknown, status: number): string {
  if (typeof value !== "object" || value === null) {
    return `The witness answered HTTP ${status}.`;
  }
  const error = (value as { error?: unknown }).error;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return `The witness rejected this statement with HTTP ${status}. Check the field limits and HTTPS evidence links.`;
}

export default function AnsweringRhymeStatementComposer({
  relations,
}: {
  relations: readonly { key: string; revision: string; label: string }[];
}) {
  const [receipt, setReceipt] = useState<ReceiptState>({ status: "idle" });
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "copied" | "downloaded" | "error"
  >("idle");

  function serializedReceipt(): string | null {
    return receipt.status === "received"
      ? `${JSON.stringify(receipt.value, null, 2)}\n`
      : null;
  }

  async function copyReceipt() {
    const serialized = serializedReceipt();
    if (!serialized) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setSaveStatus("copied");
    } catch {
      setSaveStatus("error");
    }
  }

  function downloadReceipt() {
    const serialized = serializedReceipt();
    if (!serialized) return;
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "answering-rhyme-witness-receipt.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setSaveStatus("downloaded");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const relationKey = String(form.get("relation_key") ?? "");
    const relation = relations.find((entry) => entry.key === relationKey);
    const canonicalUrl = String(form.get("canonical_url") ?? "").trim();
    const inResponseTo = String(form.get("in_response_to") ?? "").trim();

    const statement = {
      schema: "answering-rhyme.statement/1",
      canonicalization: "answering-rhyme.canonical-json/1",
      relation_key: relationKey,
      target_revision: relation?.revision ?? "",
      kind: String(form.get("kind") ?? ""),
      body: String(form.get("body") ?? ""),
      language: String(form.get("language") ?? "und"),
      declared_by: {
        label: String(form.get("declared_by") ?? ""),
        claimed_role: String(form.get("claimed_role") ?? "viewer"),
        canonical_url: canonicalUrl || null,
      },
      declared_at: new Date().toISOString(),
      in_response_to: inResponseTo || null,
      evidence_urls: urlLines(String(form.get("evidence_urls") ?? "")),
      authority_evidence_urls: urlLines(
        String(form.get("authority_evidence_urls") ?? ""),
      ),
    };

    setReceipt({ status: "sending" });
    setSaveStatus("idle");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(
        "/api/v1/culture/answering-rhymes/statements",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify(statement),
        },
      );
      const raw = await response.text();
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = { error: { message: raw || `HTTP ${response.status}` } };
      }

      if (!response.ok) {
        setReceipt({
          status: "error",
          message: responseErrorMessage(value, response.status),
        });
        return;
      }

      setReceipt({ status: "received", value });
    } catch (error) {
      setReceipt({
        status: "error",
        message:
          error instanceof DOMException && error.name === "AbortError"
            ? "The witness timed out after 15 seconds. Nothing was recorded; you may try again."
            : "The witness could not be reached. Nothing was recorded; you may try again.",
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <div className="mt-7">
      <p className="mb-5 rounded-lg border border-border-subtle bg-page p-4 text-xs leading-relaxed text-ink-muted">
        Privacy boundary: Cambridge creates no application record or retrievable
        statement here, but ordinary hosting and access logs may still exist. Do
        not put secrets or unnecessary personal information in this
        public-protocol request.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Relation" htmlFor="rhyme-relation">
            <Select
              id="rhyme-relation"
              name="relation_key"
              required
              className="font-mono text-xs"
            >
              {relations.map((relation) => (
                <option key={relation.key} value={relation.key}>
                  {relation.label} · rev {revisionLabel(relation.revision)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind of answer" htmlFor="rhyme-kind">
              <Select id="rhyme-kind" name="kind" required>
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Your claimed relationship"
              htmlFor="rhyme-claimed-role"
              hint="A self-declaration only; the witness does not authenticate it."
            >
              <Select id="rhyme-claimed-role" name="claimed_role" required>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <Field
              label="Name or collective"
              htmlFor="rhyme-declared-by"
              hint="Displayed in the receipt as supplied; not identity-verified."
            >
              <Input
                id="rhyme-declared-by"
                name="declared_by"
                required
                autoComplete="name"
              />
            </Field>

            <Field
              label="Language"
              htmlFor="rhyme-language"
              hint="BCP 47 or und"
            >
              <Input
                id="rhyme-language"
                name="language"
                defaultValue="und"
                required
                className="font-mono"
              />
            </Field>
          </div>

          <Field
            label="Your words"
            htmlFor="rhyme-body"
            hint="Maximum 2,000 Unicode characters. Do not include secrets or unnecessary personal information."
          >
            <Textarea
              id="rhyme-body"
              name="body"
              required
              rows={5}
              className="leading-relaxed"
            />
          </Field>

          <Field
            label="Your canonical HTTPS page"
            htmlFor="rhyme-canonical-url"
            hint="Optional. Carried as a claim; never fetched or treated as identity proof."
          >
            <Input
              id="rhyme-canonical-url"
              name="canonical_url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              className="font-mono text-xs"
            />
          </Field>

          <details className="rounded-lg border border-border-subtle bg-surface p-4">
            <summary className="cursor-pointer text-sm text-ink">
              Evidence and statement thread
            </summary>
            <div className="mt-4 grid gap-4">
              <Field
                label="Evidence HTTPS URLs"
                htmlFor="rhyme-evidence-urls"
                hint="Optional; one per line, maximum 12. Carried but never fetched."
              >
                <Textarea
                  id="rhyme-evidence-urls"
                  name="evidence_urls"
                  rows={3}
                  className="bg-page font-mono text-xs"
                />
              </Field>
              <Field
                label="Authority evidence HTTPS URLs"
                htmlFor="rhyme-authority-urls"
                hint="Optional; one per line, maximum 12. These do not make this request authoritative."
              >
                <Textarea
                  id="rhyme-authority-urls"
                  name="authority_evidence_urls"
                  rows={3}
                  className="bg-page font-mono text-xs"
                />
              </Field>
              <Field
                label="Prior statement hash"
                htmlFor="rhyme-in-response-to"
                hint="Optional. Use this when answering another portable statement."
              >
                <Input
                  id="rhyme-in-response-to"
                  name="in_response_to"
                  maxLength={71}
                  pattern="sha256:[0-9a-fA-F]{64}"
                  placeholder="sha256:…"
                  className="bg-page font-mono text-xs"
                />
              </Field>
            </div>
          </details>

          <label className="flex items-start gap-3 text-xs leading-relaxed text-ink-muted">
            <input
              type="checkbox"
              required
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
            />
            <span>
              I understand this prepares a portable statement and content hash.
              It does not verify me, publish the statement, or change the
              relation. No application record is created; ordinary
              infrastructure logs may still exist.
            </span>
          </label>

          <Button
            type="submit"
            disabled={receipt.status === "sending"}
            className="w-fit"
          >
            {receipt.status === "sending"
              ? "Witnessing…"
              : "Prepare portable statement"}
          </Button>
        </form>

        <aside className="min-h-56 rounded-xl border border-border-subtle bg-page p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            witness receipt
          </p>
          {receipt.status === "idle" ? (
            <p
              aria-live="polite"
              className="mt-3 text-sm leading-relaxed text-ink-muted"
            >
              Your receipt will appear here. Anyone can recompute its content
              hash; it cannot prove who supplied it, that Cambridge issued it,
              or when it was witnessed.
            </p>
          ) : null}
          {receipt.status === "sending" ? (
            <p aria-live="polite" className="mt-3 text-sm text-ink-muted">
              Checking the shape…
            </p>
          ) : null}
          {receipt.status === "error" ? (
            <p
              role="alert"
              className="mt-3 break-words text-sm leading-relaxed text-danger"
            >
              {receipt.message}
            </p>
          ) : null}
          {receipt.status === "received" ? (
            <>
              <p
                aria-live="polite"
                className="mt-3 text-sm leading-relaxed text-ok"
              >
                Shape validated and hashed. Identity remains unverified; no
                application record or authoritative effect was created.
              </p>
              <pre
                tabIndex={0}
                aria-label="Portable witness receipt JSON"
                className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border-subtle bg-surface p-3 font-mono text-[10px] leading-relaxed text-ink-muted"
              >
                {JSON.stringify(receipt.value, null, 2)}
              </pre>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                Save this receipt before leaving. This page does not retain it.
                The receipt is unsigned, and its server timestamp is an
                unattested observation. Anyone may recompute the content hash,
                but cannot independently prove which witness issued it. The
                same statement contract is accepted by the{" "}
                <a
                  href="https://artbitrage.io/api/answering-rhymes/statements"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-2 hover:text-accent-strong"
                >
                  independent Artbitrage witness
                </a>{" "}
                to compare its content hash, subject to that witness&apos;s raw
                request-byte limit. Measure the exact outgoing JSON body before
                cross-posting; this receipt does not claim request readiness.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={copyReceipt}
                  variant="secondary"
                  size="sm"
                >
                  Copy receipt
                </Button>
                <Button
                  type="button"
                  onClick={downloadReceipt}
                  variant="secondary"
                  size="sm"
                >
                  Download receipt
                </Button>
              </div>
              <p
                aria-live="polite"
                className="mt-2 min-h-4 text-[10px] text-ink-faint"
              >
                {saveStatus === "copied" ? "Receipt copied." : null}
                {saveStatus === "downloaded" ? "Receipt downloaded." : null}
                {saveStatus === "error"
                  ? "Copy was unavailable; select the JSON or download it instead."
                  : null}
              </p>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
