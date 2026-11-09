/**
 * "What you record about me", for MCP agent.self: the operational metadata
 * the gate keeps about the calling key, read back to it. The items are the
 * ones /.well-known/mcp.json lists under read_only_scope (and GET /api/mcp
 * repeats): the key's minute rate-limit buckets, its last-used time, and,
 * while OPS_MCP_DAILY is on, the daily MCP count, which holds no key id and
 * so has nothing to read back. Its tier limit and the retention of each
 * item come with them. The list's third line, the holder's own revocation
 * of the key, is not read back: a revoked key no longer reaches agent.self.
 *
 * Nothing new is collected to answer. The read rides in agent.self's one
 * query (SELF_RECORD_SELECT), and the call itself is recorded exactly as any
 * allowed call is: one more count in this minute's bucket, then
 * last_used_at.
 */

import { MCP_DAILY_NOTE, mcpDailyOn } from "@/lib/observability/mcp-daily";
import { tierLimits, type RateLimitTier } from "./rate-limit";
import { LISTED_BUCKETS, LISTED_LAST_USED } from "./tool-access";

/** Columns agent.self adds to its agents row: the key's own row, and its
 * buckets summed per UTC day. $1 is the agent id, $2 the key id. */
export const SELF_RECORD_SELECT = `k.key_prefix, k.created_at AS key_created_at, k.last_used_at,
            b.bucket_minutes, b.bucket_requests, b.bucket_days`;
export const SELF_RECORD_JOINS = `LEFT JOIN agent_keys k ON k.id = $2 AND k.agent_id = a.id
       LEFT JOIN LATERAL (
         SELECT coalesce(sum(d.minutes), 0)::int AS bucket_minutes,
                coalesce(sum(d.requests), 0)::int AS bucket_requests,
                coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'minutes', d.minutes, 'requests', d.requests) ORDER BY d.day), '[]'::jsonb) AS bucket_days
           FROM (SELECT (bucket_minute AT TIME ZONE 'UTC')::date::text AS day, count(*)::int AS minutes, sum(request_count)::int AS requests
                   FROM agent_rate_buckets WHERE key_id = $2 GROUP BY 1) d
       ) b ON true`;

const iso = (value: unknown) => (value === null || value === undefined ? null : (value instanceof Date ? value : new Date(String(value))).toISOString());
const days = (value: unknown): { day: string; minutes: number; requests: number }[] => {
  const list = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(list) ? list.map(entry => ({ day: String(entry.day), minutes: Number(entry.minutes), requests: Number(entry.requests) })) : [];
};

export function recordedAboutThisKey(row: Record<string, unknown>, tier: RateLimitTier, env?: Readonly<Record<string, string | undefined>>) {
  const counting = mcpDailyOn(env);
  return {
    listed_in: "https://cambridgetcg.com/.well-known/mcp.json (read_only_scope.operational_metadata_writes)",
    rate_limit_buckets: {
      listed_as: LISTED_BUCKETS,
      what: "One row per minute in which this key made an allowed call: the minute and how many calls. No tool name, arguments or result.",
      held_now: { minutes: Number(row.bucket_minutes ?? 0), requests: Number(row.bucket_requests ?? 0), by_utc_day: days(row.bucket_days) },
      includes_this_call: true,
      kept: "7 days. Older minutes are deleted whenever any key makes an allowed call, so after a quiet spell they can wait for the next one.",
    },
    last_used_at: {
      listed_as: LISTED_LAST_USED,
      value: iso(row.last_used_at),
      note: "As it stood before this call; this call sets it after answering.",
      kept: "With the key. Revoking the key keeps it; deleting the agent or its operator's account deletes it.",
    },
    tier: { rate_limit_tier: tier, requests_per_minute: tierLimits(tier).perMinute },
    key: { prefix: (row.key_prefix as string | null | undefined) ?? null, created_at: iso(row.key_created_at) },
    daily_mcp_count: counting
      ? { on: true, listed_as: MCP_DAILY_NOTE, about_this_key: "Nothing: it is counted with no key, agent or account id, so no row can be read back for one key." }
      : { on: false, about_this_key: "Nothing: the daily count is off here." },
    not_kept_with_this_key:
      "No tool name, arguments, request body, IP address or user agent is stored with this key. Hosting and proxy logs (Cloudflare, Vercel) can still hold ordinary request metadata.",
    collected_to_answer: "Nothing new: this call counts in its minute's bucket and stamps last_used_at, as any allowed call does.",
  };
}
