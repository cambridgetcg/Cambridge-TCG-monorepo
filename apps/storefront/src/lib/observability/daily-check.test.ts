import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Walk } from "@/lib/guest-walk";
import { CHECKS_SQL, CLAIM_SQL, DEAD_MAIL_SQL, SWEEPS_SQL, UNCLAIM_SQL, WAITING_SQL, runDailyCheck, type Mail } from "./daily-check";

const sendMail = vi.hoisted(() => vi.fn());
const transport = vi.hoisted(() => vi.fn(() => "ses"));
vi.mock("@cambridge-tcg/email", () => ({ sendMail, resolveTransportName: transport }));

const NOW = new Date("2026-11-25T08:40:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const step = (id: string, ok: boolean, parts: string[] = []) => ({ id, asks: `the ${id} step holds`, ok, says: ok ? "it does" : "HTTP 404", parts });
const walked = (...failed: ReturnType<typeof step>[]): Walk => ({ base: "https://cambridgetcg.com", startedAt: NOW.toISOString(), ms: 9, steps: [step("home", true), ...failed], failed: failed.map(entry => entry.id) });
const past = (hours: number, counts: Record<string, unknown>) => ({ started_at: ago(hours), counts });

interface Given { walk?: Walk | (() => Promise<Walk>); dead?: number; broken?: string; checks?: Record<string, unknown>[]; waiting?: Record<string, number>; sweeps?: string[]; down?: boolean; fails?: string; taken?: boolean }
async function check(given: Given) {
  const mails: Mail[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (given.broken === sql) throw new Error("no answer in time");
    if (given.down) throw Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" });
    if (sql === CHECKS_SQL) return { rows: given.checks ?? [] };
    if (sql === WAITING_SQL) return { rows: [{ arrived: 0, unread: 0, unanswered: 0, ...given.waiting }] };
    if (sql === SWEEPS_SQL) return { rows: (given.sweeps ?? []).map(sweep => ({ sweep })) };
    if (sql === DEAD_MAIL_SQL) return { rows: [{ dead: given.dead ?? 0 }] };
    if (sql === CLAIM_SQL) return { rows: given.taken ? [] : [{ kind: "check/daily" }] };
    return { rows: [] };
  });
  const report = await runDailyCheck({ query, now: () => NOW, walk: typeof given.walk === "function" ? given.walk : async () => (given.walk as Walk | undefined) ?? walked(), send: async mail => { mails.push(mail); return given.fails ?? null; } });
  const insert = query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO ops_job_outcomes"));
  const ran = (sql: string) => query.mock.calls.some(([text]) => text === sql);
  return { report, mails, mail: mails[0], claimed: ran(CLAIM_SQL), gaveBack: ran(UNCLAIM_SQL), record: insert ? { outcome: insert[1]![4], status: insert[1]![3], counts: JSON.parse(insert[1]![5] as string) } : null, query };
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

  it("calls a message new until a mail that could count it has gone out", async () => {
    const uncounted = past(24, { mailed: true, owed: false, findings: { database: true } });
    const next = await check({ checks: [uncounted, uncounted, past(48, { mailed: true, findings: {} })], waiting: { arrived: 1, unread: 1 } });
    expect(next.query.mock.calls.find(([sql]) => sql === WAITING_SQL)![1]).toEqual([ago(48)]);
    expect(next.mail.subject).toBe("Cambridge TCG: 1 new message");
  });

  it("does not call a 26th finding new every day, and spends no place on one named twice", async () => {
    const walk = walked(step("prices", false, ["a", "a"]), ...Array.from({ length: 29 }, (_, index) => step(`s${index}`, false)));
    const broke = await check({ walk, checks: [MAILED, MAILED, MAILED] });
    expect(Object.keys(broke.record!.counts.findings)).toHaveLength(25);
    const same = past(24, broke.record!.counts);
    expect((await check({ walk, checks: [same, same, same] })).mails).toEqual([]);
  });

  it("names a maintenance sweep that keeps failing", async () => {
    const swept = await check({ checks: [MAILED, MAILED], sweeps: ["tradeCompletionSweep"] });
    expect(swept.mail.text).toContain("the maintenance sweep tradeCompletionSweep keeps failing");
    expect(swept.record!.counts.findings).toEqual({ "sweep.tradeCompletionSweep": true });
  });

  it("names emails the queue gave up on, and what could not be read, each on its own", async () => {
    const dead = await check({ checks: [MAILED, MAILED], dead: 2 });
    expect(dead.mail.text).toContain("- 2 emails to members could not be delivered");
    expect(dead.record!.counts.findings).toEqual({ "mail.dead": true });
    const swept = await check({ checks: [MAILED, MAILED], sweeps: ["market"], dead: 1, broken: WAITING_SQL });
    expect(Object.keys(swept.record!.counts.findings)).toEqual(["database", "sweep.market", "mail.dead"]);
    expect(Object.keys((await check({ checks: [MAILED, MAILED], broken: SWEEPS_SQL })).record!.counts.findings)).toEqual(["sweeps"]);
  });

  it("sends when the walk itself fails, and takes a name that is not a name", async () => {
    const failed = await check({ checks: [MAILED, MAILED], walk: async () => { throw new TypeError("not a function"); } });
    expect(failed.mail.text).toContain("- the walk itself failed");
    expect(failed.record!.counts.findings).toEqual({ walk: true });
    const odd = await check({ checks: [MAILED, MAILED], walk: walked(step("health", false, [undefined as unknown as string])) });
    expect(odd.record!.counts.findings).toEqual({ "health.undefined": true });
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

  it("sends the next morning after an afternoon's run by hand", async () => {
    const afternoon = past(17, { mailed: true, findings: {} });
    expect((await check({ walk: walked(step("example", false)), checks: [afternoon, afternoon] })).mails).toHaveLength(1);
  });

  it("never sends two in a day: a second run owes it to the next", async () => {
    const hourLater = past(1, { mailed: true, findings: {} });
    const again = await check({ walk: walked(step("example", false)), checks: [hourLater, hourLater] });
    expect(again.mails).toEqual([]);
    expect(again.record!.counts).toEqual({ mailed: false, owed: true, findings: { example: true } });
  });

  it("sends once when one run is delivered twice, and leaves the record to the delivery that sent", async () => {
    const second = await check({ walk: walked(step("example", false)), checks: [MAILED, MAILED], taken: true });
    expect(second.mails).toEqual([]);
    expect(second.record).toBeNull();
    expect(second.report).toMatchObject({ ok: true, mailed: false, outcome: "ran" });
  });

  it("takes the day's message only when one is due, and gives it back only when it did not go", async () => {
    const quiet = await check({ checks: [MAILED, MAILED] });
    expect([quiet.claimed, quiet.gaveBack]).toEqual([false, false]);
    const sent = await check({ walk: walked(step("example", false)), checks: [MAILED, MAILED] });
    expect([sent.claimed, sent.gaveBack]).toEqual([true, false]);
    const refused = await check({ walk: walked(step("example", false)), checks: [MAILED, MAILED], fails: "refused" });
    expect([refused.claimed, refused.gaveBack]).toEqual([true, true]);
  });

  it("sends plain text from the sign-in address to the notification address, and keeps no provider text", async () => {
    vi.stubEnv("ADMIN_DIGEST_EMAIL", "");
    vi.stubEnv("STORE_NOTIFICATION_EMAIL", "owner@example.test ");
    vi.stubEnv("AUTH_FROM_EMAIL", "noreply@example.test");
    const run = (result: unknown) => { sendMail.mockReset().mockResolvedValue(result); return runDailyCheck({ query: async sql => ({ rows: sql === CLAIM_SQL ? [{ kind: "check/daily" }] : [] }), now: () => NOW, walk: async () => walked() }); };
    expect(await run({ ok: true, messageId: "1", transport: "ses" })).toMatchObject({ ok: true, mailed: true });
    expect(sendMail).toHaveBeenCalledWith({ from: "Cambridge TCG <noreply@example.test>", to: "owner@example.test", subject: expect.any(String), text: expect.any(String) }, { stream: "noreply" });
    expect((await run({ ok: false, error: "Email address is not verified: owner@example.test", transport: "ses" })).outcome).toBe("unavailable:mail-not-verified");
    // The provider's own name for it tells a dead key from a right that is missing.
    const named = async (code?: string) => (await run({ ok: false, error: "no, for owner@example.test", code, transport: "ses" })).outcome;
    expect(await named("AccessDenied")).toBe("unavailable:mail-access-denied");
    expect(await named("InvalidClientTokenId")).toBe("unavailable:mail-invalid-client-token-id");
    for (const other of [undefined, "", "Error", "owner@example.test", "Access Denied", "A".repeat(41)]) expect(await named(other)).toBe("unavailable:mail-refused");
    expect((await run({ ok: true, messageId: "1", transport: "console" })).outcome).toBe("unavailable:mail-console-only");
    // In production that transport would print the address, so it is not asked to send.
    vi.stubEnv("NODE_ENV", "production");
    transport.mockReturnValueOnce("console");
    expect((await run({ ok: true, messageId: "1", transport: "console" })).outcome).toBe("unavailable:mail-console-only");
    expect(sendMail).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORE_NOTIFICATION_EMAIL", "");
    expect((await run(null)).outcome).toBe("unavailable:mail-no-address");
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("owner@example.test");
  });
});
