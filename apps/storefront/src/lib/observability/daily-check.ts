/**
 * The daily check (/api/cron/daily-check, 08:40 UTC). It walks one card as a
 * guest (lib/guest-walk.ts; its health step brings in the scheduled jobs),
 * counts the messages waiting at the feedback door, and sends the operator
 * at most one email a day: when something is newly wrong or someone wrote,
 * once a week while either waits, and a first one that proves the path.
 *
 * The email holds counts, links and what the walk found, never a message's
 * words or anyone's data. It needs no database to go out: if the database
 * does not answer, that is what it says. The run records itself as
 * check/daily in ops_job_outcomes: what was wrong by name, and whether a
 * message went out or is owed. /api/v1/health publishes when it last ran, so
 * a walk from outside sees a check that stopped or could not send.
 */

import { guestWalk, walkFailures, type Walk } from "@/lib/guest-walk";
import { within } from "./job-health";
import { recordJobOutcome } from "./job-outcomes";

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
interface Finding { id: string; line: string }
interface Check { at: number; mailed: boolean; owed: boolean; findings: ReadonlySet<string> }
interface Waiting { arrived: number; unread: number; unanswered: number }
export interface Mail { subject: string; text: string }

export interface DailyCheckDeps {
  query?: RunQuery;
  walk?: () => Promise<Walk>;
  /** Sends, or says in a word why it could not. */
  send?: (mail: Mail) => Promise<string | null>;
  now?: () => Date;
}
export interface DailyCheckReport { ok: boolean; mailed: boolean; outcome: string; found: string[] }

const SITE = "https://cambridgetcg.com";
const HOUR = 3_600_000;
/** Seven days, less an hour for when the schedule fires. */
const WEEK = 167 * HOUR;

// A row dated ahead of the database's clock is not believed.
const CHECKS = `SELECT started_at, counts FROM ops_job_outcomes WHERE job = 'check/daily' AND started_at < now() + interval '10 minutes'`;
/** The latest check, the latest whose message went out, and the latest whose message could count what waits. */
export const CHECKS_SQL = `(${CHECKS} ORDER BY started_at DESC LIMIT 1)
  UNION ALL (${CHECKS} AND counts @> '{"mailed": true}' ORDER BY started_at DESC LIMIT 1)
  UNION ALL (${CHECKS} AND counts @> '{"mailed": true}' AND NOT counts->'findings' ? 'database' ORDER BY started_at DESC LIMIT 1)`;
/** Messages at the feedback door: how many, never what they say. */
export const WAITING_SQL = `SELECT (count(*) FILTER (WHERE status = 'received' AND received_at > $1::timestamptz))::int AS arrived,
    (count(*) FILTER (WHERE status = 'received'))::int AS unread, (count(*) FILTER (WHERE status = 'read'))::int AS unanswered
  FROM public_feedback WHERE expires_at > now()`;
/** Maintenance sweeps rejected in two or more recorded hours of the last fifty, and still in the last day. */
export const SWEEPS_SQL = `SELECT sweep FROM ops_job_outcomes, jsonb_object_keys(counts->'rejected') AS sweep
  WHERE job = 'sweep/maintenance' AND started_at > now() - interval '50 hours' GROUP BY sweep HAVING count(DISTINCT date_trunc('hour', started_at)) >= 2 AND max(started_at) > now() - interval '26 hours' ORDER BY sweep`;
/** Emails the queue gave up on in the last day: how many, never to whom. */
export const DEAD_MAIL_SQL = `SELECT count(*)::int AS dead FROM email_queue WHERE status = 'dead' AND last_attempt_at > now() - interval '26 hours'`;

/** What else is read, each with what is said when it cannot be, and what its rows mean. */
const ALSO: readonly [sql: string, id: string, line: string, findings: (rows: Record<string, unknown>[]) => Finding[]][] = [
  [SWEEPS_SQL, "sweeps", "the maintenance record could not be read",
    rows => rows.map(({ sweep }) => ({ id: token(`sweep.${sweep}`), line: `the maintenance sweep ${sweep} keeps failing` }))],
  [DEAD_MAIL_SQL, "mail", "the mail queue could not be read",
    rows => Number(rows[0]?.dead ?? 0) ? [{ id: "mail.dead", line: `${plural(Number(rows[0]!.dead), "email")} to members could not be delivered` }] : []],
];
/** The UTC day's one message. Vercel can deliver a run twice; the first to take
 * this row (0041) sends. It is given back when the message did not go. */
