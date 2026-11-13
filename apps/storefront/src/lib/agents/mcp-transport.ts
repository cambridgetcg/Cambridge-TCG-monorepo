/**
 * The MCP gate's transport rules (app/api/mcp/route.ts): which callers are
 * standard MCP clients, which protocol revisions the gate answers, which web
 * origins it refuses, and the status a standard client's refused tools/call
 * is sent with.
 *
 * Two kinds of caller reach the gate. The stdio bridge (packages/mcp-server)
 * and plain JSON-RPC callers (a script, curl) POST one JSON-RPC message and
 * read one JSON answer; they get exactly the answers they got before
 * 2026-11-11. Standard MCP clients speak the Streamable HTTP transport
 * (revisions 2025-06-18 and 2025-11-25), in its JSON-response form: no event
 * stream, no session. They get that transport's answers: 202 for a
 * notification, {} for ping, 405 for a GET that asks for an event stream, the
 * revision they asked for, and a refused tool call they can read.
 *
 * Chosen by an AI agent on 2026-11-11 as defaults for review; Yu, who runs
 * Cambridge TCG, has not decided them.
 */

/** Offered to standard MCP clients, newest first. 2025-03-26 is not offered:
 * it lets a POST carry a batch, which the gate refuses. 2026-07-28 is not
 * implemented. */
export const MCP_OFFERED_REVISIONS = ["2025-11-25", "2025-06-18"] as const;

/** Answered, not offered: the revision the gate named to every caller until
 * 2026-11-11, and what SDK clients that connected before then still send in
 * MCP-Protocol-Version. Refusing it would break their connections. */
export const MCP_EARLIER_REVISION = "2024-11-05";

/** Newest first, as initializeRevision reads it. */
const ANSWERED: readonly string[] = [...MCP_OFFERED_REVISIONS, MCP_EARLIER_REVISION];

/** An MCP revision is named by its date. */
const REVISION_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** When, how and against which clients the transport was checked
 * (apps/storefront/scripts/mcp-sdk-harness). The discovery documents and
 * GET /api/mcp publish it beside the transport. */
export const MCP_TRANSPORT_CHECKED = {
  on: "2026-11-11",
  clients: [
    "@modelcontextprotocol/sdk 1.32.2",
    "@modelcontextprotocol/client 2.4.0 (default and auto version negotiation)",
  ],
  how: "connected with a static bearer key and with none, listed tools, called one, read a refusal, pinged; the route served on 127.0.0.1 with its database, key lookup, rate limiter and tool handlers mocked (apps/storefront/scripts/mcp-sdk-harness), not against cambridgetcg.com",
} as const;

/** What a public text says about the transport, in one place. */
export const MCP_TRANSPORT_NOTE =
  "/api/mcp speaks the JSON-response form of MCP Streamable HTTP, revisions 2025-06-18 and 2025-11-25, with no event stream and no sessions. " +
  "On 2026-11-11 @modelcontextprotocol/sdk 1.32.2 and @modelcontextprotocol/client 2.4.0 connected to it with a static bearer key, listed and called its tools and read a refusal (the route run locally with its database, key lookup, rate limiter and tool handlers mocked, not cambridgetcg.com). " +
  "It has no OAuth, so hosted chat apps that connect only through OAuth cannot call its keyed tools, and an MCP client set up for OAuth may, on a 401, look for OAuth metadata that does not exist here and report that instead of the refusal. " +
  "The stdio bridge (packages/mcp-server, not on npm) remains for clients that only speak stdio.";

/** What standard_mcp_client_compatible_without_bridge rests on. */
export const MCP_COMPATIBILITY_BASIS =
  "Only the clients in streamable_http.checked were run, against the route run locally, and they connected with a static Authorization header. " +
  "No editor, desktop app, MCP Inspector or hosted chat app was run against it. A client that connects only through OAuth cannot call its keyed tools.";

