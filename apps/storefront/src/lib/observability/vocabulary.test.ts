import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTOR_CLASSES, CACHE_RESULTS, CLASSIFIER_VERSIONS, ERROR_TAGS, HOST_CLASSES, MCP_METHODS, MCP_OUTCOMES, MCP_TOOLS,
  PATH_GROUPS, STATUS_CLASSES, TRAFFIC_PULL_STATUSES, WAF_ACTIONS, statusClass,
} from "./vocabulary";

// The lists the database refuses anything outside of, read from the
// migration itself, so a word added on one side only fails here first.
const migration = readFileSync(new URL("../../../drizzle/0148_ops_observability.sql", import.meta.url), "utf8");
function checkList(table: string, column: string): string[] {
  const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(migration)?.[1];
  if (!body) throw new Error(`no table ${table}`);
  const list = new RegExp(`CHECK \\(${column} IN \\(((?:'(?:[^']|'')*'(?:, )?)+)\\)\\)`).exec(body)?.[1];
  if (!list) throw new Error(`no IN check for ${table}.${column}`);
  return [...list.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1]!.replaceAll("''", "'"));
}

describe("observability vocabulary", () => {
  it.each([
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
  ] as const)("%s.%s matches its list in 0148, word for word", (table, column, words) => {
    expect(checkList(table, column)).toEqual([...words]);
    expect(new Set(words).size).toBe(words.length);
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