export const CLAIM_SQL = `INSERT INTO digest_runs (kind, last_run_at) VALUES ('check/daily', now())
  ON CONFLICT (kind) DO UPDATE SET last_run_at = now(), updated_at = now()
    WHERE digest_runs.last_run_at IS NULL OR (digest_runs.last_run_at AT TIME ZONE 'UTC')::date <> (now() AT TIME ZONE 'UTC')::date RETURNING kind`;
export const UNCLAIM_SQL = `UPDATE digest_runs SET last_run_at = NULL, updated_at = now() WHERE kind = 'check/daily'`;

const token = (value: string) => value.replace(/[^A-Za-z0-9_.:-]/g, ".").slice(0, 40);
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function check(row: Record<string, unknown> | undefined): Check | null {
  if (!row) return null;
  const counts = (typeof row.counts === "string" ? JSON.parse(row.counts) : row.counts) as Record<string, unknown>;
  return { at: new Date(row.started_at as string | Date).getTime(), mailed: counts.mailed === true, owed: counts.owed === true, findings: new Set(Object.keys((counts.findings as object | undefined) ?? {})) };
}

const walkFindings = (walk: Walk): Finding[] => walk.steps.filter(step => !step.ok)
  .flatMap(step => walkFailures({ ...walk, steps: [step] }).map(id => ({ id: token(id), line: `${step.says} (expected: ${step.asks})` })));

/** One plain operator email over the site's own mail seam (AWS SES), from
 * the sign-in address to the shop's notification address. Never throws. The
 * provider's error text can hold an address, so only a word is kept: one of
 * ours, or the provider's own name for the error, if that is letters only. */
async function sendToOperator(mail: Mail): Promise<string | null> {
  const to = process.env.ADMIN_DIGEST_EMAIL?.trim() || process.env.STORE_NOTIFICATION_EMAIL?.trim();
  if (!to) return "no-address";
  const { resolveTransportName, sendMail } = await import("@cambridge-tcg/email");
  // The console transport prints the address and the message where it runs.
  if (process.env.NODE_ENV === "production" && resolveTransportName("noreply") === "console") return "console-only";
  const from = `Cambridge TCG <${(process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim()}>`;
  const sent = await sendMail({ from, to, ...mail }, { stream: "noreply" });
  if (sent.ok) return sent.transport === "console" ? "console-only" : null;
  if (/not verified/i.test(sent.error)) return "not-verified";
  if (/not configured/i.test(sent.error)) return "not-configured";
  const name = sent.code && sent.code !== "Error" && /^[A-Za-z]{2,40}$/.test(sent.code) ? sent.code : "Refused";
  return name.replace(/(?<=[a-z])(?=[A-Z])/g, "-").toLowerCase();
}

