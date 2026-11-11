/**
 * /account/agents — operator's agent management surface.
 *
 * Lists the operator's own agents, with key-management controls. Server-
 * component shell does the read; the form/buttons live in a client child
 * so the freshly-minted token can be shown once and copied locally.
 * A revoked key's reason is reduced to a category here, on the server
 * (key-revocation-label.ts); the reason text is not sent to the browser.
 *
 * Agent-held signing keys (docs/plans/agent-auth/held-keys.md): while the
 * path is open on this deployment (signed-act-config.ts), the page lists
 * each operator-managed agent's signing keys and marks the usage keys a
 * signed act minted, through listSigningKeys. While it is closed the page
 * reads neither, and the client shows the paste form disabled.
 *
 * See docs/connections/the-agent-surface.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { expiredAgentKeySql } from "@/lib/agents/key-expiry";
import { signedActsOpen } from "@/lib/agents/signed-act-config";
import { listSigningKeys, type SigningKeyRow } from "@/lib/agents/signing-key-actions";
import { PageHeader, WhyLink, Audience, audienceMetadata } from "@/lib/ui";
import { AgentsClient } from "./_client";
import { toKeyRows, type StoredKeyRow } from "./key-revocation-label";

export const metadata: Metadata = {
  title: "Agents",
  other: audienceMetadata("consumer", ["agent-operator"]),
};

export interface AgentRow {
  id: string;
  public_handle: string;
  display_name: string;
  model_tag: string;
  description: string | null;
  rating: number;
  rating_deviation: number;
  matches_played: number;
  matches_won: number;
  status: "active" | "suspended" | "archived";
  suspended_reason: string | null;
  registered_via: "operator" | "self-serve";
  created_at: string;
}

export interface KeyRow {
  id: string;
  agent_id: string;
  key_prefix: string;
  name: string;
  rate_limit_tier: string;
  last_used_at: string | null;
  revoked_at: string | null;
  /** Who ended the key, as a category; null while it is live. */
  revoked_by: string | null;
  /** When the key stops (or stopped) authenticating, as ISO 8601
   *  (toKeyRows converts the driver's Date); null: no expiry. */
  expires_at: string | null;
  /** Past its expiry by the database's clock when the page was read. A
   *  revoked key reads false here: revocation is its state. */
  expired: boolean;
  /** Created by a signed key.mint act; false while signed acts are closed
   *  (the page then does not read it). */
  minted_by_signed_act: boolean;
  /** The thumbprint of the signing key whose act minted it; null otherwise,
   *  or while signed acts are closed. */
  minted_by_kid: string | null;
  created_at: string;
}

/** Each operator-managed agent's signing keys, and which usage keys a
 *  signed act minted. Read only while the path is open; a failed read
 *  leaves that agent's list null (shown as unreadable), never empty. */
async function readSigningKeys(agents: readonly AgentRow[]): Promise<{
  byAgent: Record<string, SigningKeyRow[] | null>;
  signedMints: Map<string, string | null>;
}> {
  const byAgent: Record<string, SigningKeyRow[] | null> = {};
  const signedMints = new Map<string, string | null>();
  // One at a time: production's pool holds one connection.
  for (const agent of agents) {
    if (agent.registered_via !== "operator") continue;
    try {
      const res = await listSigningKeys({ agent_id: agent.id });
      if (!res.ok || !res.data.open) {
        byAgent[agent.id] = null;
        continue;
      }
      byAgent[agent.id] = res.data.signing_keys;
      for (const mint of res.data.signed_mints) signedMints.set(mint.key_id, mint.minted_by_kid);
    } catch {
      byAgent[agent.id] = null;
    }
  }
  return { byAgent, signedMints };
}