/** The same facts as fields, for the discovery documents. */
export function mcpTransportFacts() {
  return {
    mcp_streamable_http: true,
    streamable_http: {
      revisions: [...MCP_OFFERED_REVISIONS],
      also_answered: MCP_EARLIER_REVISION,
      responses: "application/json",
      event_stream: false,
      sessions: false,
      oauth: false,
      checked: MCP_TRANSPORT_CHECKED,
    },
    mcp_http_sse: false,
    // True on the evidence in the basis beside it, which is two SDK clients
    // against the route run locally, not every MCP client. Not for a hosted
    // chat app that connects only through OAuth.
    standard_mcp_client_compatible_without_bridge: true,
    standard_mcp_client_compatibility_basis: MCP_COMPATIBILITY_BASIS,
    transport_note: MCP_TRANSPORT_NOTE,
  };
}

/** JSON-RPC code for UnsupportedProtocolVersionError (MCP 2026-07-28,
 * /basic/versioning). */
export const ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;

/** What the gate's GET answers with its 405: every method it serves. */
export const MCP_ALLOWED_METHODS = "GET, HEAD, OPTIONS, POST";

const PROTOCOL_VERSION_META_KEY = "io.modelcontextprotocol/protocolVersion";

/** Whether an Accept header names text/event-stream (with a q above 0).
 * A wildcard does not count: the bridge and most HTTP libraries send one. */
