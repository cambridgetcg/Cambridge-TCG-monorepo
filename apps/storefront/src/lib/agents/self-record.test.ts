import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActor } from "./auth";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: mocks.query, transaction: mocks.transaction }));
vi.mock("./matchmaker", () => ({ finalizeMatch: vi.fn(), tickMatchmaker: vi.fn() }));

import { GET as mcpJson } from "@/app/.well-known/mcp.json/route";
import { MCP_DAILY_NOTE } from "@/lib/observability/mcp-daily";
import { agentSelf } from "./play-tools";
import { operationalMetadataWrites } from "./operational-metadata";
import { recordedAboutThisKey } from "./self-record";
import { AGENT_OPERATIONAL_METADATA_WRITES, LISTED_BUCKET_PRUNE, LISTED_BUCKETS, LISTED_LAST_USED } from "./tool-access";

const actor: AgentActor = {
  kind: "agent", agentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", agentPublicHandle: "public-agent-a",
  operatorUserId: "11111111-1111-4111-8111-111111111111", registeredVia: "operator", keyId: "key-a", rateLimitTier: "standard",
  keyExpiresAt: null,
};
const profile = { public_handle: "public-agent-a", display_name: "agent a", model_tag: "m", rating: "1500", rating_deviation: "350", rating_volatility: "0.06",
  matches_played: 0, matches_won: 0, status: "active", created_at: "2026-07-12T10:00:00.000Z" };

beforeEach(() => mocks.query.mockReset());

describe("agent.self: what the gate records about the calling key", () => {
  it("reads the key's own row and buckets in agent.self's one query, and writes nothing", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...profile, key_prefix: "ctcg_agt_aB3", key_created_at: new Date("2026-10-01T08:00:00Z"), last_used_at: new Date("2026-11-06T09:14:02Z"),
      bucket_minutes: 3, bucket_requests: 5, bucket_days: [{ day: "2026-11-05", minutes: 1, requests: 1 }, { day: "2026-11-06", minutes: 2, requests: 4 }] }], rowCount: 1 });
    const self = await agentSelf(actor);
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(params).toEqual([actor.agentId, actor.keyId]);
    expect(sql).toContain("agent_rate_buckets WHERE key_id = $2");
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(sql).not.toContain("key_hash");
    expect(self.recorded_about_this_key).toMatchObject({
      rate_limit_buckets: { listed_as: LISTED_BUCKETS, held_now: { minutes: 3, requests: 5, by_utc_day: [{ day: "2026-11-05", minutes: 1, requests: 1 }, { day: "2026-11-06", minutes: 2, requests: 4 }] }, includes_this_call: true },
      last_used_at: { listed_as: LISTED_LAST_USED, value: "2026-11-06T09:14:02.000Z" },
      tier: { rate_limit_tier: "standard", requests_per_minute: 120 },
      key: { prefix: "ctcg_agt_aB3", created_at: "2026-10-01T08:00:00.000Z" },
      daily_mcp_count: { on: false },
    });
    expect(self.recorded_about_this_key.rate_limit_buckets.kept).toContain("7 days");
    expect(JSON.stringify(self)).not.toContain(actor.operatorUserId);
  });

  it("reads an unused key as empty, not as an error", () => {
    expect(recordedAboutThisKey({}, "free")).toMatchObject({
      rate_limit_buckets: { held_now: { minutes: 0, requests: 0, by_utc_day: [] } },
      last_used_at: { value: null },
      tier: { requests_per_minute: 30 },
      key: { prefix: null, created_at: null },
    });
  });

  it("names the daily MCP count only while it is on, and says it holds nothing about the key", () => {
    const on = { OPS_MCP_DAILY: "on" };
    expect(recordedAboutThisKey({}, "free", on).daily_mcp_count).toEqual({ on: true, listed_as: MCP_DAILY_NOTE, about_this_key: expect.stringContaining("no key, agent or account id") });
    // The gate's one list has a third line, the holder's own revocation
    // (agent.revoke_key), which the gate really writes, and a fourth, the
    // seven-day deletion every counted call runs; the two quoted lines lead it.
    expect(AGENT_OPERATIONAL_METADATA_WRITES.slice(0, 2)).toEqual([LISTED_BUCKETS, LISTED_LAST_USED]);
    expect(AGENT_OPERATIONAL_METADATA_WRITES[2]).toContain("agent.revoke_key");
    expect(AGENT_OPERATIONAL_METADATA_WRITES[3]).toBe(LISTED_BUCKET_PRUNE);
    expect(operationalMetadataWrites(on)).toEqual([...AGENT_OPERATIONAL_METADATA_WRITES, MCP_DAILY_NOTE]);
    expect(operationalMetadataWrites({})).toEqual([...AGENT_OPERATIONAL_METADATA_WRITES]);
    expect(operationalMetadataWrites({})).toHaveLength(4);
  });

  it("lists the same items /.well-known/mcp.json publishes", async () => {
    const published = (await (await mcpJson()).json()).read_only_scope.operational_metadata_writes;
    expect(published).toEqual(operationalMetadataWrites());
  });
});
