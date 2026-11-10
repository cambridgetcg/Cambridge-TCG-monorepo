/**
 * POST /api/v1/agents/act — the REST twin of the MCP tool agent.act
 * (lib/agents/signed-acts.ts; docs/plans/agent-auth/held-keys.md).
 *
 * The same body as the tool's arguments: {"act": "<compact JWS>" | null,
 * "preview": "<act name>" | null}, exactly one a string. The answer is the
 * tool's answer body, or {error, refusal} with the typed refusal and the
 * status the tool would carry. Authorization is never read: a signed act is
 * its own authentication.
 *
 * While AGENT_SIGNED_ACTS is not "on", or no audience is configured, it
 * answers signed_acts_closed (503) before reading the body or the database.
 * Like /api/mcp it is served on the apex only: proxy.ts sends the production
 * alias's requests here to https://cambridgetcg.com.
 */

import { NextResponse } from "next/server";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import { SIGNED_ACT_MAX_BODY_BYTES, signedActsOpen } from "@/lib/agents/signed-act-config";
import { actClientAddress } from "@/lib/agents/signed-act-limits";
import { signedActsClosedAnswer, submitAgentAct, type AgentActAnswer } from "@/lib/agents/signed-acts";
import { signedActRefusal } from "@/lib/agents/refusals";
import { parseStrictJson } from "@/lib/agents/strict-json";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function answerResponse(answer: AgentActAnswer): NextResponse {
  if (answer.ok) return NextResponse.json(answer.body, { status: 200, headers: NO_STORE });
  return NextResponse.json(
    { error: answer.message, refusal: answer.refusal },
    {
      status: answer.status,
      headers: answer.retryAfterSeconds === undefined ? NO_STORE : { ...NO_STORE, "Retry-After": String(answer.retryAfterSeconds) },
    },
  );
}

function malformed(detail: string, status = 400): NextResponse {
  return NextResponse.json(
    { error: "The request body is malformed. Nothing was changed.", refusal: signedActRefusal("act_malformed", { detail }) },
    { status, headers: NO_STORE },
  );
}

export async function POST(request: Request): Promise<Response> {
  // Closed: the tool's own answer, before the body or the database is read.
  if (!signedActsOpen()) return answerResponse(signedActsClosedAnswer());
  const read = await readBoundedUtf8Body(request, SIGNED_ACT_MAX_BODY_BYTES, "signed act request body");
  if (!read.ok) {
    return read.kind === "too_large"
      ? malformed(`request body exceeds ${SIGNED_ACT_MAX_BODY_BYTES} bytes`, 413)
      : malformed("request body is not readable UTF-8");
  }
  const parsed = parseStrictJson(read.text);
  if (!parsed.ok) return malformed("request body is not a JSON object without duplicate names");
  return answerResponse(await submitAgentAct(parsed.value, { clientAddress: actClientAddress(request.headers) }));
}
