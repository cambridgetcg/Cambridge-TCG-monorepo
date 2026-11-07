/**
 * A UUID, as every row id is (A21-F8): ids from a URL or a form are checked
 * against it before any read, so a malformed one never reaches Postgres's
 * uuid cast, which would fail the query rather than find nothing.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
