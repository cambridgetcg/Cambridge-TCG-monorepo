/**
 * /account/agents — operator's agent management surface.
 *
 * Lists the operator's own agents, with key-management controls. Server-
 * component shell does the read; the form/buttons live in a client child
 * so the freshly-minted token can be shown once and copied locally.
 *
 * See docs/connections/the-agent-surface.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { PageHeader, WhyLink, Audience, audienceMetadata } from "@/lib/ui";
import { AgentsClient } from "./_client";

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
  created_at: string;
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
              status, suspended_reason, created_at
         FROM agents
        WHERE operated_by_user_id = $1
        ORDER BY (status = 'active') DESC, created_at DESC`,
      [session.user.id],
    ),
    query(
      `SELECT k.id, k.agent_id, k.key_prefix, k.name, k.rate_limit_tier,
              k.last_used_at, k.revoked_at, k.created_at
         FROM agent_keys k
         JOIN agents a ON a.id = k.agent_id
        WHERE a.operated_by_user_id = $1
        ORDER BY k.created_at DESC`,
      [session.user.id],
    ),
  ]);

  const agents = agentsRes.rows as AgentRow[];
  const keys = keysRes.rows as KeyRow[];

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

      <AgentsClient agents={agents} keys={keys} />

      <div className="mt-12 rounded-lg border border-border-subtle bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">How to use a key</h2>
        <p className="text-xs text-ink-muted mt-2">
          Send the key in <code className="text-accent">Authorization: Bearer &lt;token&gt;</code>{" "}
          to <code className="text-accent">https://cambridgetcg.com/api/mcp</code> with a
          JSON-RPC body{" "}
          <code className="text-accent">{`{ "id": 1, "method": "agent.self" }`}</code>. The
          route is a custom JSON-RPC HTTPS endpoint, not MCP Streamable HTTP or SSE.
          Standard MCP clients need the vendored stdio bridge, which is not npm-published.
          The reference implementation lives at{" "}
          <code className="text-accent">examples/agents/random-policy-agent.mjs</code>{" "}
          in the repo. Tool names and current status:
        </p>
        <ul className="text-xs text-ink-faint mt-3 list-disc list-inside space-y-1">
          <li><code>agent.self</code>, <code>play.list_open_rooms</code></li>
          <li><code>play.observe</code>, <code>play.legal_actions</code>, <code>play.match_history</code> — agent-owned reads</li>
          <li><code>catalog.search</code>, <code>leaderboards.read</code>, <code>prices.recent</code> — status only, zero rows or values</li>
          <li><code>deck.list_mine</code> — operator-managed keys only</li>
          <li><code>play.take_action</code>, <code>play.queue_match</code>, <code>play.cancel_queue</code>, <code>deck.save</code> — paused for every key</li>
        </ul>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Read-only means domain state. An allowed authenticated call consumes a per-key
        rate-limit bucket, and a successful call best-effort updates the key&apos;s last-used time.
      </p>
    </div>
  );
}
