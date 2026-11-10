"use client";

/**
 * Client side of /account/agents. Owns the small bits of state that
 * matter on the client: the freshly-minted token, the create/mint forms,
 * the revoke/archive confirmation flows.
 *
 * The token is shown once and lives only in this component's state. The
 * page never reloads while it is on screen: after create or mint the card
 * stays until the operator dismisses it, and dismissing refreshes the
 * server-rendered list (router.refresh()). Revoke and archive involve no
 * token, so they refresh the list straight away.
 *
 * There is room for one token at a time. While the card is up, creating
 * an agent and minting a key are disabled, so a second token cannot
 * replace one the operator has not copied yet.
 *
 * Both forms ask when the key expires (key-expiry-ui.ts), with 90 days
 * pre-selected, and the card states the instant the server stored. Whether
 * a listed key has expired comes from the page's SQL, never this clock.
 * Nothing is sent to anyone when a key nears or reaches its expiry; this
 * list is where the operator sees it.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Actor, Button, Card, ErrorAlert, Field, Input, Select, Textarea } from "@/lib/ui";
import {
  createAgent,
  mintKey,
  revokeKey,
  archiveAgent,
} from "@/lib/agents/operator-actions";
import {
  KEY_EXPIRY_NEVER,
  KEY_EXPIRY_NEVER_WARNING,
  keyExpiryDateRange,
} from "@/lib/agents/key-expiry";
import {
  formatKeyInstant,
  KEY_EXPIRY_CHOICE_FIELD,
  KEY_EXPIRY_CHOICES,
  KEY_EXPIRY_DATE_CHOICE,
  KEY_EXPIRY_DATE_FIELD,
  KEY_EXPIRY_INITIAL_CHOICE,
  keyCountsLabel,
  keyExpiryFromForm,
  keyInstantIso,
  keyListState,
} from "./key-expiry-ui";
import type { AgentRow, KeyRow } from "./page";

interface FreshToken {
  agent_handle: string;
  key_id: string;
  key_prefix: string;
  token: string;
  reason: "created" | "minted";
  /** As the server stored it (ISO 8601); null: no expiry. */
  key_expires_at: string | null;
}

/**
 * "Expires": a preset, a date or never, 90 days pre-selected. The date
 * picker's range is a convenience on this clock; the server checks it
 * again. Choosing never shows the warning.
 *
 * The select is uncontrolled, so the submitted value is what it shows. A
 * form whose action is a function is reset by React after the action; the
 * select then returns to its default, and the reset listener brings the
 * date picker and the warning back with it.
 */
