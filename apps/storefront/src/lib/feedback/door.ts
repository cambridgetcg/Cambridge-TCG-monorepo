/**
 * The feedback door (POST /api/v1/feedback, also behind the /contact form;
 * migration 0149). A sender chooses what to send; the door keeps it field by
 * named field, each bounded, and never the request body as it came. It keeps
 * no IP address, user agent, cookie, account or session id: the route does
 * not read them, and nothing here would store them.
 *
 * Kinds: question and data-error, and the five the door's signposts already
 * name (contract-drift, guide-feedback, endpoint-suggestion,
 * federation-adopter, general). A data-error names what it is about by
 * endpoint, key (subject), as_of and method version; it should not repeat a
 * source's value, and the door's text says so.
 *
 * Each accepted message gets a random feedback_id to quote and a holder key,
 * shown once in the reply. Only the key's SHA-256 is stored. With the key the
 * sender reads the status and the operator's answer, or erases the row, and
 * that works whether or not the door is taking new messages. A row is kept
 * 180 days from arrival (FEEDBACK_RETENTION_DAYS); reads never return an
 * expired row, and the hourly sweep (retention.ts) deletes it.
 *
 * Abuse control is one global cap, FEEDBACK_HOURLY_CAP accepted messages per
 * UTC hour, counted in feedback_hourly_intake with no sender beside it. A cap
 * per source would need an address, which this app does not keep; any
 * per-source rule belongs at the edge.
 *
 * Off unless PUBLIC_FEEDBACK is exactly "on", and that waits for the /privacy
 * note that names this door (#feedback-door). Nothing here logs: a log line
 * per message would be a second copy of it.
 */

import { createHash, randomBytes } from "node:crypto";

export const FEEDBACK_DOOR_FLAG = "PUBLIC_FEEDBACK";

export function feedbackDoorOpen(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[FEEDBACK_DOOR_FLAG] === "on";
}

/** The notice this door's behaviour is described in. A change to what the
 * door keeps or for how long is a new version and a /privacy edit. */
export const FEEDBACK_NOTICE = { version: "feedback-door/2026-11-06", url: "/privacy#feedback-door" } as const;

export const FEEDBACK_KINDS = ["question", "data-error", "contract-drift", "guide-feedback", "endpoint-suggestion", "federation-adopter", "general"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** The /contact form's topics. */
export const CONTACT_TOPICS = ["general", "order", "trade-in", "site-issue", "partnership"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const FEEDBACK_STATUSES = ["received", "read", "answered", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_REQUEST_MAX_BYTES = 16 * 1024;
export const FEEDBACK_MESSAGE_MAX = 4000;
export const FEEDBACK_HOURLY_CAP = 30;
export const FEEDBACK_RETENTION_DAYS = 180;
export const FEEDBACK_INTAKE_RETENTION_HOURS = 48;

type Rule =
  | { type: "text"; max: number; multiline: boolean }
  | { type: "path" }
  | { type: "token"; pattern: RegExp }
  | { type: "url" }
  | { type: "step" };

const TOKEN = (max: number) => new RegExp(`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,${max - 1}}$`);

/** The references a report can carry beside its message. 0149's
 * feedback_details_valid holds the same names. */
export const FEEDBACK_DETAIL_FIELDS = {
  observed: { type: "text", max: 2000, multiline: true },
  expected: { type: "text", max: 2000, multiline: true },
  observation: { type: "text", max: 2000, multiline: true },
  use_case: { type: "text", max: 2000, multiline: true },
  endpoint: { type: "path" },
  proposed_endpoint: { type: "path" },
  guide_slug: { type: "token", pattern: /^[a-z0-9][a-z0-9-]{0,79}$/ },
  step_number: { type: "step" },
  request_id: { type: "token", pattern: TOKEN(128) },
  subject: { type: "token", pattern: TOKEN(120) },
  as_of: { type: "token", pattern: /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2}))?$/ },
  method_version: { type: "token", pattern: TOKEN(64) },
  platform_name: { type: "text", max: 120, multiline: false },
  platform_url: { type: "url" },
  federation_endpoint: { type: "url" },
} as const satisfies Record<string, Rule>;
export type FeedbackDetailField = keyof typeof FEEDBACK_DETAIL_FIELDS;
const DETAIL_NAMES = Object.keys(FEEDBACK_DETAIL_FIELDS) as FeedbackDetailField[];

