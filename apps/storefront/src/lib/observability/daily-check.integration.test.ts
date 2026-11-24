import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createCompatDb } from "@cambridge-tcg/db/compat";
import type { Walk } from "@/lib/guest-walk";
import { runDailyCheck, type Mail } from "./daily-check";
import { readHealth } from "./job-health";
import { recordMaintenance } from "./job-outcomes";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

// Explicit opt-in, like the other observability integration test.
const localUrl = process.env.OPS_TEST_DATABASE_URL;
const schema = `daily_check_test_${randomUUID().replaceAll("-", "")}`;
const walk: Walk = { base: "x", startedAt: "x", ms: 1, steps: [{ id: "example", asks: "it answers", ok: false, says: "HTTP 404", parts: [] }], failed: ["example"] };
let pool: Pool, site: ReturnType<typeof createCompatDb>;

describe.skipIf(!localUrl)("the daily check on migrations 0041, 0148 and 0149 (explicit loopback DB only)", () => {
  beforeAll(async () => {
    const url = new URL(localUrl!);
    if (!["127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.includes("test") || url.search) throw new Error("Explicit disposable local test database required");
    pool = new Pool({ connectionString: localUrl, options: `-c search_path=${schema}`, max: 2 });
    await pool.query(`CREATE SCHEMA ${schema}`);
    for (const name of ["0041_digest_runs.sql", "0148_ops_observability.sql", "0149_agent_doors.sql"]) await pool.query(await readFile(new URL(`../../../drizzle/${name}`, import.meta.url), "utf8"));
    url.searchParams.set("search_path", schema);
    // The site's own database layer: one connection, and dates as Postgres text.
    site = createCompatDb({ url: url.toString(), ssl: false, max: 1 });
  });
  afterAll(async () => {
    if (site) await site.close();
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
  });

  const check = async (send: (mail: Mail) => Promise<string | null>, at = new Date()) => runDailyCheck({ query: site.query, walk: async () => walk, send, now: () => at });
  const aDayLater = async () => {
    await pool.query(`UPDATE ops_job_outcomes SET started_at = started_at - interval '24 hours', finished_at = finished_at - interval '24 hours'`);
    await pool.query(`UPDATE digest_runs SET last_run_at = last_run_at - interval '24 hours'`);
  };
  const rows = async () => (await pool.query(`SELECT outcome, http_status, counts FROM ops_job_outcomes WHERE job = 'check/daily' ORDER BY id`)).rows;

  it("records, remembers and counts in the tables as they are, with no migration of its own", async () => {
    const mails: Mail[] = [];
    const send = async (mail: Mail) => { mails.push(mail); return null; };
    expect(await readHealth(site.query)).toMatchObject({ daily_check: null, jobs: expect.arrayContaining([expect.objectContaining({ job: "sweep/maintenance", state: "late" })]) });

    expect(await check(send)).toMatchObject({ ok: true, mailed: true });
    expect(mails[0]!.subject).toBe("Cambridge TCG: the daily check is on");
    expect(await rows()).toEqual([{ outcome: "ran", http_status: 200, counts: { mailed: true, owed: false, findings: { example: true } } }]);
    expect((await readHealth(site.query)).daily_check).toMatchObject({ outcome: "ran" });

    // The next day, the same fault and no message: silence. Then someone writes.
    await aDayLater();
    expect(await check(send)).toMatchObject({ mailed: false });
    expect(mails).toHaveLength(1);
    await pool.query(`INSERT INTO public_feedback (feedback_id, holder_key_sha256, kind, message, reply_to, expires_at)
      VALUES ('fb_' || repeat('a', 24), repeat('b', 64), 'general', 'SECRET WORDS', 'person@example.test', now() + interval '180 days')`);
    await check(send);
    expect(mails[1]!.subject).toBe("Cambridge TCG: 1 thing wrong, 1 new message");
    expect(mails[1]!.text).toContain("Messages: 1 new, 1 not marked read, 0 read but not answered.");
    expect(JSON.stringify(mails)).not.toMatch(/SECRET WORDS|person@example/);
    expect(JSON.stringify(await rows())).not.toMatch(/SECRET WORDS|person@example/);
  });

  it("tells of a message that came before a mail that could not count", async () => {
    await pool.query("TRUNCATE ops_job_outcomes, public_feedback, digest_runs");
    const mails: Mail[] = [];
    const run = (query: typeof site.query) => runDailyCheck({ query, walk: async () => ({ ...walk, steps: [], failed: [] }), send: async mail => { mails.push(mail); return null; } });
    await run(site.query);
    await aDayLater();
    await pool.query(`INSERT INTO public_feedback (feedback_id, holder_key_sha256, kind, message, received_at, expires_at)
      VALUES ('fb_' || repeat('c', 24), repeat('d', 64), 'general', 'SECRET WORDS', now() - interval '20 hours', now() + interval '150 days')`);
    await run(async (sql, params) => { if (sql.includes("public_feedback")) throw new Error("no answer in time"); return site.query(sql, params); });
    expect(mails[1]!.text).toContain("Messages: unknown");
    await aDayLater();
    await run(site.query);
    expect(mails[2]!.subject).toBe("Cambridge TCG: 1 new message");
    await pool.query("TRUNCATE ops_job_outcomes, public_feedback, digest_runs");
  });

  it("sends one message when a run is delivered twice, and gives the day back when it could not send", async () => {
    const url = new URL(localUrl!);
    url.searchParams.set("search_path", schema);
    const other = createCompatDb({ url: url.toString(), ssl: false, max: 1 });
    try {
      await pool.query(`INSERT INTO ops_job_outcomes (job, started_at, finished_at, http_status, outcome, counts)
        VALUES ('check/daily', now() - interval '24 hours', now() - interval '24 hours', 200, 'ran', '{"mailed": true, "owed": false, "findings": {}}')`);
      let mails = 0, refuse = true;
      const go = (db: typeof site, ms: number) => runDailyCheck({
        query: db.query, walk: async () => { await new Promise(done => setTimeout(done, ms)); return walk; },
        send: async () => { if (refuse) return "refused"; await new Promise(done => setTimeout(done, 150)); mails++; return null; },
      });
      await other.query("SELECT 1");
      // It could not be sent: owed, and the day's message is free again.
      expect(await go(site, 0)).toMatchObject({ ok: false, outcome: "unavailable:mail-refused" });
      expect((await pool.query(`SELECT last_run_at FROM digest_runs WHERE kind = 'check/daily'`)).rows).toEqual([{ last_run_at: null }]);
      refuse = false;
      await Promise.all([go(site, 120), go(other, 120)]);
      expect(mails).toBe(1);
      // The other either left the record to it, or read it and had nothing more to say.
      expect((await rows()).slice(2).map(row => [row.counts.mailed, row.counts.owed]).filter(([mailed]) => mailed)).toEqual([[true, false]]);
      expect((await rows()).slice(2).some(row => row.counts.owed)).toBe(false);
      // The same fault the next day: nothing is owed by the delivery that did not send.
      await aDayLater();
      expect(await go(site, 0)).toMatchObject({ mailed: false });
      expect(mails).toBe(1);
    } finally { await other.close(); }
    await pool.query("TRUNCATE ops_job_outcomes, digest_runs");
  });

  it("sees a maintenance sweep that keeps failing, and a cron that stopped", async () => {
    await recordMaintenance(new Date(), ["tradeCompletionSweep"], site.query);
    await pool.query(`INSERT INTO ops_job_outcomes (job, started_at, finished_at, http_status, outcome, counts)
      SELECT job, started_at - interval '1 hour', finished_at - interval '1 hour', http_status, outcome, counts FROM ops_job_outcomes WHERE job = 'sweep/maintenance'`);
    expect((await readHealth(site.query)).jobs.find(job => job.job === "sweep/maintenance")).toMatchObject({ state: "failing", last_ran_at: null });
    const mails: Mail[] = [];
    await pool.query(`UPDATE ops_job_outcomes SET started_at = started_at - interval '24 hours', finished_at = finished_at - interval '24 hours' WHERE job = 'check/daily'`);
    await check(async mail => { mails.push(mail); return "refused"; });
    expect(mails[0]!.text).toContain("the maintenance sweep tradeCompletionSweep keeps failing");
    expect((await rows()).at(-1)).toMatchObject({ outcome: "unavailable:mail-refused", http_status: 503, counts: { mailed: false, owed: true } });
    await pool.query(`UPDATE ops_job_outcomes SET started_at = started_at - interval '4 hours', finished_at = finished_at - interval '4 hours' WHERE job = 'sweep/maintenance'`);
    expect((await readHealth(site.query)).jobs.find(job => job.job === "sweep/maintenance")).toMatchObject({ state: "late" });
  });

  it("reads the traffic pull from its own record", async () => {
    vi.stubEnv("TRAFFIC_PULL", "on");
    const state = async () => (await readHealth(site.query)).jobs.find(job => job.job === "pull/traffic")!.state;
    expect(await state()).toBe("late");
    const hour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000).toISOString();
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages, error_code) VALUES ($1, $1::timestamptz + interval '1 hour', 'failed', 0, 0, 'token-refused')`, [hour]);
    expect(await state()).toBe("failing");
    await pool.query(`INSERT INTO traffic_pulls (window_start, window_end, status, records, pages) VALUES ($1, $1::timestamptz + interval '1 hour', 'ok', 5, 1)`, [hour]);
    expect(await state()).toBe("ok");
    vi.unstubAllEnvs();
  });
});