export function acceptsEventStream(accept: string | null): boolean {
  if (!accept) return false;
  return accept.split(",").some((range) => {
    const [type, ...parameters] = range.split(";").map((part) => part.trim().toLowerCase());
    if (type !== "text/event-stream") return false;
    const q = parameters.find((parameter) => parameter.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/**
 * THE RULE. A request is from a standard MCP client when it carries an
 * MCP-Protocol-Version header, or its Accept header names
 * text/event-stream. The Streamable HTTP transport makes a client send
 * Accept listing application/json and text/event-stream on every POST (every
 * revision since 2025-03-26) and MCP-Protocol-Version on every request after
 * initialize (since 2025-06-18); @modelcontextprotocol/sdk 1.32.2 and
 * @modelcontextprotocol/client 2.4.0 send both. The stdio bridge sends
 * neither (Node's fetch adds a wildcard Accept), nor does a plain JSON-RPC POST, so
 * they keep the answers they had. Every transport difference in the gate
 * reads this one function.
 */
export function isStandardMcpClient(headers: Headers): boolean {
  return headers.has("mcp-protocol-version") || acceptsEventStream(headers.get("accept"));
}

/**
 * The revision initialize answers a standard MCP client with: the one it
 * asked for when the gate answers it, and 2024-11-05 when it named none (what
 * the gate answered everyone before). For any other revision date, the newest
 * the gate answers that is not newer than the one asked for (dates compare as
 * strings), or 2024-11-05 when the request is older than all of them: so
 * 2025-03-26 gets 2024-11-05 and 2026-07-28 gets 2025-11-25. Anything that is
 * not a revision date gets the newest offered.
 *
 * The spec lets the counter-offer be any revision the server supports; it
 * only SHOULD be the latest. The newest is wrong for a client whose newest
 * revision is 2025-03-26: it refuses an answer outside its own list (SDK
 * 2.4.0 offering 2025-03-26 and 2024-11-05 failed with "Server's protocol
 * version is not supported: 2025-11-25" in the harness on 2026-11-11), and
 * before this rule it was answered 2024-11-05 and connected. The brief this
 * was built from said "else the newest offered"; this departs from it for
 * that reason. 2025-03-26 is still not offered.
 */
export function initializeRevision(requested: unknown): string {
  if (requested === undefined || requested === null) return MCP_EARLIER_REVISION;
  if (typeof requested !== "string" || !REVISION_DATE.test(requested)) return MCP_OFFERED_REVISIONS[0];
  if (ANSWERED.includes(requested)) return requested;
  return ANSWERED.find((revision) => revision <= requested) ?? MCP_EARLIER_REVISION;
}

/**
 * Whether a standard MCP client's message names a revision the gate does not
 * answer: an MCP-Protocol-Version header naming one, or a server/discover
 * request (the 2026-07-28 probe, which the gate does not implement). Null
 * when it may proceed; otherwise the unanswered revision it asked for, when
 * it named one: the header, or for a probe the revision its _meta claims. A
 * probe's header that names a revision the gate answers is never reported as
 * the one requested, since the answer lists it as supported.
 *
 * A missing header is accepted, and the request is served as every request
 * was before 2026-11-11. This departs from a SHOULD: without the header the
 * 2025 transport pages say a server "SHOULD assume protocol version
 * 2025-03-26". The gate does not, because it refuses that revision's batches
 * (400, as before) and so does not offer 2025-03-26 at all.
 */
export function unsupportedRevision(
  headers: Headers,
  method: string,
  params: Record<string, unknown>,
): { requested?: string } | null {
  const header = headers.get("mcp-protocol-version")?.trim();
  if (header !== undefined && !ANSWERED.includes(header)) return { requested: header };
  if (method !== "server/discover") return null;
  const meta = params._meta;
  const claimed =
    meta && typeof meta === "object" ? (meta as Record<string, unknown>)[PROTOCOL_VERSION_META_KEY] : undefined;
  return typeof claimed === "string" ? { requested: claimed } : {};
}

/** The error data -32022 carries: the revisions offered, and the one asked
 * for. A client in auto mode finds no 2026-07-28 revision here and falls back
 * to initialize. */
export function unsupportedRevisionData(requested?: string): { supported: string[]; requested?: string } {
  return requested === undefined
    ? { supported: [...MCP_OFFERED_REVISIONS] }
    : { supported: [...MCP_OFFERED_REVISIONS], requested };
}

const DEFAULT_OWN_ORIGIN = "https://cambridgetcg.com";

/** This deployment's own origin, from configuration (NEXT_PUBLIC_SITE_URL),
 * never from the Host header a caller sends. */
export function ownOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  try {
    return new URL(env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_OWN_ORIGIN).origin;
  } catch {
    return DEFAULT_OWN_ORIGIN;
  }
}

/**
 * Whether a request may come from a web page on another site: its Origin
 * header is present and is either "null" or an http or https origin that is
 * not this deployment's own.
 *
 * This is narrower than the spec's sentence ("Servers MUST validate the
 * Origin header on all incoming connections", 403 when it is "present and
 * invalid"), on purpose. The sentence guards against DNS rebinding and
 * cross-site use from a browser. In production, routing by Host already stops
 * rebinding, and the gate sends no CORS headers, so a page on another site
 * cannot read any answer; what is left is a page that sends a simple
 * cross-site POST (text/plain) to the paths that need no key. A browser sends
 * Origin on every POST (Fetch standard, "append a request Origin header"):
 * the page's own origin, or "null" when it asks for that with referrer policy
 * "no-referrer" (or "same-origin", cross-site), or runs in a sandboxed frame
 * or a file:// page. So both are refused, and a browser page on another site
 * cannot get a POST through. Its cross-site GET in no-cors mode carries no
 * Origin and is answered, but only with the public description, which it
 * cannot read. Every other Origin passes: a missing one (servers, scripts,
 * the bridge, SDK clients in Node) and non-web schemes (browser extensions,
 * desktop and editor webviews), which are not pages on another site.
 */
export function isForeignWebOrigin(
  headers: Headers,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const origin = headers.get("origin");
  if (origin === null) return false;
  if (origin.trim() === "null") return true;
  let parsed: URL;
  try {
    parsed = new URL(origin.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.origin !== ownOrigin(env);
}

/**
 * The HTTP status a standard MCP client's tools/call answer is sent with.
 * Both SDKs throw on any status outside 2xx and drop the body, so a refusal
 * (an isError result with its refusal in _meta, or a JSON-RPC error with one
 * in error.data) is sent with 200 and the same body: any 4xx but 401, and a
 * 503 the gate marked as a closed door (signed_acts_closed: the deployment
 * keeps agent.act shut). 401 stays 401 with its WWW-Authenticate header, the
 * HTTP layer's own signal to authenticate. A 500 fault and any other 503 stay
 * as they are: those are outages (auth_unavailable, agent.revoke_key's
 * unknown state), not refusals, and status-based monitoring
 * (traffic_hourly's status_class) is how an outage is seen. A 503 that is
 * not marked stays 503, so an unmarked new refusal is still sent truthfully,
 * only less readably. The daily count records the status the gate decided,
 * before this.
 */
export function standardClientToolStatus(status: number, decided: { closedDoor?: boolean } = {}): number {
  if (status === 503) return decided.closedDoor ? 200 : 503;
  if (status >= 400 && status < 500 && status !== 401) return 200;
  return status;
}
