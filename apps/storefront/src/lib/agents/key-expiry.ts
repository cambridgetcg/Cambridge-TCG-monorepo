/**
 * Agent key expiry: the choice offered at mint, and the one rule for a live
 * key.
 *
 * Each key may carry its own end, chosen by whoever mints it (migration
 * 0151, docs/plans/agent-auth/key-expiry.md). The choices, the 90-day
 * operator default and "NULL means never" for existing keys are an agent's
 * calls under the owner's standing delegation, recorded in that plan; they
 * are not the owner's decisions. Nothing is sent to anyone when a key nears
 * or reaches its end: the operator sees it at /account/agents, and the
 * holder sees it in-band (agent.self's key_expires_at and the
 * X-Agent-Key-Expires header).
 *
 * One parser serves every door that mints a key. Today that is the operator
 * door; the plan for reopening self-serve registration proposes the same
 * wire field, `key_expiry`, and that door stays closed.
 *
 * Clocks. Whether a key is live is decided only in SQL, by the database's
 * clock (NOW(), the transaction's start). A duration is computed there too,
 * at insert, so the mint, the gate, the cap and the CHECK share one clock.
 * Only the date picker's range is checked here, on the app server's clock;
 * the CHECK (expiry after creation) has the last word at insert.
 *
 * Designed against XENIA Covenant 0.1 candidate duty consent.exact-authority
 * (xenia d4727ec); Cambridge TCG has not adopted the Covenant; no adoption
 * record; unassessed. It covers only the expiry bound. No XENIA name or duty
 * id goes on the wire.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fixed lifetimes, by wire value. */
export const KEY_EXPIRY_PRESETS = [
  { value: "7d", days: 7, label: "7 days" },
  { value: "30d", days: 30, label: "30 days" },
  { value: "90d", days: 90, label: "90 days" },
  { value: "365d", days: 365, label: "1 year" },
] as const;

export type KeyExpiryPreset = (typeof KEY_EXPIRY_PRESETS)[number]["value"];

export const KEY_EXPIRY_NEVER = "never";

/** Pre-selected on the operator's forms; never applied by the server. A
 *  mint that states no choice is refused. */
export const OPERATOR_KEY_EXPIRY_DEFAULT: KeyExpiryPreset = "90d";

/** A chosen date may be at most this many days after today (UTC). */
export const KEY_EXPIRY_DATE_MAX_DAYS = 366;

/** Shown beside "never" wherever it can be chosen. */
export const KEY_EXPIRY_NEVER_WARNING =
  "This key keeps working until it is revoked or its agent is suspended or archived. If a copy leaks, it stays usable until then.";

export type KeyExpiry =
  | { kind: "days"; days: (typeof KEY_EXPIRY_PRESETS)[number]["days"] }
  /** Ends at 00:00 UTC on `date` (YYYY-MM-DD). */
  | { kind: "date"; date: string }
  | { kind: "never" };

export type KeyExpiryParse = { ok: true; expiry: KeyExpiry } | { ok: false; error: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** The dates a picker may offer, inclusive, by the given clock in UTC. */
export function keyExpiryDateRange(now: Date = new Date()): { min: string; max: string } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { min: utcDay(today + DAY_MS), max: utcDay(today + KEY_EXPIRY_DATE_MAX_DAYS * DAY_MS) };
}

export const KEY_EXPIRY_CHOICE_ERROR =
  "Choose when the key expires: 7d, 30d, 90d, 365d, never, or a date (YYYY-MM-DD, UTC).";

/**
 * Parse a wire value. Exactly one of `7d`, `30d`, `90d`, `365d`, `never`, or
 * a calendar date `YYYY-MM-DD` from tomorrow to 366 days after today (UTC).
 * Anything else, a missing value included, is refused: no default is
 * applied here.
 */
