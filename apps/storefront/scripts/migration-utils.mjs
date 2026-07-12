/** Pure helpers shared by the migration runner and its offline contract test. */

export function parseOnlyMigrationNames(raw, availableFiles) {
  if (raw === null) return [...availableFiles];
  if (typeof raw !== "string" || raw.startsWith("--")) {
    throw new Error("--only requires a comma-separated list of unique migration filenames");
  }
  const requested = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (
    requested.length === 0 ||
    new Set(requested).size !== requested.length ||
    requested.some((name) => !/^\d{4}_[a-z0-9_-]+\.sql$/.test(name))
  ) {
    throw new Error("--only requires a comma-separated list of unique migration filenames");
  }
  const unknown = requested.filter((name) => !availableFiles.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown migration(s): ${unknown.join(", ")}`);
  }
  return requested.sort();
}

export function withoutOwnedTransaction(sql, file) {
  // Preserve a UTF-8 BOM and any leading whitespace/comments. The runner owns
  // the transaction so the schema change and schema_migrations row are atomic.
  const leading = /^(\uFEFF?(?:(?:\s+)|(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/))*)BEGIN;\s*/i;
  const trailing = /\s*COMMIT;\s*$/i;
  const hasLeading = leading.test(sql);
  const hasTrailing = trailing.test(sql);
  if (hasLeading !== hasTrailing) {
    throw new Error(`${file} has only one transaction boundary; refusing to apply it`);
  }
  if (!hasLeading) return sql;
  return sql.replace(leading, "$1").replace(trailing, "");
}
