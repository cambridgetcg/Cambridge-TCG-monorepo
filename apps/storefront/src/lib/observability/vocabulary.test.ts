import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTOR_CLASSES, CACHE_RESULTS, CLASSIFIER_VERSIONS, ERROR_TAGS, HOST_CLASSES, MCP_METHODS, MCP_OUTCOMES, MCP_TOOLS,
  PATH_GROUPS, STATUS_CLASSES, TRAFFIC_PULL_STATUSES, WAF_ACTIONS, statusClass,
} from "./vocabulary";

// The lists the database refuses anything outside of, read from the
// migrations themselves, so a word added on one side only fails here first.
// A list is 0148's unless a later migration re-adds that column's CHECK
// under the name PostgreSQL gave it (0150 does for mcp_daily.tool); then the
// newest such migration holds it.
const drizzle = new URL("../../../drizzle/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, drizzle), "utf8");
const ORIGIN = "0148_ops_observability.sql";
const LATER = readdirSync(drizzle).filter((name) => /^\d{4}_.+\.sql$/.test(name) && name > ORIGIN).sort().reverse();
const IN_LIST = "IN \\(((?:'(?:[^']|'')*'(?:, )?)+)\\)\\)";
const words = (list: string) => [...list.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1]!.replaceAll("''", "'"));
function checkList(table: string, column: string): { file: string; words: string[] } {
  for (const file of LATER) {
    const list = new RegExp(`ADD CONSTRAINT ${table}_${column}_check\\s+CHECK \\(${column} ${IN_LIST}`).exec(read(file))?.[1];
    if (list) return { file, words: words(list) };
  }
  const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(read(ORIGIN))?.[1];
  if (!body) throw new Error(`no table ${table}`);
  const list = new RegExp(`CHECK \\(${column} ${IN_LIST}`).exec(body)?.[1];
  if (!list) throw new Error(`no IN check for ${table}.${column}`);
  return { file: ORIGIN, words: words(list) };
}

const LISTS = [
  ["mcp_daily", "method", MCP_METHODS],
  ["mcp_daily", "tool", MCP_TOOLS],
  ["mcp_daily", "outcome", MCP_OUTCOMES],
  ["traffic_hourly", "host_class", HOST_CLASSES],
  ["traffic_hourly", "path_group", PATH_GROUPS],
  ["traffic_hourly", "actor_class", ACTOR_CLASSES],
  ["traffic_hourly", "classifier_version", CLASSIFIER_VERSIONS],
  ["traffic_hourly", "status_class", STATUS_CLASSES],
  ["traffic_hourly", "cache_result", CACHE_RESULTS],
  ["traffic_hourly", "waf_action", WAF_ACTIONS],
  ["traffic_pulls", "status", TRAFFIC_PULL_STATUSES],
  ["error_daily", "tag", ERROR_TAGS],
] as const;

describe("observability vocabulary", () => {
  it.each(LISTS)("%s.%s matches its list in the newest migration that sets it, word for word", (table, column, list) => {
    expect(checkList(table, column).words).toEqual([...list]);
    expect(new Set(list).size).toBe(list.length);
  });

  it("reads mcp_daily.tool from 0150 and every other list from 0148", () => {
    for (const [table, column] of LISTS) {
      expect(checkList(table, column).file).toBe(table === "mcp_daily" && column === "tool" ? "0150_mcp_daily_agent_revoke_key.sql" : ORIGIN);
    }
    // 0150 adds one word and drops none, so a word dropped from both the code
    // and 0150 still fails here.
    const before = words(new RegExp(`CHECK \\(tool ${IN_LIST}`).exec(read(ORIGIN))![1]!);
    const after = checkList("mcp_daily", "tool").words;
    expect(after.filter((word) => !before.includes(word))).toEqual(["agent.revoke_key"]);
    expect(before.filter((word) => !after.includes(word))).toEqual([]);
  });

  it("holds route templates, never a concrete path, and no word that could carry an identifier", () => {
    for (const group of PATH_GROUPS) {
      expect(group.length).toBeLessThanOrEqual(40);
      // No digits (a SKU, a set code, an id) beyond the API's version, and no query string.
      expect(group.replace(/^\/api\/v1\//, "/api/")).not.toMatch(/[0-9?=&]/);
    }
    for (const word of [...ACTOR_CLASSES, ...ERROR_TAGS, ...HOST_CLASSES, ...MCP_OUTCOMES]) expect(word).toMatch(/^[a-z][a-z0-9/-]*$/);
  });

  it("keeps the status codes the panels read apart, and classes the rest", () => {
    expect([200, 204, 304, 307, 401, 403, 404, 405, 429, 500, 502, 503, 99, 600, 1.5].map(statusClass))
      .toEqual(["2xx", "2xx", "304", "3xx", "401", "403", "404", "4xx", "429", "500", "5xx", "503", "other", "other", "other"]);
  });
});