export function parseKeyExpiry(value: unknown, now: Date = new Date()): KeyExpiryParse {
  if (typeof value !== "string") return { ok: false, error: KEY_EXPIRY_CHOICE_ERROR };
  if (value === KEY_EXPIRY_NEVER) return { ok: true, expiry: { kind: "never" } };
  const preset = KEY_EXPIRY_PRESETS.find((entry) => entry.value === value);
  if (preset) return { ok: true, expiry: { kind: "days", days: preset.days } };

  const match = DATE_RE.exec(value);
  if (!match) return { ok: false, error: KEY_EXPIRY_CHOICE_ERROR };
  const [, year, month, day] = match.map(Number);
  const time = Date.UTC(year, month - 1, day);
  // Date.UTC rolls 2027-02-30 into March; a real date round-trips.
  if (utcDay(time) !== value) return { ok: false, error: KEY_EXPIRY_CHOICE_ERROR };
  const range = keyExpiryDateRange(now);
  // ISO dates of equal length compare as strings.
  if (value < range.min || value > range.max) {
    return {
      ok: false,
      error: `Choose a date from ${range.min} to ${range.max} (UTC); the key stops working at 00:00 UTC on that date.`,
    };
  }
  return { ok: true, expiry: { kind: "date", date: value } };
}

/**
 * The bind values for keyExpiresAtSql, in its parameter order: a lifetime in
 * days, or a date, or neither (never).
 */
export function keyExpiryBinds(expiry: KeyExpiry): [number | null, string | null] {
  if (expiry.kind === "days") return [expiry.days, null];
  if (expiry.kind === "date") return [null, expiry.date];
  return [null, null];
}

/**
 * SQL for agent_keys.expires_at in an INSERT, from two bind parameters
 * (keyExpiryBinds). A lifetime is that many 24-hour days from NOW(), the
 * same NOW() as the row's created_at default, so the database's clock sets
 * both and the stored lifetime is exact whatever the session's time zone
 * (member keys use hours for the same reason). A date ends at 00:00 UTC on
 * that date. Neither gives NULL: never.
 */
export function keyExpiresAtSql(daysParam: number, dateParam: number): string {
  const days = `$${daysParam}::int`;
  const date = `$${dateParam}::date`;
  return `CASE WHEN ${days} IS NOT NULL THEN NOW() + make_interval(hours => 24 * ${days})
              WHEN ${date} IS NOT NULL THEN ${date}::timestamp AT TIME ZONE 'UTC'
         END`;
}

/** A stored expires_at as pg returns it (a Date), as ISO 8601; null for
 *  never. */
export function expiresAtIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

/** Postgres's check_violation, raised by agent_keys_expiry_after_creation
 *  when a chosen date has already begun on the database's clock (the app's
 *  range check ran on a clock a moment behind, around midnight UTC).
 *
 *  The two drivers name the constraint differently: postgres.js, which
 *  production uses through @cambridge-tcg/db/compat, sets `constraint_name`;
 *  node-postgres, which the opt-in test pools use, sets `constraint`. Both
 *  are read. */
export function isExpiryAfterCreationViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, constraint_name, constraint } = err as {
    code?: unknown;
    constraint_name?: unknown;
    constraint?: unknown;
  };
  return (
    code === "23514" && (constraint_name ?? constraint) === "agent_keys_expiry_after_creation"
  );
}

export const KEY_EXPIRY_DATE_PASSED_ERROR =
  "That date has already begun (UTC). Choose a later date.";

// ── The one rule for a live key ──────────────────────────────────────────

const ALIAS_RE = /^[a-z_][a-z0-9_]*$/;

function column(alias: string, name: string): string {
  if (alias === "") return name;
  if (!ALIAS_RE.test(alias)) throw new Error(`invalid SQL alias: ${alias}`);
  return `${alias}.${name}`;
}

/** Not expired, by the database's clock. NULL means never. Pass "" for a
 *  statement that names agent_keys without an alias. */
export function unexpiredAgentKeySql(alias = "k"): string {
  const expiresAt = column(alias, "expires_at");
  return `(${expiresAt} IS NULL OR ${expiresAt} > NOW())`;
}

/** Expired, by the database's clock: exactly the keys unexpiredAgentKeySql
 *  leaves out. A key is expired from its expires_at instant on. */
export function expiredAgentKeySql(alias = "k"): string {
  return `(NOT ${unexpiredAgentKeySql(alias)})`;
}

/**
 * Live: not revoked and not expired, by the database's clock. Every
 * statement that decides whether a key may act or counts the keys that can
 * uses this. Statements that end keys (revocation, archive) select
 * unrevoked keys instead, so an expired key can still be ended; the gate
 * reads unrevoked keys and checks expiry separately, to answer key_expired.
 */
export function liveAgentKeySql(alias = "k"): string {
  return `(${column(alias, "revoked_at")} IS NULL AND ${unexpiredAgentKeySql(alias)})`;
}
