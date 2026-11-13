// Opt-in: AGENT_AUTH_TEST_DATABASE_URL=postgres://<user>@127.0.0.1:<port>/agent_auth_test
// POST /api/mcp through the real gate, key lookup, rate limiter, Coverage
// Hunt tools and Coverage Hunt store, on real PostgreSQL: what a refused
// contribution answers, and what it left in the tables. Only the coverage
// source (wholesale) is replaced; no candidate path is called here.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/wholesale/client", () => ({ fetchAggregatorCoverage: vi.fn(async () => null) }));
const state = vi.hoisted(() => ({ pool: null as import("pg").Pool | null }));
vi.mock("@/lib/db", () => ({
  query: (sql: string, args?: unknown[]) => state.pool!.query(sql, args),
  transaction: async (fn: (query: (sql: string, args?: unknown[]) => Promise<unknown>) => Promise<unknown>) => {
    const client = await state.pool!.connect();
    try {
      await client.query("BEGIN");
      const result = await fn((sql, args) => client.query(sql, args));
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
}));

import { POST } from "@/app/api/mcp/route";
import { createAgentWithKey } from "./creation";
import { operationalMetadataWrites } from "./operational-metadata";
import { LISTED_BUCKET_PRUNE } from "./tool-access";
import { createCoverageCandidate } from "@/lib/coverage-hunt/candidates";
import { MAX_NEW_SCOUT_CASES_PER_AGENT_PER_UTC_DAY, persistCoverageHuntScoutTurn } from "@/lib/coverage-hunt/db";
import type { CheckerSubmission, ScoutSubmission } from "@/lib/coverage-hunt/types";

const target = process.env.AGENT_AUTH_TEST_DATABASE_URL;
const schema = `hunt_refusals_test_${randomUUID().replaceAll("-", "")}`;
const owner = randomUUID();
let admin: Pool;
let pool: Pool;
let seq = 0;

const scout: ScoutSubmission = {
  role: "scout",
  claim: "insufficient",
  lanes: { facts: [], self_claims: [], inferences: [], unknowns: ["The public denominator is unknown."] },
  evidence: [],
  suggested_correction: null,
  boundary: "Public evidence only.",
};
const checker: CheckerSubmission = {
  role: "checker",
  verdict: "insufficient",
  lens: "Scope match.",
  what_would_change_my_mind: "A matching public denominator.",
  lanes: { facts: [], self_claims: [], inferences: [], unknowns: ["Unknown."] },
  evidence_selected: [],
  scout_wording_effect: "The gap wording made absence salient.",
  boundary: "Visible evidence only.",
};

function candidate() {
  seq += 1;
  return createCoverageCandidate({
    kind: "declared_observed_disagreement",
    target: { game_code: "op", source_id: "cardrush" },
    metrics: { observations: seq },
    observed_at: new Date().toISOString(),
    why_candidate: `Declared and observed coverage differ (${schema} ${seq}).`,
  });
}

async function seedAgent() {
  seq += 1;
  const handle = `hr${seq}-${randomUUID().slice(0, 8)}`;
  const created = await createAgentWithKey({
    operatedByUserId: owner,
    publicHandle: handle,
    displayName: `Hunt refusals ${seq}`,
    modelTag: "integration-test",
    keyExpiry: { kind: "never" },
  });
  if (!created.ok) throw new Error(`seed failed: ${created.error}`);
  return {
    agentId: created.agent_id,
    keyId: created.key_id,
    token: created.token,
    actor: { agent_id: created.agent_id, operator_user_id: owner, public_handle: handle },
  };
}

type Seeded = Awaited<ReturnType<typeof seedAgent>>;

/** One contribution through the gate, as a plain caller or a standard MCP client. */
function contribute(agent: Seeded, args: Record<string, unknown>, standard = false) {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${agent.token}` };
  if (standard) Object.assign(headers, { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" });
  return POST(new Request("https://cambridgetcg.example/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "coverage.hunt.contribute", arguments: args } }),
  }));
}

const caseRow = async (id: string) =>
  (await pool.query("SELECT status, updated_at FROM coverage_hunt_cases WHERE id = $1", [id])).rows[0];
const chronicle = async (id: string) =>
  (await pool.query("SELECT action, from_status, to_status, actor_kind FROM coverage_hunt_chronicle WHERE case_id = $1 ORDER BY id", [id])).rows;
const turns = async (id: string) =>
  (await pool.query("SELECT role, agent_id FROM coverage_hunt_turns WHERE case_id = $1 ORDER BY submitted_at", [id])).rows;

describe.skipIf(!target)("Coverage Hunt refusals through the gate, on isolated PostgreSQL", () => {
  beforeAll(async () => {
    // Explicit opt-in and exact throwaway DB; never inherit DATABASE_URL or contact a remote host.
    const url = new URL(target!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/agent_auth_test") throw new Error("Requires local agent_auth_test database.");
    url.searchParams.delete("sslmode");
    admin = new Pool({ connectionString: url.toString(), application_name: `${schema}_admin` });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({
      connectionString: url.toString(),
      application_name: schema,
      options: `-c search_path=${schema},public -c statement_timeout=5000`,
      max: 8,
    });
    state.pool = pool;
    await pool.query("CREATE TABLE users (id uuid PRIMARY KEY)");
    await pool.query("INSERT INTO users (id) VALUES ($1)", [owner]);
    const migration = (file: string) => readFile(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8");
    for (const file of ["0090_agents.sql", "0112_agent_self_serve.sql", "0120_coverage_hunt.sql", "0151_agent_key_expiry.sql"]) {
      await pool.query(await migration(file));
    }
  });
  afterAll(async () => {
    state.pool = null;
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
  });

  it("refuses a turn on a case past its limit, says it was not applied, and names the resting mark and chronicle row it committed", async () => {
    const scoutAgent = await seedAgent();
    const late = await seedAgent();
    // A case scouted 80 hours ago, so its 72-hour limit passed 8 hours ago.
    const opened = await persistCoverageHuntScoutTurn({
      candidate: candidate(),
      actor: scoutAgent.actor,
      actor_key_id: scoutAgent.keyId,
      client_request_id: "scout-80h-ago",
      submission: scout,
      now: new Date(Date.now() - 80 * 3_600_000),
    });
    if (!opened.ok) throw new Error("seed scout refused");
    const caseId = opened.case.id;
    expect((await caseRow(caseId)).status).toBe("checking");
    const before = await chronicle(caseId);
    expect(before.map((row) => row.action)).toEqual(["opened", "scout_submitted"]);

    const response = await contribute(late, { case_id: caseId, client_request_id: "late-checker", submission: checker });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe("case reached its 72-hour boundary and is resting");
    const refusal = body.result._meta["cambridgetcg.com/refusal"];
    expect(refusal).toMatchObject({ reason_code: "case_expired", effect: "not_applied", retryable: false, terminal: false });
    expect(refusal.side_effects.map((entry: { change: string }) => entry.change)).toEqual(["case_marked_resting", "chronicle_row_added"]);
    expect(refusal.next_actions[0]).toMatchObject({ action: "call_tool", tool: "coverage.hunt.view", arguments: { case_id: caseId } });

    // What the refusal says the call changed is what the tables hold, committed.
    expect((await caseRow(caseId)).status).toBe("resting");
    const after = await chronicle(caseId);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toEqual({ action: "rested", from_status: "checking", to_status: "resting", actor_kind: "system" });
    // And the turn it asked for is not there.
    expect((await turns(caseId)).map((row) => row.role)).toEqual(["scout"]);

    // The next call finds the case already resting: refused, and this time
    // it changed nothing, so it names nothing.
    const again = await contribute(late, { case_id: caseId, client_request_id: "late-checker-2", submission: checker });
    const againBody = await again.json();
    expect(again.status).toBe(409);
    const second = againBody.result._meta["cambridgetcg.com/refusal"];
    expect(second).toMatchObject({ reason_code: "case_terminal", effect: "not_applied" });
    expect(second).not.toHaveProperty("side_effects");
    expect(await chronicle(caseId)).toHaveLength(after.length);
  });

  it("sends a standard MCP client the same refusal with 200", async () => {
    const scoutAgent = await seedAgent();
    const late = await seedAgent();
    const opened = await persistCoverageHuntScoutTurn({
      candidate: candidate(),
      actor: scoutAgent.actor,
      actor_key_id: scoutAgent.keyId,
      client_request_id: "scout-old",
      submission: scout,
      now: new Date(Date.now() - 73 * 3_600_000),
    });
    if (!opened.ok) throw new Error("seed scout refused");
    const response = await contribute(late, { case_id: opened.case.id, client_request_id: "late", submission: checker }, true);
    expect(response.status).toBe(200);
    const refusal = (await response.json()).result._meta["cambridgetcg.com/refusal"];
    expect(refusal).toMatchObject({ reason_code: "case_expired", effect: "not_applied" });
    expect(refusal.side_effects).toHaveLength(2);
    expect((await caseRow(opened.case.id)).status).toBe("resting");
  });

  it("refuses a sixth scout in a UTC day with daily_limit and Retry-After, and writes nothing", async () => {
    const busy = await seedAgent();
    for (let i = 0; i < MAX_NEW_SCOUT_CASES_PER_AGENT_PER_UTC_DAY; i += 1) {
      const scouted = await persistCoverageHuntScoutTurn({
        candidate: candidate(),
        actor: busy.actor,
        actor_key_id: busy.keyId,
        client_request_id: `scout-today-${i}`,
        submission: scout,
      });
      expect(scouted.ok).toBe(true);
    }
    // An open case with no scout yet, as a test fixture written straight
    // into this run's own schema.
    const snapshot = candidate();
    const caseId = randomUUID();
    await pool.query(
      `INSERT INTO coverage_hunt_cases (id, candidate_id, candidate_fingerprint, candidate_kind, candidate_snapshot, status, created_at, expires_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'open', NOW(), NOW() + interval '72 hours', NOW())`,
      [caseId, snapshot.id, snapshot.fingerprint, snapshot.kind, JSON.stringify(snapshot)],
    );

    for (const standard of [false, true]) {
      const response = await contribute(busy, { case_id: caseId, client_request_id: `sixth-${standard}`, submission: scout }, standard);
      expect(response.status).toBe(standard ? 200 : 429);
      const retryAfter = Number(response.headers.get("retry-after"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(86_400);
      const refusal = (await response.json()).result._meta["cambridgetcg.com/refusal"];
      expect(refusal).toMatchObject({ reason_code: "daily_limit", retryable: true, effect: "not_applied", retry_after_seconds: retryAfter });
      expect(refusal).not.toHaveProperty("side_effects");
    }
    expect((await caseRow(caseId)).status).toBe("open");
    expect(await chronicle(caseId)).toEqual([]);
    expect(await turns(caseId)).toEqual([]);
  });

  it("deletes any key's week-old rate buckets on a refused call, as the published list says", async () => {
    const quiet = await seedAgent();
    const caller = await seedAgent();
    await pool.query(
      "INSERT INTO agent_rate_buckets (key_id, bucket_minute, request_count) VALUES ($1, date_trunc('minute', NOW()) - interval '8 days', 3)",
      [quiet.keyId],
    );
    const buckets = async (keyId: string) =>
      (await pool.query("SELECT request_count FROM agent_rate_buckets WHERE key_id = $1", [keyId])).rows;
    expect(await buckets(quiet.keyId)).toEqual([{ request_count: 3 }]);

    // Refused by the tool (no such case), after the limiter counted it.
    const response = await contribute(caller, { case_id: randomUUID(), client_request_id: "nowhere", submission: checker });
    expect(response.status).toBe(404);
    expect((await response.json()).result._meta["cambridgetcg.com/refusal"]).toMatchObject({ reason_code: "case_not_found" });
    // Another key's week-old bucket is gone; this key's minute is counted.
    expect(await buckets(quiet.keyId)).toEqual([]);
    expect(await buckets(caller.keyId)).toEqual([{ request_count: 1 }]);
    // Operational metadata, not a side effect of this call's own request,
    // and published where the gate lists what a key's calls write.
    expect(operationalMetadataWrites({})).toContain(LISTED_BUCKET_PRUNE);
    expect(LISTED_BUCKET_PRUNE).toMatch(/older than seven days, any key's, by each allowed authenticated call, even one then refused/);
  });

  it("types a turn the state refuses, wrong_turn or a second role, with nothing written", async () => {
    const first = await seedAgent();
    const opened = await persistCoverageHuntScoutTurn({
      candidate: candidate(),
      actor: first.actor,
      actor_key_id: first.keyId,
      client_request_id: "scout-fresh",
      submission: scout,
    });
    if (!opened.ok) throw new Error("seed scout refused");
    // The scout cannot also check.
    const response = await contribute(first, { case_id: opened.case.id, client_request_id: "self-check", submission: checker });
    expect(response.status).toBe(409);
    const refusal = (await response.json()).result._meta["cambridgetcg.com/refusal"];
    expect(refusal).toMatchObject({ reason_code: "agent_already_participated", effect: "not_applied" });
    expect(refusal).not.toHaveProperty("side_effects");
    expect((await turns(opened.case.id))).toHaveLength(1);
    expect((await chronicle(opened.case.id)).map((row) => row.action)).toEqual(["opened", "scout_submitted"]);
  });
});
