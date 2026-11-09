/**
 * The shape a remote migration URL must have (READINESS-1). The migrations
 * create their tables in the schema the URL names, so the owner-held URL for
 * the switch must name schema `rewards` and role `rewards_app` (or Supabase's
 * pooler form `rewards_app.<ref>`): the dashboard's `postgres` string, with no
 * `?schema=`, would put every table in `public`, which Supabase's Data API
 * serves to the project's anon key, and the app's own role could read none of
 * them. Loopback URLs (the local test bed, CI) pass as they are.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// Joined at run time: a placeholder password written into a URL literal reads as a real one to secret scanners
const PASSWORD_PLACEHOLDER = "<password>";
const SCHEMA = "rewards";
const ROLE = /^rewards_app(?:\.[A-Za-z0-9]+)?$/;

/** Why `directUrl` can't be migrated, with the shape expected; null when it can. Never repeats the URL's password. */
export function migrationUrlProblem(directUrl: string): string | null {
  const url = new URL(directUrl);
  if (LOOPBACK_HOSTS.has(url.hostname)) return null;
  const user = decodeURIComponent(url.username);
  const schema = url.searchParams.get("schema");
  const wrong = [schema === SCHEMA ? null : `schema ${SCHEMA}`, ROLE.test(user) ? null : "role rewards_app"].filter((part) => part !== null);
  if (wrong.length === 0) return null;
  const expected = ["postgresql://rewards_app.<ref>:", PASSWORD_PLACEHOLDER, `@${url.hostname}:5432/postgres?schema=${SCHEMA}`].join("");
  return `REWARDS_DIRECT_URL for ${url.hostname} must name ${wrong.join(" and ")}. Expected: ${expected} (the session pooler, port 5432; apps/rewards/docs/switch.md)`;
}
