/**
 * The gate's operational-metadata writes as published: tool-access.ts's one
 * list, plus the daily MCP count's line while OPS_MCP_DAILY is on. agent.self,
 * GET /api/mcp, /.well-known/mcp.json and mcp-config.json all publish this,
 * so they cannot list different things.
 *
 * Kept apart from self-record.ts, which reaches the database through
 * rate-limit.ts, so the discovery documents can use it without a database.
 */

import { mcpDailyWrites } from "@/lib/observability/mcp-daily";
import { AGENT_OPERATIONAL_METADATA_WRITES } from "./tool-access";

export function operationalMetadataWrites(env?: Readonly<Record<string, string | undefined>>): string[] {
  return [...AGENT_OPERATIONAL_METADATA_WRITES, ...mcpDailyWrites(env)];
}