/** Older names the door's signposts use, read as the field they mean. */
const ALIASES = { reporter_contact: "reply_to", name: "reply_name", request_id_to_correlate: "request_id" } as const;
const TOP_LEVEL = ["kind", "topic", "message", "reply_to", "reply_name"] as const;
const ACCEPTED = new Set<string>([...TOP_LEVEL, ...DETAIL_NAMES, ...Object.keys(ALIASES)]);
/** Fields with the sender's own words; a report carries at least one. */
const WORDS: readonly string[] = ["message", "observed", "expected", "observation", "use_case", "platform_url", "federation_endpoint"];

export interface FeedbackSubmission {
  kind: FeedbackKind;
  topic: ContactTopic | null;
  message: string | null;
  details: Partial<Record<FeedbackDetailField, string | number>>;
  replyTo: string | null;
  replyName: string | null;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string; field?: string };

const includes = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === "string" && (list as readonly string[]).includes(value);

/** Control characters other than tab and newline, or any line break when
 * the field is one line. */
function badCharacters(text: string, multiline: boolean): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x0a ? !multiline : (c < 0x20 && c !== 0x09) || c === 0x7f) return true;
  }
  return false;
}

/** Trimmed text with Windows line ends folded, or null when empty. */
function words(field: string, value: unknown, max: number, multiline: boolean): Validated<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, field, error: `${field} must be a string` };
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: true, value: null };
  if (text.length > max) return { ok: false, field, error: `${field} is longer than ${max} characters` };
  if (badCharacters(text, multiline)) return { ok: false, field, error: `${field} contains control characters${multiline ? "" : " or a line break"}` };
  return { ok: true, value: text };
}

function detail(field: FeedbackDetailField, value: unknown): Validated<string | number | null> {
  const rule: Rule = FEEDBACK_DETAIL_FIELDS[field];
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  switch (rule.type) {
    case "text":
      return words(field, value, rule.max, rule.multiline);
    case "step": {
      const step = typeof value === "string" && /^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : value;
      return Number.isInteger(step) && (step as number) >= 1 && (step as number) <= 999
        ? { ok: true, value: step as number }
        : { ok: false, field, error: `${field} must be a whole number from 1 to 999, or null` };
    }
    case "path": {
      const path = typeof value === "string" ? value.trim() : "";
      return path.length <= 200 && /^\/[\x21-\x7e]*$/.test(path)
        ? { ok: true, value: path }
        : { ok: false, field, error: `${field} must be a path that starts with / (at most 200 characters, no spaces)` };
    }
    case "token": {
      const token = typeof value === "string" ? value.trim() : "";
      return rule.pattern.test(token) ? { ok: true, value: token } : { ok: false, field, error: `${field} is not in the accepted form` };
    }
    case "url": {
      const text = typeof value === "string" ? value.trim() : "";
      return text.length <= 300 && isHttpsUrl(text) ? { ok: true, value: text } : { ok: false, field, error: `${field} must be an https URL of at most 300 characters` };
    }
  }
}

function isHttpsUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  try { return new URL(text).protocol === "https:"; } catch { return false; }
}

/** An email address or an https URL, one line, as the sender gave it. */
function replyAddress(field: string, value: unknown): Validated<string | null> {
  const text = words(field, value, 254, false);
  if (!text.ok || text.value === null) return text;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.value) || isHttpsUrl(text.value)
    ? text
    : { ok: false, field, error: `${field} must be an email address or an https URL` };
}

/** A field name to quote back in an error: short, plain, or a placeholder. */
const quotable = (name: string) => (/^[A-Za-z0-9_.-]{1,64}$/.test(name) ? name : "(unnamed)");