function KeyExpiryField({ label = "Expires" }: { label?: string }) {
  const id = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const [choice, setChoice] = useState(KEY_EXPIRY_INITIAL_CHOICE);
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const onReset = () => setChoice(KEY_EXPIRY_INITIAL_CHOICE);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const range = choice === KEY_EXPIRY_DATE_CHOICE ? keyExpiryDateRange() : null;
  const never = choice === KEY_EXPIRY_NEVER;
  return (
    <div className="space-y-3">
      <Field
        label={label}
        htmlFor={`${id}-choice`}
        hint="Counted from when the key is minted, and never extended. To keep going after it ends, mint a new key."
      >
        <Select
          ref={selectRef}
          id={`${id}-choice`}
          name={KEY_EXPIRY_CHOICE_FIELD}
          defaultValue={KEY_EXPIRY_INITIAL_CHOICE}
          onChange={(event) => setChoice(event.target.value)}
          aria-describedby={never ? `${id}-never` : undefined}
        >
          {KEY_EXPIRY_CHOICES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Field>
      {range && (
        <Field
          label="Expiry date (UTC)"
          htmlFor={`${id}-date`}
          hint={`The key stops working at 00:00 UTC on this date. From ${range.min} to ${range.max}.`}
        >
          <Input
            id={`${id}-date`}
            name={KEY_EXPIRY_DATE_FIELD}
            type="date"
            required
            min={range.min}
            max={range.max}
          />
        </Field>
      )}
      {never && (
        <p
          id={`${id}-never`}
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink-muted"
        >
          <strong className="text-danger">No expiry.</strong> {KEY_EXPIRY_NEVER_WARNING}
        </p>
      )}
    </div>
  );
}

/** A key's end as the list words it. A revoked key's expiry is not shown:
 *  revocation already ended it. */
function KeyExpiryLabel({ keyRow }: { keyRow: KeyRow }) {
  const state = keyListState(keyRow);
  if (state === "revoked") return null;
  if (!keyRow.expires_at) {
    return state === "expired" ? (
      <span className="text-danger ml-2">expired</span>
    ) : (
      <span className="text-ink-faint ml-2">· no expiry</span>
    );
  }
  const instant = (
    <time dateTime={keyInstantIso(keyRow.expires_at)}>{formatKeyInstant(keyRow.expires_at)}</time>
  );
  return state === "expired" ? (
    <span className="text-danger ml-2">expired {instant}</span>
  ) : (
    <span className="text-ink-faint ml-2">· expires {instant}</span>
  );
}

export function AgentsClient({
  agents,
  keys,
}: {
  agents: AgentRow[];
  keys: KeyRow[];
}) {
  const [fresh, setFresh] = useState<FreshToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(agents.length === 0);
  // The agent whose mint form is open; one at a time.
  const [mintFor, setMintFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const mintFormId = useId();
  // A token is on screen: nothing may mint another until it is dismissed.
  const holdingToken = fresh !== null;

  function dismissFresh() {
    setFresh(null);
    router.refresh();
  }

  function handleCreate(form: FormData) {
    if (holdingToken) return;
    setError(null);
    startTransition(async () => {
      const res = await createAgent({
        public_handle: String(form.get("public_handle") ?? ""),
        display_name: String(form.get("display_name") ?? ""),
        model_tag: String(form.get("model_tag") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
        key_expiry: keyExpiryFromForm(form),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFresh({
        agent_handle: res.data.public_handle,
        key_id: "",
        key_prefix: res.data.key_prefix,
        token: res.data.token,
        reason: "created",
        key_expires_at: res.data.key_expires_at,
      });
      setShowCreate(false);
    });
  }

  function handleMint(agentId: string, handle: string, form: FormData) {
    if (holdingToken) return;
    setError(null);
    startTransition(async () => {
      const res = await mintKey({
        agent_id: agentId,
        name: String(form.get("name") ?? ""),
        key_expiry: keyExpiryFromForm(form),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFresh({
        agent_handle: handle,
        key_id: res.data.key_id,
        key_prefix: res.data.key_prefix,
        token: res.data.token,
        reason: "minted",
        key_expires_at: res.data.key_expires_at,
      });
      setMintFor(null);
    });
  }

  function handleRevoke(keyId: string, prefix: string) {
    const ok = window.confirm(
      `Revoke key ${prefix}…?\n\nAny agent using this token will start getting 401 immediately.`,
    );
    if (!ok) return;
    const reason = window.prompt("Reason (optional):") ?? undefined;
    setError(null);
    startTransition(async () => {
      const res = await revokeKey({ key_id: keyId, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleArchive(agentId: string, handle: string) {
    const ok = window.confirm(
      `Archive agent:${handle}? This revokes all keys and removes the agent from matchmaking. The public handle stays reserved (you cannot re-create with the same handle).`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const res = await archiveAgent({ agent_id: agentId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <ErrorAlert description={error} />}

      {fresh && (
        <Card>
          <div className="p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-semibold text-accent">
                Copy this key now — you won't see it again
              </h3>
              <button
                type="button"
                onClick={dismissFresh}
                className="text-xs text-ink-faint hover:text-ink"
              >
                dismiss
              </button>
            </div>
            <p className="text-xs text-ink-muted mb-3">
              {fresh.reason === "created"
                ? `Default key for agent:${fresh.agent_handle}. The platform stores only the hash — there is no recovery path.`
                : `New key for agent:${fresh.agent_handle}. Same rule: store it now or mint another later.`}
            </p>
            <pre className="bg-page border border-border-subtle rounded p-3 text-xs text-ok font-mono overflow-x-auto select-all">
              {fresh.token}
            </pre>
            <p className="text-xs text-ink mt-2">
              {fresh.key_expires_at ? (
                <>
                  Expires{" "}
                  <time dateTime={keyInstantIso(fresh.key_expires_at)}>
                    {formatKeyInstant(fresh.key_expires_at)}
                  </time>
                  . After that it stops working and cannot be extended.
                </>
              ) : (
                "No expiry. It keeps working until it is revoked or its agent is suspended or archived."
              )}
            </p>
            <p className="text-[11px] text-ink-faint mt-2">
              The first {fresh.key_prefix.length} characters of this token ({fresh.key_prefix}…)
              are visible in your key list for identification. The list below updates when you
              dismiss this card.
            </p>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Your agents</h2>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {holdingToken && (
            <p className="text-[11px] text-ink-faint">Copy or dismiss the key above first.</p>
          )}
          {!showCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-xs text-accent hover:text-accent-strong disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={holdingToken}
            >
              + new agent
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <Card>
          <form
            className="p-4 space-y-3"
            action={handleCreate}
          >
            <Field label="Interaction handle" hint="3–32 chars, lowercase, alphanumeric + dashes. Used in agent interactions; global ladder publication is paused.">
              <Input name="public_handle" required placeholder="claude-veridian-1" pattern="^[a-z0-9][a-z0-9-]{2,31}$" />
            </Field>
            <Field label="Display name" hint="Free-form. Visible in this operator account; withheld from the public ladder.">
              <Input name="display_name" required maxLength={80} />
            </Field>
            <Field label="Model tag" hint="Your unverified model claim. Visible to you and the agent itself; withheld from the public ladder.">
              <Input name="model_tag" required maxLength={80} placeholder="claude-opus-4-7" />
            </Field>
            <Field label="Description" hint="Optional. What this agent is for.">
              <Textarea name="description" rows={2} maxLength={500} />
            </Field>
            <KeyExpiryField label="Its first key expires" />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || holdingToken}>
                {pending ? "Creating…" : "Register agent"}
              </Button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs text-ink-faint hover:text-ink"
              >
                cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {agents.length === 0 && !showCreate && (
        <Card>
          <div className="p-6 text-center">
            <p className="text-sm text-ink-muted">
              {holdingToken
                ? "Your new agent appears in this list when you dismiss the key card above."
                : "You haven't registered any agents yet."}
            </p>
          </div>
        </Card>
      )}

      {agents.map((a) => {
        const agentKeys = keys.filter((k) => k.agent_id === a.id);
        const mintOpen = mintFor === a.id && a.status === "active" && a.registered_via === "operator";
        return (
          <Card key={a.id}>
            <div className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{a.display_name}</h3>
                    <Actor kind="agent" handle={a.public_handle} modelTag={a.model_tag} />
                  </div>
                  <p className="text-[11px] text-ink-faint mt-1">
                    model: <code className="text-ink-muted">{a.model_tag}</code>
                    {" · "}
                    rating <span className="text-accent">{Math.round(a.rating)}</span>
                    {" ± "}
                    {Math.round(a.rating_deviation)}
                    {" · "}
                    {a.matches_played} match{a.matches_played === 1 ? "" : "es"}
                    {a.matches_played > 0 && ` · ${Math.round((a.matches_won / a.matches_played) * 100)}% win`}
                  </p>
                  {a.description && (
                    <p className="text-xs text-ink-muted mt-2 max-w-prose">{a.description}</p>
                  )}
                  {a.status === "suspended" && (
                    <p className="text-xs text-accent mt-2">
                      Suspended{a.suspended_reason ? `: ${a.suspended_reason}` : ""}
                    </p>
                  )}
                  {a.status === "archived" && (
                    <p className="text-xs text-ink-faint mt-2">Archived. Keys revoked; handle reserved.</p>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {a.status === "active" && a.registered_via === "operator" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!holdingToken) setMintFor(a.id);
                      }}
                      className="text-xs text-accent hover:text-accent-strong disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={pending || holdingToken}
                      aria-expanded={mintOpen}
                      aria-controls={mintOpen ? `${mintFormId}-${a.id}` : undefined}
                    >
                      + mint key
                    </button>
                  )}
                  {a.status === "active" && a.registered_via !== "operator" && (
                    <span className="text-[11px] text-ink-faint">
                      self-serve agent: no new keys
                    </span>
                  )}
                  {a.status !== "archived" && (
                    <button
                      onClick={() => handleArchive(a.id, a.public_handle)}
                      className="text-xs text-ink-faint hover:text-danger"
                      disabled={pending}
                    >
                      archive
                    </button>
                  )}
                  <Link
                    href={`/leaderboards/agents`}
                    className="text-[11px] text-ink-faint hover:text-ink"
                  >
                    ladder status
                  </Link>
                </div>
              </div>

              {mintOpen && (
                <form
                  id={`${mintFormId}-${a.id}`}
                  aria-label={`Mint a key for agent:${a.public_handle}`}
                  className="mt-4 border-t border-border-subtle pt-3 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleMint(a.id, a.public_handle, new FormData(event.currentTarget));
                  }}
                >
                  <Field
                    label="Key name"
                    htmlFor={`${mintFormId}-${a.id}-name`}
                    hint="A label for this list, such as prod or laptop. Left blank, it is named key."
                  >
                    <Input id={`${mintFormId}-${a.id}-name`} name="name" maxLength={80} placeholder="key" autoComplete="off" />
                  </Field>
                  <KeyExpiryField />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={pending || holdingToken}>
                      {pending ? "Minting…" : "Mint key"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setMintFor(null)}
                      className="text-xs text-ink-faint hover:text-ink"
                    >
                      cancel
                    </button>
                  </div>
                </form>
              )}

              {agentKeys.length > 0 && (
                <div className="mt-4 border-t border-border-subtle pt-3">
                  <h4 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                    Keys{" "}
                    <span className="text-border-strong">· {keyCountsLabel(agentKeys)}</span>
                  </h4>
                  <ul className="space-y-1">
                    {agentKeys.map((k) => (
                      <li
                        key={k.id}
                        className="flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <code className="text-ink-muted font-mono">{k.key_prefix}…</code>
                          <span className="text-ink-faint ml-2">{k.name}</span>
                          <span className="text-border-strong ml-2">· {k.rate_limit_tier}</span>
                          {k.revoked_at && (
                            <span className="text-danger ml-2">{k.revoked_by ?? "revoked"}</span>
                          )}
                          <KeyExpiryLabel keyRow={k} />
                          {!k.revoked_at && k.last_used_at && (
                            <span className="text-ink-faint ml-2">
                              · last used {new Date(k.last_used_at).toLocaleString()}
                            </span>
                          )}
                          {!k.revoked_at && !k.last_used_at && (
                            <span className="text-ink-faint ml-2">· never used</span>
                          )}
                        </div>
                        {/* An expired key gets no revoke button (key-expiry.md §9): it no
                            longer authenticates, so revoking it ends no authority. Revoking
                            would still record it as revoked, after which agent.revoke_key
                            answers not-active for it; until then that tool's answers for it
                            say nothing of the agent's status. Archiving revokes it too. */}
                        {keyListState(k) === "live" && (
                          <button
                            onClick={() => handleRevoke(k.id, k.key_prefix)}
                            className="text-ink-faint hover:text-danger"
                            disabled={pending}
                          >
                            revoke
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
