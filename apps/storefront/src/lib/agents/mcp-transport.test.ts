import { describe, expect, it } from "vitest";
import {
  acceptsEventStream,
  initializeRevision,
  isForeignWebOrigin,
  isStandardMcpClient,
  MCP_OFFERED_REVISIONS,
  ownOrigin,
  standardClientToolStatus,
  unsupportedRevision,
  unsupportedRevisionData,
} from "./mcp-transport";

// What each caller sent in the SDK harness run of 2026-11-11
// (scripts/mcp-sdk-harness), less the key.
const SDK_POST = { accept: "application/json, text/event-stream", "content-type": "application/json", "user-agent": "node" };
const SDK_GET = { accept: "text/event-stream", "mcp-protocol-version": "2025-11-25" };
const BRIDGE = { accept: "*/*", "content-type": "application/json", "user-agent": "@cambridge-tcg/mcp-server/0.1.0 (Node v22.23.1)" };

describe("which callers are standard MCP clients", () => {
  it("counts the SDKs' POSTs and GETs, before and after initialize", () => {
    expect(isStandardMcpClient(new Headers(SDK_POST))).toBe(true);
    expect(isStandardMcpClient(new Headers({ ...SDK_POST, "mcp-protocol-version": "2024-11-05" }))).toBe(true);
    expect(isStandardMcpClient(new Headers(SDK_GET))).toBe(true);
    // The header alone is enough.
    expect(isStandardMcpClient(new Headers({ "mcp-protocol-version": "2025-06-18" }))).toBe(true);
  });

  it("leaves the stdio bridge, plain JSON-RPC callers and browsers as they were", () => {
    expect(isStandardMcpClient(new Headers(BRIDGE))).toBe(false);
    expect(isStandardMcpClient(new Headers({ "content-type": "application/json" }))).toBe(false);
    expect(isStandardMcpClient(new Headers({ accept: "application/json" }))).toBe(false);
    expect(isStandardMcpClient(new Headers({ accept: "text/html,application/xhtml+xml,*/*;q=0.8" }))).toBe(false);
  });

  it("reads Accept by media type, not by substring, and honours q=0", () => {
    expect(acceptsEventStream("TEXT/EVENT-STREAM")).toBe(true);
    expect(acceptsEventStream("application/json;q=0.9, text/event-stream;q=0.5")).toBe(true);
    expect(acceptsEventStream("text/event-stream;q=0")).toBe(false);
    expect(acceptsEventStream("text/event-streamish")).toBe(false);
    expect(acceptsEventStream("*/*")).toBe(false);
    expect(acceptsEventStream("text/*")).toBe(false);
    expect(acceptsEventStream(null)).toBe(false);
  });
});