/** Validates one submission. Every field the door keeps is named here; a
 * field it does not know is refused rather than dropped, so the sender knows
 * exactly what was kept. */
export function validateFeedback(input: unknown): Validated<FeedbackSubmission> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "The body must be a JSON object." };
  const raw = input as Record<string, unknown>;
  const unknown = Object.keys(raw).filter(name => !ACCEPTED.has(name));
  if (unknown.length) {
    return { ok: false, error: `Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.slice(0, 10).map(quotable).join(", ")}. Accepted: ${[...TOP_LEVEL, ...DETAIL_NAMES].join(", ")}.` };
  }
  const body: Record<string, unknown> = { ...raw };
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (!(alias in raw)) continue;
    if (name in raw && raw[name] !== raw[alias]) return { ok: false, field: alias, error: `${alias} and ${name} name the same field; send one.` };
    body[name] = raw[alias];
  }

  if (!includes(FEEDBACK_KINDS, body.kind)) return { ok: false, field: "kind", error: `kind must be one of: ${FEEDBACK_KINDS.join(", ")}.` };
  const kind = body.kind;
  let topic: ContactTopic | null = null;
  if (body.topic !== undefined && body.topic !== null) {
    if (!includes(CONTACT_TOPICS, body.topic)) return { ok: false, field: "topic", error: `topic must be one of: ${CONTACT_TOPICS.join(", ")}.` };
    topic = body.topic;
  }
  const message = words("message", body.message, FEEDBACK_MESSAGE_MAX, true);
  if (!message.ok) return message;
  const replyTo = replyAddress("reply_to", body.reply_to);
  if (!replyTo.ok) return replyTo;
  const replyName = words("reply_name", body.reply_name, 100, false);
  if (!replyName.ok) return replyName;

  const details: FeedbackSubmission["details"] = {};
  for (const field of DETAIL_NAMES) {
    const value = detail(field, body[field]);
    if (!value.ok) return value;
    if (value.value !== null) details[field] = value.value;
  }

  const kept: Record<string, unknown> = { message: message.value, ...details };
  if (!WORDS.some(field => kept[field] !== undefined && kept[field] !== null)) {
    return { ok: false, field: "message", error: `Say something: send a message (or, for older report shapes, observed, expected, observation, use_case or a platform URL).` };
  }
  if (kind === "data-error" && (!details.endpoint || !details.subject)) {
    return { ok: false, field: details.endpoint ? "subject" : "endpoint", error: "A data-error names the endpoint and the key (subject) it is about; add as_of and method_version if you have them." };
  }
  return { ok: true, value: { kind, topic, message: message.value, details, replyTo: replyTo.value, replyName: replyName.value } };
}

/** The names of the fields a submission keeps, for the receipt. */
export function keptFields(submission: FeedbackSubmission): string[] {
  return [
    "kind",
    ...(submission.topic ? ["topic"] : []),
    ...(submission.message ? ["message"] : []),
    ...Object.keys(submission.details),
    ...(submission.replyTo ? ["reply_to"] : []),
    ...(submission.replyName ? ["reply_name"] : []),
  ];
}

// ── Keys ────────────────────────────────────────────────────────────────

export const HOLDER_KEY_PATTERN = /^fbk_[A-Za-z0-9_-]{43}$/;

export const newFeedbackId = () => `fb_${randomBytes(12).toString("hex")}`;
export const newHolderKey = () => `fbk_${randomBytes(32).toString("base64url")}`;
export const holderKeySha256 = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** The holder key from `Authorization: Bearer fbk_…`: absent, malformed, or
 * the key. Only a header carries it, so it never sits in a URL or a log of
 * one. Any other Authorization (an agent key a client sends everywhere, say)
 * is not a holder key and is ignored, so it changes nothing for a reader. */
export function holderKeyFrom(header: string | null): { present: false } | { present: true; key: string | null } {
  const token = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")?.[1];
  if (!token?.startsWith("fbk_")) return { present: false };
  return { present: true, key: HOLDER_KEY_PATTERN.test(token) ? token : null };
}

// ── Storage ─────────────────────────────────────────────────────────────

type RunQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

async function runner(run?: RunQuery): Promise<RunQuery> {
  return run ?? ((await import("@/lib/db")).query as RunQuery);
}

export type DoorUnavailable = "not-provisioned" | "unavailable";
const unavailable = (error: unknown): DoorUnavailable =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01" ? "not-provisioned" : "unavailable";

/** One statement: this hour's intake gains one unless it is at the cap,
 * and the message is kept only if it did. Intake rows past 48 hours go. */
export const FEEDBACK_INSERT_SQL = `WITH swept AS (
    DELETE FROM feedback_hourly_intake WHERE hour < now() - interval '${FEEDBACK_INTAKE_RETENTION_HOURS} hours'
  ), intake AS (
    INSERT INTO feedback_hourly_intake (hour, accepted) VALUES (date_trunc('hour', now(), 'UTC'), 1)
    ON CONFLICT (hour) DO UPDATE SET accepted = feedback_hourly_intake.accepted + 1
      WHERE feedback_hourly_intake.accepted < ${FEEDBACK_HOURLY_CAP}
    RETURNING accepted
  )
  INSERT INTO public_feedback (feedback_id, holder_key_sha256, kind, topic, message, details, reply_to, reply_name, expires_at)
  SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, $8, now() + interval '${FEEDBACK_RETENTION_DAYS} days' FROM intake
  RETURNING received_at, expires_at`;

export const FEEDBACK_HOLDER_READ_SQL = `SELECT feedback_id, kind, topic, message, details, reply_to, reply_name, status, answer, answered_at, received_at, expires_at
  FROM public_feedback WHERE holder_key_sha256 = $1 AND expires_at > now()`;

export const FEEDBACK_HOLDER_ERASE_SQL = `DELETE FROM public_feedback WHERE holder_key_sha256 = $1 RETURNING feedback_id`;

const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();

export type StoreResult =
  | { ok: true; feedbackId: string; holderKey: string; receivedAt: string; expiresAt: string }
  | { ok: false; reason: "capped" | DoorUnavailable };

export async function storeFeedback(submission: FeedbackSubmission, run?: RunQuery): Promise<StoreResult> {
  const feedbackId = newFeedbackId();
  const holderKey = newHolderKey();
  try {
    const result = await (await runner(run))(FEEDBACK_INSERT_SQL, [
      feedbackId, holderKeySha256(holderKey), submission.kind, submission.topic, submission.message,
      JSON.stringify(submission.details), submission.replyTo, submission.replyName,
    ]);
    const row = result.rows[0];
    if (!row) return { ok: false, reason: "capped" };
    return { ok: true, feedbackId, holderKey, receivedAt: iso(row.received_at), expiresAt: iso(row.expires_at) };
  } catch (error) {
    return { ok: false, reason: unavailable(error) };
  }
}

/** What the holder sees: everything kept about the message, and the answer. */
export interface HolderView {
  feedback_id: string;
  kind: FeedbackKind;
  status: FeedbackStatus;
  received_at: string;
  expires_at: string;
  answer: { text: string; answered_at: string } | null;
  held: { topic: ContactTopic | null; message: string | null; details: Record<string, unknown>; reply_to: string | null; reply_name: string | null };
}

function holderView(row: Record<string, unknown>): HolderView {
  const details = typeof row.details === "string" ? JSON.parse(row.details) : row.details;
  return {
    feedback_id: String(row.feedback_id),
    kind: row.kind as FeedbackKind,
    status: row.status as FeedbackStatus,
    received_at: iso(row.received_at),
    expires_at: iso(row.expires_at),
    answer: row.answer ? { text: String(row.answer), answered_at: iso(row.answered_at) } : null,
    held: {
      topic: (row.topic as ContactTopic | null) ?? null,
      message: (row.message as string | null) ?? null,
      details: (details ?? {}) as Record<string, unknown>,
      reply_to: (row.reply_to as string | null) ?? null,
      reply_name: (row.reply_name as string | null) ?? null,
    },
  };
}

