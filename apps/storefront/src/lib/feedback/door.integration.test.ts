import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createCompatDb } from "@cambridge-tcg/db/compat";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { FEEDBACK_HOURLY_CAP, eraseFeedbackForHolder, readFeedbackForHolder, storeFeedback, validateFeedback } from "./door";
import { runDoorRetentionSweep } from "./retention";
import { countPeerHello } from "@/lib/peers";

// Explicit opt-in, like the other storefront integration tests: one
// disposable loopback database, an isolated schema, never DATABASE_URL.
const localUrl = process.env.DOORS_TEST_DATABASE_URL;
const id = randomUUID().replaceAll("-", "");
const schema = `agent_doors_test_${id}`, alone = `agent_doors_alone_${id}`;
const migration = () => readFile(new URL("../../../drizzle/0149_agent_doors.sql", import.meta.url), "utf8");
type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
let admin: Pool, pool: Pool, compat: ReturnType<typeof createCompatDb> | null = null;
const run: RunQuery = (sql, params) => pool.query(sql, params) as never;
async function apply(target: Pool) {
  const client = await target.connect();
  try { await client.query("BEGIN"); await client.query(await migration()); await client.query("COMMIT"); }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const submission = (input: Record<string, unknown>) => {
  const result = validateFeedback(input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe.skipIf(!localUrl)("agent doors PostgreSQL integration, migration 0149 (explicit loopback DB only)", () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.includes("test") || url.search) throw new Error("Explicit disposable local test database required");
    admin = new Pool({ connectionString: localUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE SCHEMA ${alone}`);
    pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 4 });
    await apply(pool);
  });
  afterAll(async () => {
    if (compat) await compat.close();
    if (pool) await pool.end();
    if (admin) { for (const name of [schema, alone]) await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`); await admin.end(); }
  });

  it("applies on its own in one transaction, creates only its tables, and has no column for an address or identity", async () => {
    const bare = new Pool({ connectionString: localUrl, options: `-c search_path=${alone}`, max: 1 });
    try {
      await apply(bare);
      const tables = (await bare.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1`, [alone])).rows.map(row => row.table_name);
      expect(tables).toEqual(["feedback_hourly_intake", "peer_hello_daily", "public_feedback"]);
      const columns = (await bare.query(`SELECT table_name || '.' || column_name AS name FROM information_schema.columns WHERE table_schema = $1 ORDER BY 1`, [alone])).rows.map(row => row.name);
      expect(columns).toEqual([
        "feedback_hourly_intake.accepted", "feedback_hourly_intake.hour",
        "peer_hello_daily.count", "peer_hello_daily.day", "peer_hello_daily.declared_kind",
        "public_feedback.answer", "public_feedback.answered_at", "public_feedback.details", "public_feedback.expires_at", "public_feedback.feedback_id",
        "public_feedback.holder_key_sha256", "public_feedback.id", "public_feedback.kind", "public_feedback.message", "public_feedback.received_at",
        "public_feedback.reply_name", "public_feedback.reply_to", "public_feedback.status", "public_feedback.topic",
      ]);
    } finally { await bare.end(); }
    expect(await migration()).not.toMatch(/\b(ALTER|DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/);
  });

  it("refuses rows the door would never write", async () => {
    const refused = async (sql: string) => expect(pool.query(sql)).rejects.toMatchObject({ code: "23514" });
    const row = (values: string) => `INSERT INTO public_feedback (feedback_id, holder_key_sha256, kind, message, details, status, answer, answered_at, expires_at) VALUES (${values})`;
    const id_ = `'fb_${"0".repeat(24)}'`, hash = `'${"a".repeat(64)}'`, later = `now() + interval '180 days'`;
    await refused(row(`'fb_short', ${hash}, 'question', 'hi', '{}', 'received', NULL, NULL, ${later}`));
    await refused(row(`${id_}, 'not-a-hash', 'question', 'hi', '{}', 'received', NULL, NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'praise', 'hi', '{}', 'received', NULL, NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'question', NULL, '{}', 'received', NULL, NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'question', '', '{}', 'received', NULL, NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'question', repeat('x', 4001), '{}', 'received', NULL, NULL, ${later}`));
    for (const details of [`'{"ip":"203.0.113.9"}'`, `'{"observed":{"a":1}}'`, `'{"observed":["a"]}'`, `'{"step_number":0}'`, `'{"step_number":2.5}'`, `'{"observed":""}'`, `'[]'`]) {
      await refused(row(`${id_}, ${hash}, 'question', 'hi', ${details}, 'received', NULL, NULL, ${later}`));
    }
    await refused(row(`${id_}, ${hash}, 'question', 'hi', '{}', 'answered', NULL, NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'question', 'hi', '{}', 'received', 'yes', NULL, ${later}`));
    await refused(row(`${id_}, ${hash}, 'question', 'hi', '{}', 'received', NULL, NULL, now() + interval '181 days'`));
    await refused(`INSERT INTO peer_hello_daily VALUES (current_date, 'person@example.com', 1)`);
    await refused(`INSERT INTO peer_hello_daily VALUES (current_date, 'agent', 10001)`);
    await refused(`INSERT INTO feedback_hourly_intake VALUES (date_trunc('hour', now(), 'UTC') + interval '1 minute', 1)`);
  });

  it("keeps a message, lets its holder read and erase it, and caps the hour with no sender kept", async () => {
    const first = await storeFeedback(submission({ kind: "data-error", endpoint: "/api/v1/market/indices", subject: "op-op01", as_of: "2026-11-05", step_number: 2, message: "index missing", reply_to: "ada@example.com" }), run);
    if (!first.ok) throw new Error(first.reason);
    const read = await readFeedbackForHolder(first.holderKey, run);
    expect(read).toMatchObject({ ok: true, view: { feedback_id: first.feedbackId, kind: "data-error", status: "received", answer: null,
      held: { message: "index missing", details: { endpoint: "/api/v1/market/indices", subject: "op-op01", as_of: "2026-11-05", step_number: 2 }, reply_to: "ada@example.com" } } });
    expect(Date.parse(first.expiresAt) - Date.parse(first.receivedAt)).toBeGreaterThan(179 * 86_400_000);

    await pool.query(`UPDATE public_feedback SET status = 'answered', answer = 'Fixed in the next derivation.', answered_at = now() WHERE feedback_id = $1`, [first.feedbackId]);
    expect((await readFeedbackForHolder(first.holderKey, run)) as unknown).toMatchObject({ ok: true, view: { status: "answered", answer: { text: "Fixed in the next derivation." } } });

    for (let n = 2; n <= FEEDBACK_HOURLY_CAP; n++) expect((await storeFeedback(submission({ kind: "question", message: `hello ${n}` }), run)).ok).toBe(true);
    expect(await storeFeedback(submission({ kind: "question", message: "one too many" }), run)).toEqual({ ok: false, reason: "capped" });
    expect((await pool.query(`SELECT count(*)::int AS n FROM public_feedback`)).rows[0].n).toBe(FEEDBACK_HOURLY_CAP);
    expect((await pool.query(`SELECT accepted FROM feedback_hourly_intake`)).rows).toEqual([{ accepted: FEEDBACK_HOURLY_CAP }]);

    expect(await eraseFeedbackForHolder(first.holderKey, run)).toEqual({ ok: true, erased: first.feedbackId });
    expect(await readFeedbackForHolder(first.holderKey, run)).toEqual({ ok: true, view: null });
    expect(await eraseFeedbackForHolder(first.holderKey, run)).toEqual({ ok: true, erased: null });
    // Erasing does not reopen the hour: the cap counts what was accepted.
    expect(await storeFeedback(submission({ kind: "question", message: "still over" }), run)).toEqual({ ok: false, reason: "capped" });
    await pool.query(`DELETE FROM public_feedback; DELETE FROM feedback_hourly_intake`);
  });

  it("writes and reads the same through postgres.js, as production does", async () => {
    const url = new URL(localUrl!);
    url.searchParams.set("search_path", schema);
    compat = createCompatDb({ url: url.toString(), ssl: false, max: 2 });
    const via: RunQuery = (sql, params) => compat!.query(sql, params) as never;
    const stored = await storeFeedback(submission({ kind: "guide-feedback", guide_slug: "respect-our-limits", step_number: "4", observation: "step 4 404s" }), via);
    if (!stored.ok) throw new Error(stored.reason);
    const read = await readFeedbackForHolder(stored.holderKey, via);
    expect(read).toMatchObject({ ok: true, view: { held: { message: null, details: { guide_slug: "respect-our-limits", step_number: 4, observation: "step 4 404s" } } } });
    expect((await pool.query(`SELECT jsonb_typeof(details) AS t FROM public_feedback`)).rows).toEqual([{ t: "object" }]);
    await pool.query(`DELETE FROM public_feedback; DELETE FROM feedback_hourly_intake`);
  });

  it("counts hellos by declared kind up to the cap, and nothing else", async () => {
    expect(await countPeerHello("agent", run)).toMatchObject({ counted: true, declaredKind: "agent", todayTotal: 1 });
    expect(await countPeerHello("agent", run)).toMatchObject({ counted: true, todayTotal: 2 });
    expect(await countPeerHello(null, run)).toMatchObject({ counted: true, declaredKind: "undeclared", todayTotal: 1 });
    await pool.query(`UPDATE peer_hello_daily SET count = 9999 WHERE declared_kind = 'agent'`);
    expect(await countPeerHello("agent", run)).toMatchObject({ counted: true, todayTotal: 10000 });
    expect(await countPeerHello("agent", run)).toEqual({ counted: false, reason: "cap-reached" });
    expect((await pool.query(`SELECT declared_kind, count FROM peer_hello_daily ORDER BY 1`)).rows).toEqual([{ declared_kind: "agent", count: 10000 }, { declared_kind: "undeclared", count: 1 }]);
  });

  it("sweeps each table past its period at minute 23, keeping the rest", async () => {
    await pool.query(`INSERT INTO public_feedback (feedback_id, holder_key_sha256, kind, message, received_at, expires_at) VALUES
      ('fb_${"1".repeat(24)}', '${"b".repeat(64)}', 'question', 'old', now() - interval '200 days', now() - interval '20 days'),
      ('fb_${"2".repeat(24)}', '${"c".repeat(64)}', 'question', 'new', now() - interval '10 days', now() + interval '170 days')`);
    await pool.query(`INSERT INTO feedback_hourly_intake VALUES (date_trunc('hour', now(), 'UTC') - interval '49 hours', 3), (date_trunc('hour', now(), 'UTC') - interval '47 hours', 2)`);
    await pool.query(`INSERT INTO peer_hello_daily VALUES (current_date - 420, 'agent', 4), (current_date - 300, 'agent', 5)`);
    const at23 = new Date(); at23.setUTCMinutes(23);
    expect(await runDoorRetentionSweep(at23, run)).toEqual({ ranInWindow: true, provisioned: true, deleted: { feedback: 1, intake: 1, hello: 1 } });
    expect((await pool.query(`SELECT message FROM public_feedback`)).rows).toEqual([{ message: "new" }]);
    expect((await pool.query(`SELECT accepted FROM feedback_hourly_intake`)).rows).toEqual([{ accepted: 2 }]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM peer_hello_daily WHERE day = current_date - 300`)).rows[0].n).toBe(1);
  });

  it("reports nothing to sweep before 0149", async () => {
    const bare = new Pool({ connectionString: localUrl, options: `-c search_path=public`, max: 1 });
    try {
      const at23 = new Date(); at23.setUTCMinutes(23);
      expect(await runDoorRetentionSweep(at23, (sql, params) => bare.query(sql, params) as never)).toEqual({ ranInWindow: true, provisioned: false });
    } finally { await bare.end(); }
  });
});
