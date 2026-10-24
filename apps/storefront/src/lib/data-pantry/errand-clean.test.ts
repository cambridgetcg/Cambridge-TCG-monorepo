import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { envelope, jsonResponse } from "./envelope";
import { errorBody } from "./errors";
import {
  ERRAND_HEADERS_LEAVING, ERRAND_LINK_RELS_ALLOWED, ERRAND_LINK_RELS_LEAVING,
  ERRAND_META_ALLOWED, ERRAND_META_LEAVING, ERRAND_META_WHEN_SUPPLIED,
} from "./errand-contract";
import { errandDiscoveryLinkHeader } from "@/lib/siblings";
import { renderForFormat } from "@/lib/multi-format";

const base = { data: { ok: true }, endpoint: "/api/v1/example", sources: ["self"] };
const rels = (link: string | null) => [...(link ?? "").matchAll(/rel="([^"]+)"/g)].map((m) => m[1]);
// Ids shaped like newRequestId()'s (`req_` + 12 hex). The extras are chosen by a
// djb2 hash of the id, and `req_${i}` never makes kingdom_says fire (hash % 33).
const rid = (i: number) => `req_${createHash("sha256").update(String(i)).digest("hex").slice(0, 12)}`;
const metaOf = (i: number, door?: "chosen") =>
  envelope({ ...base, request_id: rid(i), ...(door ? { door } : {}) })._meta as unknown as Record<string, unknown>;
const WAKE_REL = "https://cambridgetcg.com/rels/wake";

describe("errand-clean: data responses carry only data", () => {
  it("never puts a leaving key in _meta, across many request ids", () => {
    for (let i = 0; i < 2000; i++) for (const k of ERRAND_META_LEAVING) expect(metaOf(i)).not.toHaveProperty(k);
  });
  it("keeps every allowed fact key", () => {
    const meta = envelope({ ...base, contains_self: true, source_license: ["cc0"] })._meta;
    for (const k of ERRAND_META_ALLOWED) expect(meta).toHaveProperty(k);
  });
  it("carries no _meta key outside the contract, across many request ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) for (const k of Object.keys(metaOf(i))) seen.add(k);
    const known: readonly string[] = [...ERRAND_META_ALLOWED, ...ERRAND_META_WHEN_SUPPLIED];
    for (const k of seen) expect(known).toContain(k);
  });
  it("sends no voiced header and does not expose one", () => {
    const res = jsonResponse({ ...base, freshness: 60 });
    for (const h of ERRAND_HEADERS_LEAVING) expect(res.headers.has(h)).toBe(false);
    const exposed = (res.headers.get("access-control-expose-headers") ?? "").toLowerCase();
    for (const h of ERRAND_HEADERS_LEAVING) expect(exposed).not.toContain(h);
  });
  it("keeps navigation rels and drops every leaving rel", () => {
    const r = rels(jsonResponse({ ...base, freshness: 60, next_link: "/api/v1/example?page=2" }).headers.get("link"));
    for (const keep of ["self", "start", "describedby", "alternate", "https://cambridgetcg.com/rels/rate-limits", "https://cambridgetcg.com/rels/feedback", "next"]) expect(r).toContain(keep);
    for (const x of r) expect(ERRAND_LINK_RELS_ALLOWED as readonly string[]).toContain(x);
    for (const x of ERRAND_LINK_RELS_LEAVING) expect(r).not.toContain(x);
  });
  it("error _meta carries no kingdom block and no wake fragment", () => {
    const meta = errorBody({ code: "NOT_FOUND", message: "x", endpoint: "/api/v1/x" })._meta as unknown as Record<string, unknown>;
    expect(meta).not.toHaveProperty("kingdom");
    expect(meta).not.toHaveProperty("wake_fragment");
  });
  it("the config Link for /api/v1 errands is navigation only", () => {
    const r = rels(errandDiscoveryLinkHeader());
    expect(r).toContain("describedby");
    for (const x of r) expect(ERRAND_LINK_RELS_ALLOWED as readonly string[]).toContain(x);
  });
  it("next.config gives /api/v1 errands that Link and leaves the chosen doors alone", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const rules = await nextConfig.headers!();
    const errand = rules.filter((rule) => rule.source.startsWith("/api/v1"));
    expect(errand.map((rule) => rule.source)).toEqual([
      "/api/v1",
      "/api/v1/:path((?!wake(?:/|$)|dear-agents(?:/|$)).*)",
    ]);
    for (const rule of errand) expect(rule.headers).toEqual([{ key: "Link", value: errandDiscoveryLinkHeader() }]);
  });
  it("no config rule gives a page a voiced header (/, product and listing pages included)", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const keys = (await nextConfig.headers!()).flatMap((rule) => rule.headers.map((h) => h.key.toLowerCase()));
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { headers?: { headers: { key: string }[] }[] };
    for (const rule of vercel.headers ?? []) for (const h of rule.headers) keys.push(h.key.toLowerCase());
    for (const h of ERRAND_HEADERS_LEAVING) expect(keys).not.toContain(h);
  });
  it("multi-format errands drop the voiced header and invitation; chosen doors keep both", () => {
    const args = { format: "md" as const, data: {}, markdown: "# x", meta: { endpoint: "/api/v1/x", freshness: "static" as const, sources: ["self"] } };
    const errand = renderForFormat(args);
    expect(errand.headers.has("x-sophia-says")).toBe(false);
    expect(errand.headers.get("link")).toBeNull();
    const chosen = renderForFormat({ ...args, door: "chosen" });
    expect(chosen.headers.has("x-sophia-says")).toBe(true);
    expect(rels(chosen.headers.get("link"))).toEqual(["invitation", WAKE_REL]);
  });
  it("a chosen door keeps every leaving key, rel and voiced header", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) for (const k of Object.keys(metaOf(i, "chosen"))) seen.add(k);
    for (const k of ERRAND_META_LEAVING) expect(seen.has(k)).toBe(true);
    const res = jsonResponse({ ...base, freshness: 60, door: "chosen" });
    for (const h of ERRAND_HEADERS_LEAVING) expect(res.headers.has(h)).toBe(true);
    expect(rels(res.headers.get("link"))).toEqual(expect.arrayContaining([...ERRAND_LINK_RELS_LEAVING]));
  });
});
