import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Walk } from "@/lib/guest-walk";
import { CHECKS_SQL, SWEEPS_SQL, WAITING_SQL, runDailyCheck, type Mail } from "./daily-check";

const sendMail = vi.hoisted(() => vi.fn());
vi.mock("@cambridge-tcg/email", () => ({ sendMail }));

const NOW = new Date("2026-11-25T08:40:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const step = (id: string, ok: boolean, parts: string[] = []) => ({ id, asks: `the ${id} step holds`, ok, says: ok ? "it does" : "HTTP 404", parts });
const walked = (...failed: ReturnType<typeof step>[]): Walk => ({ base: "https://cambridgetcg.com", startedAt: NOW.toISOString(), ms: 9, steps: [step("home", true), ...failed], failed: failed.map(entry => entry.id) });
const past = (hours: number, counts: Record<string, unknown>) => ({ started_at: ago(hours), counts });

interface Given { walk?: Walk; checks?: Record<string, unknown>[]; waiting?: Record<string, number>; sweeps?: string[]; down?: boolean; fails?: string }
async function check(given: Given) {
  const mails: Mail[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (given.down) throw Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" });
    if (sql === CHECKS_SQL) return { rows: given.checks ?? [] };
    if (sql === WAITING_SQL) return { rows: [{ arrived: 0, unread: 0, unanswered: 0, ...given.waiting }] };
    if (sql === SWEEPS_SQL) return { rows: (given.sweeps ?? []).map(sweep => ({ sweep })) };
    return { rows: [] };
  });
  const report = await runDailyCheck({ query, now: () => NOW, walk: async () => given.walk ?? walked(), send: async mail => { mails.push(mail); return given.fails ?? null; } });
  const insert = query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes"));
  return { report, mails, mail: mails[0], record: insert ? { outcome: insert[1]![4], status: insert[1]![3], counts: JSON.parse(insert[1]![5] as string) } : null, query };
}
const MAILED = past(24, { mailed: true, owed: false, findings: {} });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("the daily check", () => {
  it("sends a first message even when nothing is wrong, and nothing on the next quiet day", async () => {
    const first = await check({});
    expect(first.mail.subject).toBe("Cambridge TCG: the daily check is on");
    expect(first.mail.text).toContain("Nothing found wrong.");
    expect(first.record).toEqual({ outcome: "ran", status: 200, counts: { mailed: true, owed: false, findings: {} } });
    const quiet = await check({ checks: [MAILED, MAILED] });
    expect(quiet.mails).toEqual([]);
    expect(quiet.record).toEqual({ outcome: "ran", status: 200, counts: { mailed: false, owed: false, findings: {} } });
  });

  it("sends what is newly wrong once, then weekly while it stays", async () => {
    const walk = walked(step("example", false), step("health", false, ["collect/cardrush", "derive/market"]));
    const broke = await check({ walk, checks: [MAILED, MAILED] });
    expect(broke.mail.subject).toBe("Cambridge TCG: 2 things wrong");
    expect(broke.mail.text).toContain("- HTTP 404 (expected: the example step holds)");
    expect(broke.record!.counts.findings).toEqual({ example: true, "health.collect.cardrush": true, "health.derive.market": true });
    const same = past(24, broke.record!.counts);
    expect((await check({ walk, checks: [same, same] })).mails).toEqual([]);
    const quiet = past(24, { ...broke.record!.counts, mailed: false });
    expect((await check({ walk, checks: [quiet, past(24 * 6, { mailed: true })] })).mails).toEqual([]);
    expect((await check({ walk, checks: [quiet, past(24 * 7, { mailed: true })] })).mails).toHaveLength(1);
    // Mended, then broken again: new again.
    expect((await check({ walk, checks: [past(24, { mailed: false, findings: {} }), past(48, { mailed: true })] })).mails).toHaveLength(1);
  });

  it("sends when someone wrote: counts and a link, none of the words", async () => {
    const wrote = await check({ checks: [MAILED, MAILED], waiting: { arrived: 1, unread: 2, unanswered: 1 } });
    expect(wrote.mail.subject).toBe("Cambridge TCG: 1 new message");
    expect(wrote.mail.text).toContain("Messages: 1 new, 2 not marked read, 1 read but not answered.\nhttps://cambridgetcg.com/admin/feedback");
    expect(wrote.query.mock.calls.find(([sql]) => sql === WAITING_SQL)![1]).toEqual([ago(24)]);
    expect(WAITING_SQL).not.toMatch(/\bmessage\b|reply_to|reply_name|details/);
    expect((await check({ checks: [past(24, {}), past(24 * 8, { mailed: true })], waiting: { unread: 1, unanswered: 1 } })).mail.subject).toBe("Cambridge TCG: 2 messages still waiting");
  });

  it("names a maintenance sweep that keeps failing", async () => {
    const swept = await check({ checks: [MAILED, MAILED], sweeps: ["tradeCompletionSweep"] });
    expect(swept.mail.text).toContain("the maintenance sweep tradeCompletionSweep keeps failing");
    expect(swept.record!.counts.findings).toEqual({ "sweep.tradeCompletionSweep": true });
  });

  it("still sends when the database does not answer, and says so", async () => {
    const down = await check({ down: true, walk: walked(step("health", false)) });
    expect(down.mail.subject).toBe("Cambridge TCG: 2 things wrong");
    expect(down.mail.text).toContain("the database did not answer the daily check");
    expect(down.mail.text).toContain("Messages: unknown");
    expect(down.mail.text).not.toContain("10.1.2.3");
    expect(down.report).toMatchObject({ ok: true, mailed: true });
  });

  it("owes a message it could not send, says so in its record, and sends it next time", async () => {
    const failed = await check({ walk: walked(step("example", false)), checks: [MAILED, MAILED], fails: "refused" });
    expect(failed.report).toMatchObject({ ok: false, mailed: false, outcome: "unavailable:mail-refused" });
    expect(failed.record).toMatchObject({ outcome: "unavailable:mail-refused", status: 503, counts: { mailed: false, owed: true } });
    const next = await check({ walk: walked(step("example", false)), checks: [past(24, failed.record!.counts), past(48, { mailed: true })] });
    expect(next.mails).toHaveLength(1);
    // Owed, but mended since: there is nothing left to say.
    expect((await check({ checks: [past(24, failed.record!.counts), past(48, { mailed: true })] })).mails).toEqual([]);
  });

  it("never sends two in a day: a second run owes it to the next", async () => {
    const hourLater = past(1, { mailed: true, findings: {} });
    const again = await check({ walk: walked(step("example", false)), checks: [hourLater, hourLater] });
    expect(again.mails).toEqual([]);
    expect(again.record!.counts).toEqual({ mailed: false, owed: true, findings: { example: true } });
  });

  it("sends plain text from the sign-in address to the notification address, and keeps no provider text", async () => {
    vi.stubEnv("ADMIN_DIGEST_EMAIL", "");
    vi.stubEnv("STORE_NOTIFICATION_EMAIL", "owner@example.test ");
    vi.stubEnv("AUTH_FROM_EMAIL", "noreply@example.test");
    const run = (result: unknown) => { sendMail.mockReset().mockResolvedValue(result); return runDailyCheck({ query: async () => ({ rows: [] }), now: () => NOW, walk: async () => walked() }); };
    expect(await run({ ok: true, messageId: "1", transport: "ses" })).toMatchObject({ ok: true, mailed: true });
    expect(sendMail).toHaveBeenCalledWith({ from: "Cambridge TCG <noreply@example.test>", to: "owner@example.test", subject: expect.any(String), text: expect.any(String) }, { stream: "noreply" });
    expect((await run({ ok: false, error: "Email address is not verified: owner@example.test", transport: "ses" })).outcome).toBe("unavailable:mail-not-verified");
    expect((await run({ ok: true, messageId: "1", transport: "console" })).outcome).toBe("unavailable:mail-console-only");
    vi.stubEnv("STORE_NOTIFICATION_EMAIL", "");
    expect((await run(null)).outcome).toBe("unavailable:mail-no-address");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("owner@example.test");
  });
});