export async function readFeedbackForHolder(key: string, run?: RunQuery): Promise<{ ok: true; view: HolderView | null } | { ok: false; reason: DoorUnavailable }> {
  try {
    const result = await (await runner(run))(FEEDBACK_HOLDER_READ_SQL, [holderKeySha256(key)]);
    return { ok: true, view: result.rows[0] ? holderView(result.rows[0]) : null };
  } catch (error) {
    return { ok: false, reason: unavailable(error) };
  }
}

/** Deletes the holder's row, answer and all, at once. An expired row not yet
 * swept goes too. */
export async function eraseFeedbackForHolder(key: string, run?: RunQuery): Promise<{ ok: true; erased: string | null } | { ok: false; reason: DoorUnavailable }> {
  try {
    const result = await (await runner(run))(FEEDBACK_HOLDER_ERASE_SQL, [holderKeySha256(key)]);
    return { ok: true, erased: result.rows[0] ? String(result.rows[0].feedback_id) : null };
  } catch (error) {
    return { ok: false, reason: unavailable(error) };
  }
}

/** Seconds until the next UTC hour, when the cap resets. */
export const secondsToNextHour = (now = Date.now()) => Math.max(1, Math.ceil((3_600_000 - (now % 3_600_000)) / 1000));

// ── Operator ────────────────────────────────────────────────────────────
//
// The other half of the door (/admin/feedback): an admin reads what is held
// and writes the answer the holder reads with the key. The admin page
// passes these to adminAction, whose governance log records the feedback_id
// and the verb, never the message or the answer.

export const FEEDBACK_ID_PATTERN = /^fb_[0-9a-f]{24}$/;
export const FEEDBACK_OPERATOR_STATUSES = ["read", "closed"] as const;
export type FeedbackOperatorStatus = (typeof FEEDBACK_OPERATOR_STATUSES)[number];

export const FEEDBACK_OPERATOR_LIST_SQL = `SELECT feedback_id, kind, topic, message, details, reply_to, reply_name, status, answer, answered_at, received_at, expires_at
  FROM public_feedback WHERE expires_at > now()
  ORDER BY (status IN ('received', 'read')) DESC, received_at DESC LIMIT 100`;
export const FEEDBACK_ANSWER_SQL = `UPDATE public_feedback SET status = 'answered', answer = $2, answered_at = now()
  WHERE feedback_id = $1 AND expires_at > now() RETURNING feedback_id`;
export const FEEDBACK_STATUS_SQL = `UPDATE public_feedback SET status = $2
  WHERE feedback_id = $1 AND expires_at > now() RETURNING feedback_id`;
export const FEEDBACK_OPERATOR_DELETE_SQL = `DELETE FROM public_feedback WHERE feedback_id = $1 RETURNING feedback_id`;

export async function listFeedbackForOperator(run?: RunQuery): Promise<{ ok: true; rows: HolderView[] } | { ok: false; reason: DoorUnavailable }> {
  try {
    const result = await (await runner(run))(FEEDBACK_OPERATOR_LIST_SQL);
    return { ok: true, rows: result.rows.map(holderView) };
  } catch (error) {
    return { ok: false, reason: unavailable(error) };
  }
}

/** The answer the holder will read, checked like the sender's own words. */
export function validateAnswer(feedbackId: unknown, answer: unknown): Validated<{ feedbackId: string; answer: string }> {
  if (typeof feedbackId !== "string" || !FEEDBACK_ID_PATTERN.test(feedbackId)) return { ok: false, field: "feedback_id", error: "Not a feedback id." };
  const text = words("answer", answer, FEEDBACK_MESSAGE_MAX, true);
  if (!text.ok) return text;
  if (!text.value) return { ok: false, field: "answer", error: "Write an answer first." };
  return { ok: true, value: { feedbackId, answer: text.value } };
}

/** Runs one operator change; false when no unexpired row has the id. */
export async function changeFeedback(sql: string, params: unknown[], run?: RunQuery): Promise<boolean> {
  return ((await (await runner(run))(sql, params)).rows.length) > 0;
}