export function composeMail(at: Date, first: boolean, found: readonly Finding[], waiting: Waiting | null): Mail {
  const lines = [...new Set(found.map(finding => finding.line))];
  const parts = [lines.length ? `${plural(lines.length, "thing")} wrong` : "", waiting?.arrived ? plural(waiting.arrived, "new message") : ""].filter(Boolean);
  const left = (waiting?.unread ?? 0) + (waiting?.unanswered ?? 0);
  return {
    subject: `Cambridge TCG: ${first ? "the daily check is on" : parts.join(", ") || `${plural(left, "message")} still waiting`}`,
    text: [
      `The daily check of ${SITE}, ${at.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      ...(first ? ["", "This is the first one, sent so you know it can reach you. Please open the messages link below once, to see that your sign-in works."] : []),
      "", lines.length ? "Wrong now:" : "Nothing found wrong.", ...lines.map(line => `- ${line}`),
      "", waiting ? `Messages: ${waiting.arrived} new, ${waiting.unread} not marked read, ${waiting.unanswered} read but not answered.` : "Messages: unknown, the database did not answer.",
      `${SITE}/admin/feedback`,
      "", `Scheduled jobs: ${SITE}/admin/system/cron`, `What the site says of itself: ${SITE}/api/v1/health`,
      "", "You are sent this when something new is wrong or someone wrote, and once a week while a fault or a message waits. Nothing is sent on other days.",
    ].join("\n"),
  };
}

export async function runDailyCheck(deps: DailyCheckDeps = {}): Promise<DailyCheckReport> {
  const startedAt = deps.now?.() ?? new Date();
  const found = await Promise.resolve().then(deps.walk ?? (() => guestWalk())).then(walkFindings)
    .catch((): Finding[] => [{ id: "walk", line: "the walk itself failed" }]);

  const database = async () => deps.query ?? ((await import("@/lib/db")).query as RunQuery);
  /** The database, once it has answered. */
  let run: RunQuery | null = null;
  let previous: Check | null = null, mailed: Check | null = null, waiting: Waiting | null = null;
  try {
    const query = await database();
    const rows = (await within(10_000, query(CHECKS_SQL))).rows.map(check);
    run = query;
    previous = rows[0] ?? null;
    mailed = rows.find(row => row?.mailed) ?? null;
    // A message is new until a mail that could count it has gone out.
    const told = rows.find(row => row?.mailed && !row.findings.has("database"));
    const counted = (await within(10_000, query(WAITING_SQL, [new Date(told?.at ?? 0).toISOString()]))).rows[0] ?? {};
    waiting = { arrived: Number(counted.arrived ?? 0), unread: Number(counted.unread ?? 0), unanswered: Number(counted.unanswered ?? 0) };
  } catch (error) {
    console.error("[ops/daily-check] the database did not answer:", error instanceof Error ? error.name : "UnknownError");
    found.push({ id: "database", line: "the database did not answer the daily check" });
  }
  // On their own, so that a count that fails hides neither.
  for (const [sql, id, line, findings] of run ? ALSO : []) {
    try { found.push(...findings((await within(10_000, run!(sql))).rows)); }
    catch { found.push({ id, line }); }
  }

  const first = waiting !== null && !mailed;
  // One list decides what is new and what is remembered, or a 26th finding is new every day.
  const kept = [...new Map(found.map(finding => [finding.id, finding])).values()].slice(0, 25);
  const fresh = kept.some(finding => !previous?.findings.has(finding.id));
  const stays = found.length > 0 || (waiting?.unread ?? 0) + (waiting?.unanswered ?? 0) > 0;
  const due = first || fresh || (waiting?.arrived ?? 0) > 0 || (stays && (previous?.owed === true || startedAt.getTime() - (mailed?.at ?? 0) >= WEEK));
  // At most one a day; what is held back is owed to the next run.
  const tooSoon = mailed !== null && day(mailed.at) === day(startedAt.getTime());

  let failure: string | null = null, sent = false;
  if (due && !tooSoon) {
    // The message needs no database: while that is away it goes out unclaimed,
    // and a second delivery can send a second copy.
    const claimed = !run || await within(10_000, run(CLAIM_SQL)).then(({ rows }) => rows.length > 0, () => true);
    // The other delivery of this run has it, and records for both.
    if (!claimed) return { ok: true, mailed: false, outcome: "ran", found: [...new Set(found.map(finding => finding.line))] };
    try { failure = await within(20_000, (deps.send ?? sendToOperator)(composeMail(startedAt, first, found, waiting))); }
    catch { failure = "no-answer"; }
    sent = failure === null;
    if (failure) {
      console.error("[ops/daily-check] the message could not be sent:", failure);
      if (run) await within(5_000, run(UNCLAIM_SQL)).catch(() => undefined);
    }
  }
  const outcome = failure ? `unavailable:mail-${failure}` : "ran";
  const findings = Object.fromEntries(kept.map(finding => [finding.id, true]));
  await within(10_000, recordJobOutcome(
    { job: "check/daily", startedAt, httpStatus: failure ? 503 : 200, outcome, counts: { mailed: sent, owed: due && !sent, findings } },
    deps.query,
  )).catch(() => undefined);
  return { ok: !failure, mailed: sent, outcome, found: [...new Set(found.map(finding => finding.line))] };
}