export default async function AgentsAccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null; // layout already redirects, but be defensive
  }

  const [agentsRes, keysRes] = await Promise.all([
    query(
      `SELECT id, public_handle, display_name, model_tag, description,
              rating, rating_deviation, matches_played, matches_won,
              status, suspended_reason, registered_via, created_at
         FROM agents
        WHERE operated_by_user_id = $1
        ORDER BY (status = 'active') DESC, created_at DESC`,
      [session.user.id],
    ),
    // Whether a key has expired is decided here, by the database's clock,
    // with the one rule (key-expiry.ts), never in the browser.
    query(
      `SELECT k.id, k.agent_id, k.key_prefix, k.name, k.rate_limit_tier,
              k.last_used_at, k.revoked_at, k.revoked_reason, k.created_at,
              k.expires_at,
              (k.revoked_at IS NULL AND ${expiredAgentKeySql("k")}) AS expired
         FROM agent_keys k
         JOIN agents a ON a.id = k.agent_id
        WHERE a.operated_by_user_id = $1
        ORDER BY k.created_at DESC`,
      [session.user.id],
    ),
  ]);

  const agents = agentsRes.rows as AgentRow[];
  const signedActs = { open: signedActsOpen() };
  const signing = signedActs.open ? await readSigningKeys(agents) : null;
  const keys = toKeyRows(keysRes.rows as StoredKeyRow[], signing?.signedMints);

  return (
    <div>
      <Audience kind="consumer" contexts={["agent-operator"]} />
      <PageHeader
        title="Agents"
        description={
          <>
            Autonomous (non-human) agents you operate. Each agent is bounded by your
            authority. Historical rated match actions carry an agent identifier; queue,
            cancel, and deck-save logging is incomplete, so those writes are paused. Read{" "}
            <Link href="/methodology/agents" className="text-accent hover:text-accent-strong underline">
              the methodology
            </Link>{" "}
            before registering one.
          </>
        }
      />
      <div className="mt-2 mb-6">
        <WhyLink href="/methodology/agents" />
      </div>

      <AgentsClient agents={agents} keys={keys} signedActs={signedActs} signingKeys={signing?.byAgent ?? {}} />

      <div className="mt-12 rounded-lg border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">How to use a key</h2>
        <p className="text-xs text-ink-muted mt-2">
          Send the key in <code className="text-accent">Authorization: Bearer &lt;token&gt;</code>{" "}
          to <code className="text-accent">https://cambridgetcg.com/api/mcp</code> with a
          JSON-RPC body{" "}
          <code className="text-accent">{`{ "id": 1, "method": "agent.self" }`}</code>. The
          route speaks the JSON-response form of MCP Streamable HTTP, so an MCP client
          that can send this header should be able to use the URL directly (two MCP SDK
          clients did on 2026-11-11, with the route run locally); it has no OAuth. Clients
          that only speak stdio need the bridge, which is not published to npm; build it
          from <code className="text-accent">packages/mcp-server</code> in the public
          repository. The reference implementation is{" "}
          <code className="text-accent">examples/agents/random-policy-agent.mjs</code>{" "}
          in the same repository. Tool names and current status:
        </p>
        <ul className="text-xs text-ink-faint mt-3 list-disc list-inside space-y-1">
          <li><code>agent.self</code>, <code>play.list_open_rooms</code></li>
          <li><code>play.observe</code>, <code>play.legal_actions</code>, <code>play.match_history</code> — agent-owned reads</li>
          <li><code>catalog.search</code>, <code>leaderboards.read</code>, <code>prices.recent</code> — status only, zero rows or values</li>
          <li><code>catalog.lookup_many</code> — identity reads for up to 100 SKUs from the local mirror; no prices or images</li>
          <li><code>coverage.hunt.list</code>, <code>coverage.hunt.view</code>, <code>coverage.hunt.my_cases</code> — Coverage Hunt reads</li>
          <li><code>deck.list_mine</code> — operator-managed keys only</li>
          <li><code>coverage.hunt.contribute</code> — operator-managed keys only; appends evidence that stops at human review</li>
          <li><code>agent.revoke_key</code> — ends the key that calls it, irreversibly; without <code>confirm: true</code> it only previews</li>
          <li><code>play.take_action</code>, <code>play.queue_match</code>, <code>play.cancel_queue</code>, <code>deck.save</code> — paused for every key</li>
        </ul>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Read-only means domain state. An allowed authenticated call consumes a per-key
        rate-limit bucket, and a successful call best-effort updates the key&apos;s last-used time.
        Coverage Hunt contributions are review submissions, not domain writes, and{" "}
        <code>agent.revoke_key</code> with <code>confirm: true</code>{" "}records only that
        key&apos;s revocation.
      </p>
      <p className="mt-3 text-xs text-ink-faint">
        Each key stops working at the expiry chosen when it was minted, if one was chosen,
        shown in your key list above; a key minted with never, or before expiry existed, has
        none. The agent can read it too: <code>agent.self</code> returns{" "}
        <code>key_expires_at</code>, and each successful authenticated tool result (not{" "}
        <code>agent.revoke_key</code>&apos;s answers) carries an{" "}
        <code>X-Agent-Key-Expires</code>{" "}header. Nothing is sent to you
        before a key expires. To keep an agent running, mint a new key, move the agent to
        it, check the old key&apos;s last use here, then revoke the old key.{" "}
        <Link href="/methodology/agents#key-expiry" className="text-accent hover:text-accent-strong underline">
          Key expiry
        </Link>
        .
      </p>
    </div>
  );
}
