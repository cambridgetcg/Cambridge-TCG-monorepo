/**
 * Whether a PostgreSQL error means "these migrations are not applied here"
 * rather than a fault, for the derivation job and the data-API readers.
 *
 * 42P01 (undefined_table) is not provisioned: every table these statements
 * name arrives with a migration. 42703 (undefined_column) is not provisioned
 * only for a column the caller names, the 0139 columns it reads from tables
 * that existed before (member_price_source_releases, member_price_observations).
 * Any other undefined column is a defect in the statement and is reported as
 * the failure it is, never as missing storage.
 *
 * PostgreSQL names the column only in the message text ("column "x" does not
 * exist", "column t.x does not exist", "column "x" of relation "t" does not
 * exist"), in English unless lc_messages says otherwise. A message this does
 * not recognise counts as a failure, the safer side.
 */
const UNDEFINED_COLUMN = /^column (?:"([^"]+)"|[^\s."]+\.([^\s."]+)) (?:of relation "[^"]+" )?does not exist/;

export function undefinedColumnName(error: unknown): string | null {
  if (!error || typeof error !== "object" || (error as { code?: unknown }).code !== "42703") return null;
  const message = (error as { message?: unknown }).message;
  const match = typeof message === "string" ? UNDEFINED_COLUMN.exec(message) : null;
  return match ? (match[1] ?? match[2] ?? null) : null;
}

export function isNotProvisioned(error: unknown, provisionedColumns: readonly string[]): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code === "42P01") return true;
  const column = undefinedColumnName(error);
  return column !== null && provisionedColumns.includes(column);
}
