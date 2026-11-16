/**
 * ToolError: how an MCP tool handler refuses a call.
 *
 * Every ToolError carries a typed refusal, built by refusals.ts from a
 * reason code and what the handler knows (toolRefusal), so the gate sends a
 * tool's refusal in the same shape as its own: in JSON-RPC error.data for a
 * dotted call, in _meta["cambridgetcg.com/refusal"] on a tools/call isError
 * result (app/api/mcp/route.ts). The message stays the human sentence it was;
 * the status stays the HTTP status the gate sends to callers that are not
 * standard MCP clients (mcp-transport.ts decides what those get).
 *
 * Until 2026-11-13 a ToolError carried only a message and a status, and the
 * gate answered it with no refusal.
 */

import {
  toolRefusal,
  type AgentRefusal,
  type ToolRefusalCode,
  type ToolRefusalContext,
} from "./refusals";

export class ToolError extends Error {
  readonly refusal: AgentRefusal;

  constructor(
    message: string,
    public status: number,
    code: ToolRefusalCode,
    context: ToolRefusalContext = {},
  ) {
    super(message);
    this.name = "ToolError";
    this.refusal = toolRefusal(code, context);
  }
}
