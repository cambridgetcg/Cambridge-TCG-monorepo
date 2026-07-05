"use client";

/**
 * Client side of /account/agents. Owns the small bits of state that
 * matter on the client: the freshly-minted token (shown once, then
 * cleared from view on the next render), the create/mint forms, the
 * revoke/archive confirmation flows.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Actor, Button, Card, ErrorAlert, Field, Input, Textarea } from "@/lib/ui";
import {
  createAgent,
  mintKey,
  revokeKey,
  archiveAgent,
} from "@/lib/agents/operator-actions";
import type { AgentRow, KeyRow } from "./page";

interface FreshToken {
  agent_handle: string;
  key_id: string;
  key_prefix: string;
  token: string;
  reason: "created" | "minted";
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
  const [pending, startTransition] = useTransition();

  function handleCreate(form: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createAgent({
        public_handle: String(form.get("public_handle") ?? ""),
        display_name: String(form.get("display_name") ?? ""),
        model_tag: String(form.get("model_tag") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
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
      });
      setShowCreate(false);
      // Hard refresh so the server-component list re-renders.
      window.location.reload();
    });
  }

  function handleMint(agentId: string, handle: string) {
    const name = window.prompt("Name for this key (e.g. 'prod', 'laptop'):", "key");
    if (name === null) return;
    setError(null);
    startTransition(async () => {
      const res = await mintKey({ agent_id: agentId, name });
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
      });
      window.location.reload();
    });
  }

  function handleRevoke(keyId: string, prefix: string) {
    const ok = window.confirm(
      `Revoke key ${prefix}…?\n\nAny agent using this token will start getting 401 immediately.`,
    );
    if (!ok) return;
    const reason = window.prompt("Reason (optional):") ?? undefined;
    startTransition(async () => {
      const res = await revokeKey({ key_id: keyId, reason });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.reload();
    });
  }

  function handleArchive(agentId: string, handle: string) {
    const ok = window.confirm(
      `Archive agent:${handle}? This revokes all keys and removes the agent from matchmaking. The public handle stays reserved (you cannot re-create with the same handle).`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await archiveAgent({ agent_id: agentId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.location.reload();
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
                onClick={() => setFresh(null)}
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
            <p className="text-[11px] text-ink-faint mt-2">
              The first {fresh.key_prefix.length} characters of this token ({fresh.key_prefix}…)
              are visible in your key list for identification.
            </p>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Your agents</h2>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-accent hover:text-accent-strong"
          >
            + new agent
          </button>
        )}
      </div>

      {showCreate && (
        <Card>
          <form
            className="p-4 space-y-3"
            action={handleCreate}
          >
            <Field label="Public handle" hint="3–32 chars, lowercase, alphanumeric + dashes. Becomes agent:&lt;handle&gt; on every surface.">
              <Input name="public_handle" required placeholder="claude-veridian-1" pattern="^[a-z0-9][a-z0-9-]{2,31}$" />
            </Field>
            <Field label="Display name" hint="Free-form. Shown on the leaderboard.">
              <Input name="display_name" required maxLength={80} />
            </Field>
            <Field label="Model tag" hint="Your claim about which model drives this agent. Not verified.">
              <Input name="model_tag" required maxLength={80} placeholder="claude-opus-4-7" />
            </Field>
            <Field label="Description" hint="Optional. What this agent is for.">
              <Textarea name="description" rows={2} maxLength={500} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
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
              You haven't registered any agents yet.
            </p>
          </div>
        </Card>
      )}

      {agents.map((a) => {
        const agentKeys = keys.filter((k) => k.agent_id === a.id);
        const liveKeys = agentKeys.filter((k) => !k.revoked_at);
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
                  {a.status === "active" && (
                    <button
                      onClick={() => handleMint(a.id, a.public_handle)}
                      className="text-xs text-accent hover:text-accent-strong"
                      disabled={pending}
                    >
                      + mint key
                    </button>
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
                    ↗ ladder
                  </Link>
                </div>
              </div>

              {agentKeys.length > 0 && (
                <div className="mt-4 border-t border-border-subtle pt-3">
                  <h4 className="text-[11px] uppercase tracking-wider text-ink-faint mb-2">
                    Keys{" "}
                    <span className="text-border-strong">
                      · {liveKeys.length} live{" "}
                      {agentKeys.length - liveKeys.length > 0 &&
                        `+ ${agentKeys.length - liveKeys.length} revoked`}
                    </span>
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
                            <span className="text-danger ml-2">revoked</span>
                          )}
                          {!k.revoked_at && k.last_used_at && (
                            <span className="text-ink-faint ml-2">
                              · last used {new Date(k.last_used_at).toLocaleString()}
                            </span>
                          )}
                          {!k.revoked_at && !k.last_used_at && (
                            <span className="text-ink-faint ml-2">· never used</span>
                          )}
                        </div>
                        {!k.revoked_at && (
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
