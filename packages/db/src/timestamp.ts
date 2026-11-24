/**
 * @module @cambridge-tcg/db/timestamp
 *
 * A timestamp as this package's queries return it, as a Date.
 *
 * drizzle() replaces postgres.js's date parsers on the client it is given
 * with ones that pass the text through, and createDb gives it the shared
 * client. So a timestamptz column read through `query()`, `transaction()`,
 * `client` or `db.execute(sql`…`)` is Postgres text,
 * "2026-07-11 09:30:00.123456+00": not a Date, and not ISO 8601. A DATE column
 * is "2026-07-11". Only a drizzle typed select gives a Date. node-postgres,
 * which some tests and scripts use, gives a Date for both.
 *
 * Pure, with no imports, so a module that a browser bundle holds may use it.
 */

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|([+-])(\d{2})(?::(\d{2}))?)$/;

/** The moment a Date, Postgres timestamptz text or ISO 8601 text names, or
 * null for anything else. A day or time that does not exist is null: Date
 * would roll 30 February into March. */
export function dbTimestamp(value: unknown): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const parts = typeof value === "string" ? TIMESTAMP.exec(value) : null;
  if (!parts) return null;
  const [, day, time, fraction = "", sign, offsetHours = "00", offsetMinutes = "00"] = parts;
  if (Number(offsetHours) > 23 || Number(offsetMinutes) > 59) return null;
  // The local fields read as UTC: the one ISO form every engine parses alike.
  const local = new Date(`${day}T${time}.${fraction.slice(0, 3).padEnd(3, "0")}Z`);
  if (!Number.isFinite(local.getTime()) || local.toISOString().slice(0, 19) !== `${day}T${time}`) return null;
  const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000;
  return new Date(local.getTime() - (sign === "-" ? -offset : offset));
}
