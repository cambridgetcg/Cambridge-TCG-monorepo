/**
 * The identified reader the official-image tools share (official-media.ts).
 * Mocked fetch and a fake clock only: no network.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createOfficialMediaReader,
  OFFICIAL_MEDIA_PERMISSIONS,
  OFFICIAL_MEDIA_USER_AGENTS,
  type OfficialMediaLane,
} from "../official-media";
import { BANDAI_JP_USER_AGENT } from "../bandai-jp/config";

type Answer = { status: number; body?: string | Uint8Array; headers?: Record<string, string> };

function harness(lane: OfficialMediaLane, route: (url: string) => Answer | Promise<Answer> | "throw-timeout") {
  let t = 1_000_000;
  const calls: { url: string; at: number; userAgent: string | null; accept: string | null; redirect: RequestRedirect | undefined }[] = [];
  const sleeps: number[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), at: t, userAgent: headers.get("User-Agent"), accept: headers.get("Accept"), redirect: init?.redirect });
    const answer = await route(String(input));
    if (answer === "throw-timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    t += 100; // the response takes 100 ms to arrive and be read
    const body = answer.body instanceof Uint8Array ? answer.body.slice() : answer.body ?? "";
    return new Response([204, 304].includes(answer.status) ? null : body, { status: answer.status, headers: answer.headers });
  }) as unknown as typeof globalThis.fetch;
  const reader = createOfficialMediaReader({ lane, fetch, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } });
  return { reader, calls, sleeps, fetch, advance: (ms: number) => { t += ms; } };
}

const IMAGE = "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016";

describe("official-media User-Agent", () => {
  it("names the lane's own decision, byte for byte for Japanese", () => {
    expect(OFFICIAL_MEDIA_USER_AGENTS.ja).toBe("CambridgeTCG-official-media/1.0 (+https://cambridgetcg.com/legal/card-images; contact@cambridgetcg.com; permission cambridge.official-ja-media/2026-10-30)");
    expect(OFFICIAL_MEDIA_USER_AGENTS.ja).toBe(BANDAI_JP_USER_AGENT);
    // An English request never claims the Japanese decision.
    expect(OFFICIAL_MEDIA_USER_AGENTS.en).toBe(OFFICIAL_MEDIA_USER_AGENTS.ja.replace(OFFICIAL_MEDIA_PERMISSIONS.ja, OFFICIAL_MEDIA_PERMISSIONS.en));
    expect(OFFICIAL_MEDIA_USER_AGENTS.en).not.toContain("official-ja-media");
    for (const ua of Object.values(OFFICIAL_MEDIA_USER_AGENTS)) expect(ua).not.toMatch(/Mozilla|Chrome|Safari/);
  });
});

describe("official-media reader", () => {
  it("reads robots.txt under the lane's User-Agent, counts it in the host's spacing, and never follows redirects", async () => {
    const h = harness("ja", (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 200, body: "png", headers: { "content-type": "image/png" } });
    expect(await h.reader.readRobotsTxt("www.onepiece-cardgame.com")).toMatchObject({ kind: "none", intervalMs: 2000 });
    const answer = await h.reader.get(IMAGE, { accept: "image/png", maxBytes: 1024 });
    expect(answer).toMatchObject({ kind: "ok", contentType: "image/png" });
    expect(h.calls.map((c) => c.url)).toEqual(["https://www.onepiece-cardgame.com/robots.txt", IMAGE]);
    for (const call of h.calls) {
      expect(call.userAgent).toBe(BANDAI_JP_USER_AGENT);
      expect(call.redirect).toBe("manual");
    }
    // The image request starts 2 s after the robots.txt response ended.
    expect(h.calls[1]!.at - (h.calls[0]!.at + 100)).toBe(2000);
    expect(h.reader.requests).toBe(2);
  });

  it("spaces requests to one host from the end of the previous response, and hosts independently", async () => {
    const h = harness("ja", (url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 200, body: "x", headers: { "content-type": "text/html" } });
    await h.reader.readRobotsTxt("www.onepiece-cardgame.com");
    await h.reader.readRobotsTxt("www.dbs-cardgame.com");
    await h.reader.get("https://www.onepiece-cardgame.com/cardlist/?series=550101", { accept: "text/html", maxBytes: 1024 });
    await h.reader.get("https://www.onepiece-cardgame.com/cardlist/?series=550102", { accept: "text/html", maxBytes: 1024 });
    const op = h.calls.filter((c) => c.url.includes("onepiece"));
    for (let i = 1; i < op.length; i += 1) expect(op[i]!.at - (op[i - 1]!.at + 100)).toBeGreaterThanOrEqual(2000);
    // The second host's robots.txt did not wait on the first host.
    expect(h.calls[1]!.at - (h.calls[0]!.at + 100)).toBe(0);
  });

  it("takes a longer Crawl-delay, and requires both its own group and every crawler's to allow a path", async () => {
    const robots = "User-agent: cambridgetcg-official-media\nDisallow: /images/private/\nCrawl-delay: 5\n\nUser-agent: *\nDisallow: /cardlist/secret\n";
    const h = harness("ja", (url) => url.endsWith("/robots.txt") ? { status: 200, body: robots, headers: { "content-type": "text/plain" } } : { status: 200, body: "x" });
    const read = await h.reader.readRobotsTxt("www.onepiece-cardgame.com");
    expect(read.kind).toBe("rules");
    if (read.kind !== "rules") return;
    expect(read.intervalMs).toBe(5000);
    expect(read.allows("/cardlist/?series=550101")).toBe(true);
    expect(read.allows("/images/private/a.png")).toBe(false);
    expect(read.allows("/cardlist/secret")).toBe(false);
    await h.reader.get(IMAGE, { accept: "image/png", maxBytes: 1024 });
    expect(h.calls[1]!.at - (h.calls[0]!.at + 100)).toBe(5000);
  });

  it("honours a group for the house name too", async () => {
    const h = harness("en", () => ({ status: 200, body: "User-agent: CambridgeTCG\nDisallow: /\n" }));
    const read = await h.reader.readRobotsTxt("en.onepiece-cardgame.com");
    expect(read.kind === "rules" && read.allows("/cardlist/")).toBe(false);
    expect(h.calls[0]!.userAgent).toBe(OFFICIAL_MEDIA_USER_AGENTS.en);
  });

  it.each([
    [{ status: 403 }, "http-403"],
    [{ status: 500 }, "http-500"],
    [{ status: 301, headers: { location: "https://elsewhere.example/robots.txt" } }, "http-301"],
    [{ status: 200, headers: { "cf-mitigated": "challenge" } }, "challenge-challenge"],
  ] as const)("stops on a robots.txt answer that is neither rules nor none: %o", async (answer, reason) => {
    const h = harness("ja", () => answer);
    expect(await h.reader.readRobotsTxt("www.onepiece-cardgame.com")).toMatchObject({ kind: "stop", reason });
    expect(h.calls).toHaveLength(1);
  });

  it("refuses a GET to a host whose robots.txt it has not read, without a request", async () => {
    const h = harness("ja", () => ({ status: 200 }));
    expect(await h.reader.get(IMAGE, { accept: "image/png", maxBytes: 1 })).toEqual({ kind: "stop", reason: "robots-not-read", status: null });
    expect(await h.reader.get("http://www.onepiece-cardgame.com/x.png", { accept: "image/png", maxBytes: 1 })).toMatchObject({ kind: "stop", reason: "invalid-url" });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 404 }, { kind: "gone", status: 404 }],
    [{ status: 410 }, { kind: "gone", status: 410 }],
    [{ status: 302, headers: { location: "https://www.onepiece-cardgame.com/" } }, { kind: "stop", reason: "redirect-302" }],
    [{ status: 403 }, { kind: "stop", reason: "http-403" }],
    [{ status: 429, headers: { "retry-after": "60" } }, { kind: "stop", reason: "http-429" }],
    [{ status: 503 }, { kind: "stop", reason: "http-503" }],
    [{ status: 502 }, { kind: "stop", reason: "http-502" }],
    [{ status: 204 }, { kind: "stop", reason: "http-204" }],
    [{ status: 200, body: "<html><title>Just a moment...</title></html>" }, { kind: "stop", reason: "challenge-page" }],
    [{ status: 200, body: "x".repeat(2048) }, { kind: "stop", reason: "too-large" }],
  ] as const)("maps %o to an answer without retrying", async (answer, expected) => {
    const h = harness("ja", (url) => url.endsWith("/robots.txt") ? { status: 404 } : answer);
    await h.reader.readRobotsTxt("www.onepiece-cardgame.com");
    expect(await h.reader.get(IMAGE, { accept: "image/png", maxBytes: 1024 })).toMatchObject(expected);
    expect(h.calls).toHaveLength(2);
  });

  it("answers a timeout as a stop", async () => {
    const h = harness("ja", (url) => url.endsWith("/robots.txt") ? { status: 404 } : "throw-timeout");
    await h.reader.readRobotsTxt("www.onepiece-cardgame.com");
    expect(await h.reader.get(IMAGE, { accept: "image/png", maxBytes: 1024 })).toEqual({ kind: "stop", reason: "timeout", status: null });
  });
});