describe("protocol revisions", () => {
  it("offers 2025-11-25 and 2025-06-18, never 2025-03-26 or 2026-07-28", () => {
    expect([...MCP_OFFERED_REVISIONS]).toEqual(["2025-11-25", "2025-06-18"]);
  });

  it("echoes an answered revision, keeps 2024-11-05 for none, and otherwise answers the newest one not newer than the request", () => {
    expect(initializeRevision("2025-11-25")).toBe("2025-11-25");
    expect(initializeRevision("2025-06-18")).toBe("2025-06-18");
    expect(initializeRevision("2024-11-05")).toBe("2024-11-05");
    expect(initializeRevision(undefined)).toBe("2024-11-05");
    expect(initializeRevision(null)).toBe("2024-11-05");
    // A client whose newest revision is 2025-03-26 refuses any answer
    // outside its own list (SDK 2.4.0 _legacyHandshake; SDK 1.x releases
    // before 2025-06-18 knew only 2025-03-26, 2024-11-05 and 2024-10-07).
    expect(initializeRevision("2025-03-26")).toBe("2024-11-05");
    expect(initializeRevision("2024-10-07")).toBe("2024-11-05");
    expect(initializeRevision("2025-09-01")).toBe("2025-06-18");
    expect(initializeRevision("2026-07-28")).toBe("2025-11-25");
    // Not a revision date: the newest offered, as the spec's SHOULD says.
    expect(initializeRevision("bogus")).toBe("2025-11-25");
    expect(initializeRevision(20251125)).toBe("2025-11-25");
  });

  it("accepts a missing header and every answered revision, and names any other", () => {
    for (const version of ["2025-11-25", "2025-06-18", "2024-11-05"]) {
      expect(unsupportedRevision(new Headers({ "mcp-protocol-version": version }), "tools/list", {})).toBeNull();
    }
    expect(unsupportedRevision(new Headers(), "tools/call", {})).toBeNull();
    expect(unsupportedRevision(new Headers({ "mcp-protocol-version": "2025-03-26" }), "tools/list", {})).toEqual({ requested: "2025-03-26" });
    expect(unsupportedRevision(new Headers({ "mcp-protocol-version": "2026-07-28" }), "tools/call", {})).toEqual({ requested: "2026-07-28" });
    expect(unsupportedRevision(new Headers({ "mcp-protocol-version": "" }), "ping", {})).toEqual({ requested: "" });
  });

  it("answers the 2026-07-28 probe as unsupported, naming the revision it claimed", () => {
    // SDK 2.4.0's probe, in auto mode, as the harness recorded it.
    const probe = {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": { name: "harness", version: "0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    };
    expect(unsupportedRevision(new Headers({ "mcp-protocol-version": "2026-07-28", "mcp-method": "server/discover" }), "server/discover", probe)).toEqual({ requested: "2026-07-28" });
    expect(unsupportedRevision(new Headers(SDK_POST), "server/discover", probe)).toEqual({ requested: "2026-07-28" });
    expect(unsupportedRevision(new Headers(SDK_POST), "server/discover", {})).toEqual({});
  });

  it("never names an answered revision as the one requested", () => {
    // server/discover with a header the gate answers: still -32022 (the
    // method is the 2026-07-28 probe), but requested comes from _meta or is
    // left out, so the answer does not list it as both supported and not.
    for (const version of ["2025-11-25", "2025-06-18", "2024-11-05"]) {
      const headers = new Headers({ ...SDK_POST, "mcp-protocol-version": version });
      expect(unsupportedRevision(headers, "server/discover", {}), version).toEqual({});
      expect(
        unsupportedRevision(headers, "server/discover", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } }),
        version,
      ).toEqual({ requested: "2026-07-28" });
    }
  });

  it("lists only the offered revisions as supported, as SDK 2.4.0 reads them", () => {
    expect(unsupportedRevisionData("2026-07-28")).toEqual({ supported: ["2025-11-25", "2025-06-18"], requested: "2026-07-28" });
    expect(unsupportedRevisionData()).toEqual({ supported: ["2025-11-25", "2025-06-18"] });
  });
});

describe("cross-site origins", () => {
  const env = { NEXT_PUBLIC_SITE_URL: "https://cambridgetcg.com" };

  it("takes the deployment's own origin from configuration only", () => {
    expect(ownOrigin({})).toBe("https://cambridgetcg.com");
    expect(ownOrigin({ NEXT_PUBLIC_SITE_URL: " http://127.0.0.1:3001/ " })).toBe("http://127.0.0.1:3001");
    expect(ownOrigin({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBe("https://cambridgetcg.com");
  });

  it("refuses a present http or https origin that is not this deployment's, and null", () => {
    const foreign = (origin?: string) =>
      isForeignWebOrigin(new Headers(origin === undefined ? {} : { origin }), env);
    expect(foreign("https://evil.example")).toBe(true);
    expect(foreign("http://localhost:6274")).toBe(true);
    expect(foreign("http://cambridgetcg.com")).toBe(true);
    expect(foreign("https://cambridgetcg-storefront.vercel.app")).toBe(true);
    // A page on another site can send null by choosing its referrer policy.
    expect(foreign("null")).toBe(true);
    expect(foreign(" null ")).toBe(true);
    expect(foreign(undefined)).toBe(false);
    expect(foreign("https://cambridgetcg.com")).toBe(false);
    expect(foreign("HTTPS://CambridgeTCG.com")).toBe(false);
    expect(foreign("vscode-webview://abc")).toBe(false);
    expect(foreign("file://")).toBe(false);
    expect(foreign("")).toBe(false);
  });

  it("never reads the Host header", () => {
    const headers = new Headers({ origin: "https://evil.example", host: "evil.example" });
    expect(isForeignWebOrigin(headers, env)).toBe(true);
  });
});

describe("the status a standard client's tools/call is sent with", () => {
  it("sends every refusal with 200 except 401, and leaves results, faults and outages alone", () => {
    expect([200, 400, 401, 403, 404, 409, 422, 429, 500, 503].map((status) => standardClientToolStatus(status)))
      .toEqual([200, 200, 401, 200, 200, 200, 200, 200, 500, 503]);
  });

  it("sends a 503 with 200 only when the gate marked it a closed door", () => {
    expect(standardClientToolStatus(503, { closedDoor: true })).toBe(200);
    expect(standardClientToolStatus(500, { closedDoor: true })).toBe(500);
    expect(standardClientToolStatus(401, { closedDoor: true })).toBe(401);
  });
});
