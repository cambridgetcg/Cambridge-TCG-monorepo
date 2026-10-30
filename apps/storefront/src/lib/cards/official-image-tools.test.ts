/**
 * The manual official-image tools, run against mocks only: a mocked fetch
 * (fixture pages and synthetic image bytes), a mocked AWS CLI and a scripted
 * database client. No network, no AWS, no database.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANDAI_JP_GAMES, BANDAI_JP_USER_AGENT } from "@cambridge-tcg/data-ingest/bandai-jp";
import { OFFICIAL_MEDIA_USER_AGENTS } from "@cambridge-tcg/data-ingest/official-media";
import { AWS_CHILD_ENV, imageDimensions, OFFICIAL_MEDIA_LOCK, runIngest, runUpload, selectionDigest, type ToolDb, type ToolDeps, type ToolExecFile, type ToolQueryResult } from "./official-image-tools";
import { OFFICIAL_IMAGE_LANES } from "./official-image-lanes";

const fixtures = new URL("../../../../../packages/data-ingest/src/__tests__/fixtures/", import.meta.url);
const OP_PAGE = readFileSync(new URL("bandai-jp-op01-sample.html", fixtures), "utf8");
const FW_PAGE = readFileSync(new URL("bandai-jp-dbf-fb10-list.html", fixtures), "utf8");

/** A PNG whose IHDR says width × height, padded past the 1 KiB floor. */
function png(width = 600, height = 838, size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
/** A WebP (VP8X) of width × height. */
function webp(width = 600, height = 838, size = 4096): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0]);
  const w = width - 1, h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return bytes;
}
const b64 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("base64");
const hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type Handler = (sql: string, params: unknown[]) => ToolQueryResult | Promise<ToolQueryResult>;
function scriptedDb(handler: Handler) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db: ToolDb & { calls: typeof calls; ended: boolean } = {
    calls, ended: false,
    async query(sql, params = []) { calls.push({ sql, params }); return handler(sql, params); },
    async end() { db.ended = true; },
  };
  return db;
}
const result = (rows: Record<string, unknown>[] = [], rowCount: number | null = rows.length): ToolQueryResult => ({ rows, rowCount });

type Answer = { status: number; body?: string | Uint8Array; headers?: Record<string, string> };
function harness(route: (url: string) => Answer, handler: Handler = () => result(), exec?: ToolExecFile) {
  const out: string[] = [], err: string[] = [];
  const requests: { url: string; userAgent: string | null; accept: string | null }[] = [];
  let t = Date.UTC(2026, 9, 30);
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), userAgent: headers.get("User-Agent"), accept: headers.get("Accept") });
    const answer = route(String(input));
    t += 50;
    const body = typeof answer.body === "string" || answer.body === undefined ? answer.body ?? "" : answer.body.slice();
    return new Response(body, { status: answer.status, headers: answer.headers });
  }) as unknown as typeof globalThis.fetch;
  const dbs: ReturnType<typeof scriptedDb>[] = [];
  const execCalls: { file: string; args: readonly string[]; options: Parameters<ToolExecFile>[2] }[] = [];
  const execFile = vi.fn<ToolExecFile>(async (file, args, options) => {
    execCalls.push({ file, args, options });
    if (exec) return exec(file, args, options);
    if (args[0] === "--version") return { stdout: "aws-cli/2.17.0 Python/3.12.0 Darwin/24.3.0 source/arm64\n", stderr: "" };
    throw new Error("unexpected aws call");
  });
  const released = vi.fn();
  const deps: ToolDeps = {
    out: (line) => out.push(line), err: (line) => err.push(line), fetch,
    env: { PATH: "/usr/bin", HOME: "/home/test", AWS_ENDPOINT_URL: "https://elsewhere.invalid", AWS_PROFILE: "ambient", AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_ROLE_ARN: "arn:aws:iam::0:role/x", TMPDIR: "/tmp" },
    lock: () => ({ ok: true, release: released }),
    openDb: vi.fn(async () => { const db = scriptedDb((sql, params) => sql === OFFICIAL_MEDIA_LOCK ? result([{ locked: true }]) : handler(sql, params)); dbs.push(db); return db; }),
    execFile, now: () => t, sleep: async (ms) => { t += ms; },
  };
  return { deps, out, err, requests, fetch, dbs, execCalls, execFile, released };
}

const site = (url: string): Answer => {
  if (url.endsWith("/robots.txt")) return { status: 404 };
  if (url === BANDAI_JP_GAMES.op.series_url("550101")) return { status: 200, body: OP_PAGE, headers: { "content-type": "text/html; charset=UTF-8" } };
  if (url === BANDAI_JP_GAMES.dbf.series_url("584010")) return { status: 200, body: FW_PAGE, headers: { "content-type": "text/html; charset=UTF-8" } };
  return { status: 404 };
};

describe("ingest-official-ja", () => {
  it("does nothing without --game: usage, exit 2, no lock, no request [C24]", async () => {
    const h = harness(site);
    for (const argv of [[], ["--apply"], ["--game", "op", "--series", "550001"], ["--game", "op", "--bogus"], ["--game", "op", "--no-ssl", "--ca-file", "x.pem"]]) {
      expect(await runIngest(argv, h.deps)).toBe(2);
    }
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.deps.openDb).not.toHaveBeenCalled();
    expect(h.err.join("\n")).toContain("Even the default dry run reads them");
    expect(await runIngest(["--help"], h.deps)).toBe(0);
    expect(h.out[0]).toMatch(/^Usage:/);
  });

  it("dry run: says it reads Bandai's pages, reads robots.txt then list pages under the lane's User-Agent, prints counts and writes nothing", async () => {
    const h = harness(site);
    expect(await runIngest(["--game", "all", "--series", "550101,584010"], h.deps)).toBe(0);
    expect(h.out[0]).toContain("this run reads Bandai's Japanese card-list pages, an outward act needing Yu's word");
    expect(h.requests.map((r) => r.url)).toEqual([
      "https://www.onepiece-cardgame.com/robots.txt", "https://www.dbs-cardgame.com/robots.txt",
      BANDAI_JP_GAMES.op.series_url("550101"), BANDAI_JP_GAMES.dbf.series_url("584010"),
    ]);
    for (const request of h.requests) expect(request.userAgent).toBe(BANDAI_JP_USER_AGENT);
    expect(h.out).toContain("  op 550101: blocks 5, base 3, skipped 2 (no reviewed variant mapping), quarantined 0, duplicates 0, conflicts 0");
    expect(h.out.at(-1)).toBe("dry run: nothing written");
    expect(h.deps.openDb).not.toHaveBeenCalled();
    expect(h.released).toHaveBeenCalledOnce();
  });

  it("stops before any request when another run holds the lockfile or the database lock", async () => {
    const h = harness(site);
    h.deps.lock = () => ({ ok: false, path: "/tmp/ctcg-official-media.lock" });
    expect(await runIngest(["--game", "op"], h.deps)).toBe(3);
    const busy = harness(site);
    busy.deps.openDb = vi.fn(async () => scriptedDb(() => result([{ locked: false }])));
    expect(await runIngest(["--game", "op", "--apply", "--no-ssl"], busy.deps)).toBe(3);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(busy.fetch).not.toHaveBeenCalled();
  });

  it("exits 4 on a refusal and 5 on drift, writing nothing", async () => {
    const refused = harness((url) => url.includes("cardlist") ? { status: 403 } : site(url));
    expect(await runIngest(["--game", "op", "--series", "550101", "--apply", "--no-ssl"], refused.deps)).toBe(4);
    expect(refused.err.join("\n")).toContain("Stop and ask Yu; do not retry");
    expect(refused.dbs[0]!.calls.map((c) => c.sql)).toEqual([OFFICIAL_MEDIA_LOCK]);
    const drift = harness((url) => url.includes("cardlist") ? { status: 200, body: "<html></html>", headers: { "content-type": "text/html" } } : site(url));
    expect(await runIngest(["--game", "dbf", "--series", "584010", "--apply", "--no-ssl"], drift.deps)).toBe(5);
    expect(drift.dbs[0]!.calls.map((c) => c.sql)).toEqual([OFFICIAL_MEDIA_LOCK]);
  });

  it("--apply: one client, the lock before any request, then one transaction of one insert per series, never an update [C14, C16]", async () => {
    const h = harness(site, (sql, params) => sql.startsWith("INSERT INTO card_images") ? result((params[0] as string[]).slice(1).map((sku) => ({ sku }))) : result());
    let firstRequestAt = -1;
    const fetch = h.deps.fetch;
    h.deps.fetch = (async (...args: Parameters<typeof fetch>) => { if (firstRequestAt < 0) firstRequestAt = h.dbs[0]?.calls.length ?? -1; return fetch(...args); }) as typeof fetch;
    expect(await runIngest(["--game", "all", "--series", "550101,584010", "--apply", "--no-ssl"], h.deps)).toBe(0);
    expect(h.deps.openDb).toHaveBeenCalledOnce();
    expect(h.deps.openDb).toHaveBeenCalledWith({ noSsl: true, caFile: null });
    expect(firstRequestAt).toBe(1); // the lock was the only statement before the first request
    const sql = h.dbs[0]!.calls.map((c) => c.sql.split("\n")[0]);
    expect(sql).toEqual([OFFICIAL_MEDIA_LOCK, "BEGIN", "INSERT INTO card_images (sku, lang, kind, source, source_url, attribution, license_note, retrieved_at)", "INSERT INTO card_images (sku, lang, kind, source, source_url, attribution, license_note, retrieved_at)", "COMMIT"]);
    const insert = h.dbs[0]!.calls[2]!;
    expect(insert.sql).toContain("ON CONFLICT (sku, lang, kind, source) DO NOTHING");
    expect(insert.params).toEqual([
      ["OP-OP01-001-JA", "OP-OP01-002-JA", "OP-OP01-016-JA"],
      ["https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016", "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-002.png?261016", "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-016.png?261016"],
      Array(3).fill(BANDAI_JP_GAMES.op.credit), Array(3).fill("cambridge.official-ja-media/2026-10-30"),
      expect.any(Array),
    ]);
    expect(h.dbs.flatMap((db) => db.calls).some((c) => /\bUPDATE\b/.test(c.sql))).toBe(false);
    expect(h.out.at(-1)).toBe("applied: 4 inserted, 2 already present (left as they were)");
    expect(h.dbs[0]!.ended).toBe(true);
  });
});

// ── upload ───────────────────────────────────────────────────────────────

const jaRow = (overrides: Record<string, unknown> = {}) => ({
  sku: "OP-OP01-001-JA", lang: "ja", kind: "official_sample", source: "bandai-jp",
  source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?261016",
  attribution: OFFICIAL_IMAGE_LANES.ja.credits.op, license_note: OFFICIAL_IMAGE_LANES.ja.evidence, ...overrides,
});
const fwRow = jaRow({ sku: "DBF-FB10-001-JA", source_url: "https://www.dbs-cardgame.com/fw/images/cards/card/jp/FB10-001_f.webp", attribution: OFFICIAL_IMAGE_LANES.ja.credits.dbf });
const PNG = png(), WEBP = webp();
const images = (url: string): Answer => {
  if (url.endsWith("/robots.txt")) return { status: 404 };
  if (url.includes("OP01-001.png")) return { status: 200, body: PNG, headers: { "content-type": "image/png" } };
  if (url.includes("FB10-001_f.webp")) return { status: 200, body: WEBP, headers: { "content-type": "image/webp" } };
  return { status: 404 };
};
/** A database whose selection is `rows`, whose row locks answer `lock`, and whose record updates `recorded` rows. */
const uploadDb = (rows: Record<string, unknown>[], options: { held?: number; lock?: (params: unknown[]) => ToolQueryResult; recorded?: number } = {}): Handler => (sql, params) => {
  if (sql.startsWith("SELECT sku, lang, kind, source, source_url")) return result(rows);
  if (sql.startsWith("SELECT count(*)::int AS held")) return result([{ held: options.held ?? 0 }]);
  if (sql.startsWith("SELECT takedown_status, s3_key")) return options.lock ? options.lock(params) : result([{ takedown_status: "clear", s3_key: null, held: false }]);
  if (sql.startsWith("UPDATE card_images")) return result([], options.recorded ?? 1);
  return result();
};
const awsOk = (checksums: Record<string, string>): ToolExecFile => async (_file, args) => {
  if (args[0] === "--version") return { stdout: "aws-cli/2.17.0 Python/3.12.0\n", stderr: "" };
  if (args[1] === "put-object") return { stdout: JSON.stringify({ ETag: '"x"', ChecksumSHA256: checksums[args[args.indexOf("--key") + 1]!] }), stderr: "" };
  throw new Error("unexpected");
};
const awsError = (code: string, extra = "") => Object.assign(new Error("Command failed"), { code: 254, stderr: `\nAn error occurred (${code}) when calling the PutObject operation: ${extra}\n` });

describe("upload-official-images", () => {
  it("requires --profile (no leading dash) and --lang, with no I/O [C20]", async () => {
    const h = harness(images);
    for (const argv of [[], ["--lang", "ja"], ["--profile", "p"], ["--profile", "-x", "--lang", "ja"], ["--profile", "p", "--lang", "ko"], ["--profile", "p", "--lang", "ja", "--expect", `1:${"a".repeat(64)}`], ["--profile", "p", "--lang", "ja", "--limit", "0"]]) {
      expect(await runUpload(argv, h.deps), argv.join(" ")).toBe(2);
    }
    expect(h.deps.openDb).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.execFile).not.toHaveBeenCalled();
  });

  it("dry run: selects only the lane's clear, unuploaded rows without a held card, prints the digest, fetches nothing and runs no aws [C18, C21]", async () => {
    const h = harness(images, uploadDb([jaRow(), fwRow], { held: 1 }));
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl"], h.deps)).toBe(0);
    const select = h.dbs[0]!.calls[1]!;
    expect(select.sql).toContain("lang = $1 AND source = $2 AND kind = 'official_sample' AND takedown_status = 'clear' AND s3_key IS NULL");
    expect(select.sql).toContain("t.takedown_status <> 'clear'");
    expect(select.sql).toContain("NOT EXISTS");
    expect(select.params).toEqual(["ja", "bandai-jp", null]);
    const digest = selectionDigest([jaRow(), fwRow]);
    expect(h.out).toContain(`selection: ${digest.replace(":", " ")}`);
    expect(h.out).toContain("  held (card under takedown): 1");
    expect(h.out).toContain("  www.onepiece-cardgame.com: 1");
    expect(h.out.at(-1)).toBe(`dry run: to upload exactly this selection, add --apply --expect ${digest}`);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.execFile).not.toHaveBeenCalled();
  });

  it("never selects English rows unless --lang en is given", async () => {
    const h = harness(images, uploadDb([]));
    await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl"], h.deps);
    await runUpload(["--profile", "named", "--lang", "en", "--no-ssl", "--limit", "5"], h.deps);
    expect(h.dbs[0]!.calls[1]!.params).toEqual(["ja", "bandai-jp", null]);
    expect(h.dbs[1]!.calls[1]!.params).toEqual(["en", "bandai-en", 5]);
  });

  it.each([
    [jaRow({ source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-002.png?261016" }), "source-url-outside-lane-or-names-another-card"],
    [jaRow({ source_url: "https://www.onepiece-cardgame.com/images/cardlist/card/OP01-001.png?x=1" }), "source-url-outside-lane-or-names-another-card"],
    [jaRow({ sku: "OP-OP01-001-EN" }), "key-not-in-lane-language"],
    [jaRow({ attribution: "©Eiichiro Oda/Shueisha" }), "credit-not-lane-credit"],
    [jaRow({ license_note: null }), "evidence-not-lane-evidence"],
  ])("refuses --apply when a pre-check fails, before any request: %o [C3, C4, C18]", async (row, reason) => {
    const h = harness(images, uploadDb([row]));
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl"], h.deps)).toBe(0);
    expect(h.out).toContain(`  pre-check failed, ${reason}: 1`);
    const digest = selectionDigest([row]);
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl", "--apply", "--expect", digest], h.deps)).toBe(5);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.execFile).not.toHaveBeenCalled();
  });

  it("refuses --apply without --expect, or with a stale digest, before any request [C18]", async () => {
    const h = harness(images, uploadDb([jaRow()]));
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl", "--apply"], h.deps)).toBe(5);
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl", "--apply", "--expect", selectionDigest([jaRow(), fwRow])], h.deps)).toBe(5);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.execFile).not.toHaveBeenCalled();
  });

  it("--apply uploads exactly the reviewed rows, never overwriting, under the named profile and an allowlisted environment, and records each by its full key [C14, C20]", async () => {
    const h = harness(images, uploadDb([jaRow(), fwRow]), awsOk({ "official/OP-OP01-001-JA.png": b64(PNG), "official/DBF-FB10-001-JA.webp": b64(WEBP) }));
    const digest = selectionDigest([jaRow(), fwRow]);
    expect(await runUpload(["--profile", "named", "--lang", "ja", "--no-ssl", "--apply", "--expect", digest], h.deps)).toBe(0);
    expect(h.execCalls[0]!.args).toEqual(["--version"]);
    const put = h.execCalls[1]!;
    expect(put.file).toBe("aws");
    expect(put.args).toEqual(["s3api", "put-object", "--bucket", "ctcg-card-images", "--key", "official/OP-OP01-001-JA.png", "--body", expect.stringMatching(/\.png$/),
      "--content-type", "image/png", "--checksum-sha256", b64(PNG), "--if-none-match", "*", "--profile", "named", "--region", "us-east-1", "--output", "json", "--no-cli-pager"]);
    expect(put.options.shell).toBe(false);
    // Only the allowlist reaches the child: no endpoint override, ambient profile or other credentials.
    expect(put.options.env).toEqual({ PATH: "/usr/bin", HOME: "/home/test", TMPDIR: "/tmp" });
    for (const call of h.execCalls) expect(Object.keys(call.options.env).every((name) => (AWS_CHILD_ENV as readonly string[]).includes(name))).toBe(true);
    expect(h.execCalls[2]!.args).toContain("image/webp");
    // Images fetched under the Japanese User-Agent, robots.txt first per host.
    expect(h.requests.map((r) => r.url)).toEqual(["https://www.onepiece-cardgame.com/robots.txt", jaRow().source_url, "https://www.dbs-cardgame.com/robots.txt", fwRow.source_url]);
    for (const request of h.requests) expect(request.userAgent).toBe(BANDAI_JP_USER_AGENT);
    expect(h.requests[1]!.accept).toBe("image/png");
    // One client for every statement; each row in its own transaction, recorded by its full key.
    expect(h.deps.openDb).toHaveBeenCalledOnce();
    const statements = h.dbs[0]!.calls;
    const update = statements.filter((c) => c.sql.startsWith("UPDATE card_images"));
    expect(update[0]!.sql).toContain("WHERE sku = $1 AND lang = $2 AND kind = $3 AND source = $4 AND s3_key IS NULL AND takedown_status = 'clear'");
    expect(update[0]!.params).toEqual(["OP-OP01-001-JA", "ja", "official_sample", "bandai-jp", "official/OP-OP01-001-JA.png", hex(PNG), 600, 838]);
    expect(update[1]!.params).toEqual(["DBF-FB10-001-JA", "ja", "official_sample", "bandai-jp", "official/DBF-FB10-001-JA.webp", hex(WEBP), 600, 838]);
    expect(statements.filter((c) => c.sql === "COMMIT")).toHaveLength(2);
    expect(statements.find((c) => c.sql.startsWith("SELECT takedown_status"))!.sql).toContain("FOR UPDATE NOWAIT");
    expect(h.out.at(-1)).toBe("done: uploaded 2, adopted 0, changed 0, held 0, gone 0");
  });

  it("handles English rows only under --lang en, with the English User-Agent", async () => {
    const enRow = { sku: "OP-OP01-001-EN-P1", lang: "en", kind: "official_sample", source: "bandai-en", source_url: "https://en.onepiece-cardgame.com/images/cardlist/card/OP01-001_p1.png?260701", attribution: "©Eiichiro Oda/Shueisha", license_note: null };
    const h = harness((url) => url.endsWith("/robots.txt") ? { status: 404 } : { status: 200, body: PNG, headers: { "content-type": "image/png" } }, uploadDb([enRow]), awsOk({ "official/OP-OP01-001-EN-P1.png": b64(PNG) }));
    expect(await runUpload(["--profile", "named", "--lang", "en", "--no-ssl", "--apply", "--expect", selectionDigest([enRow])], h.deps)).toBe(0);
    for (const request of h.requests) expect(request.userAgent).toBe(OFFICIAL_MEDIA_USER_AGENTS.en);
    expect(h.out.at(-1)).toBe("done: uploaded 1, adopted 0, changed 0, held 0, gone 0");
  });

  const applyArgs = (rows: Record<string, unknown>[]) => ["--profile", "named", "--lang", "ja", "--no-ssl", "--apply", "--expect", selectionDigest(rows as never)];

  it("stops before any request when the AWS CLI does not run [C19]", async () => {
    const h = harness(images, uploadDb([jaRow()]), async () => { throw Object.assign(new Error("spawn aws ENOENT"), { code: "ENOENT" }); });
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(4);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("stops at a robots.txt that disallows an image path, before that image is requested [C19]", async () => {
    const h = harness((url) => url.endsWith("/robots.txt") ? { status: 200, body: "User-agent: *\nDisallow: /images/cardlist/\n" } : images(url), uploadDb([jaRow()]), awsOk({}));
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(4);
    expect(h.requests.map((r) => r.url)).toEqual(["https://www.onepiece-cardgame.com/robots.txt"]);
  });

  it("counts a gone image and goes on, but stops past the cap [C19]", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => jaRow({ sku: `OP-OP01-${String(100 + i)}-JA`, source_url: `https://www.onepiece-cardgame.com/images/cardlist/card/OP01-${100 + i}.png` }));
    const one = harness(images, uploadDb(rows.slice(0, 1)), awsOk({}));
    expect(await runUpload(applyArgs(rows.slice(0, 1)), one.deps)).toBe(0);
    expect(one.out.at(-1)).toBe("done: uploaded 0, adopted 0, changed 0, held 0, gone 1");
    const many = harness(images, uploadDb(rows), awsOk({}));
    expect(await runUpload(applyArgs(rows), many.deps)).toBe(5);
    expect(many.err.join("\n")).toContain("more than 10 images gone");
  });

  it.each([
    [{ status: 403 }, 4], [{ status: 429 }, 4], [{ status: 503 }, 4], [{ status: 302, headers: { location: "https://elsewhere.invalid/" } }, 4],
    [{ status: 200, body: PNG, headers: { "content-type": "text/html" } }, 5],
    [{ status: 200, body: png(600, 838, 512), headers: { "content-type": "image/png" } }, 5],
    [{ status: 200, body: png(32, 32), headers: { "content-type": "image/png" } }, 5],
  ] as const)("stops on a publisher answer %o, exit %s", async (answer, code) => {
    const h = harness((url) => url.endsWith("/robots.txt") ? { status: 404 } : answer, uploadDb([jaRow()]), awsOk({}));
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(code);
    expect(h.execCalls.filter((c) => c.args[1] === "put-object")).toHaveLength(0);
  });

  it("leaves a row that changed under it, and holds one whose card went under takedown", async () => {
    const changed = harness(images, uploadDb([jaRow()], { lock: () => result([{ takedown_status: "removed", s3_key: null, held: false }]) }), awsOk({}));
    expect(await runUpload(applyArgs([jaRow()]), changed.deps)).toBe(0);
    expect(changed.out.at(-1)).toBe("done: uploaded 0, adopted 0, changed 1, held 0, gone 0");
    const held = harness(images, uploadDb([jaRow()], { lock: () => result([{ takedown_status: "clear", s3_key: null, held: true }]) }), awsOk({}));
    expect(await runUpload(applyArgs([jaRow()]), held.deps)).toBe(0);
    expect(held.out.at(-1)).toBe("done: uploaded 0, adopted 0, changed 0, held 1, gone 0");
    for (const h of [changed, held]) expect(h.execCalls.filter((c) => c.args[1] === "put-object")).toHaveLength(0);
  });

  it("stops when another session holds the row (55P03) [C19]", async () => {
    const h = harness(images, uploadDb([jaRow()], { lock: () => { throw Object.assign(new Error("could not obtain lock"), { code: "55P03" }); } }), awsOk({}));
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(3);
    expect(h.dbs[0]!.calls.at(-1)!.sql).toBe("ROLLBACK");
  });

  it("stops on a refusal from AWS, printing only its code [C19]", async () => {
    for (const code of ["AccessDenied", "ExpiredToken", "ConditionalRequestConflict"]) {
      const h = harness(images, uploadDb([jaRow()]), async (_f, args) => {
        if (args[0] === "--version") return { stdout: "aws-cli/2.17.0", stderr: "" };
        throw awsError(code, "arn:aws:iam::123456789012:user/secret-name");
      });
      expect(await runUpload(applyArgs([jaRow()]), h.deps), code).toBe(4);
      expect(h.err.join("\n")).toContain(code);
      expect(h.err.join("\n")).not.toContain("123456789012");
      expect(h.dbs[0]!.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
    }
    const unknown = harness(images, uploadDb([jaRow()]), async (_f, args) => {
      if (args[0] === "--version") return { stdout: "aws-cli/2.17.0", stderr: "" };
      throw Object.assign(new Error("boom"), { code: 1, stderr: "Traceback with /Users/someone/path" });
    });
    expect(await runUpload(applyArgs([jaRow()]), unknown.deps)).toBe(4);
    expect(unknown.err.join("\n")).toContain("aws-failed (exit 1)");
    expect(unknown.err.join("\n")).not.toContain("/Users/");
  });

  it("stops when the bucket's checksum differs from the fetched image's [C19]", async () => {
    const h = harness(images, uploadDb([jaRow()]), awsOk({ "official/OP-OP01-001-JA.png": b64(png(1, 1)) }));
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(5);
    expect(h.dbs[0]!.calls.some((c) => c.sql.startsWith("UPDATE"))).toBe(false);
  });

  it("on 412 adopts an existing object only when its stored SHA-256 and length are ours, never overwriting [F6, C19]", async () => {
    const exists = (head: Record<string, unknown>): ToolExecFile => async (_f, args) => {
      if (args[0] === "--version") return { stdout: "aws-cli/2.17.0", stderr: "" };
      if (args[1] === "put-object") throw awsError("PreconditionFailed");
      if (args[1] === "head-object") return { stdout: JSON.stringify(head), stderr: "" };
      throw new Error("unexpected");
    };
    const adopt = harness(images, uploadDb([jaRow()]), exists({ ChecksumSHA256: b64(PNG), ContentLength: PNG.length }));
    expect(await runUpload(applyArgs([jaRow()]), adopt.deps)).toBe(0);
    expect(adopt.out.at(-1)).toBe("done: uploaded 0, adopted 1, changed 0, held 0, gone 0");
    expect(adopt.execCalls[2]!.args).toEqual(["s3api", "head-object", "--bucket", "ctcg-card-images", "--key", "official/OP-OP01-001-JA.png", "--checksum-mode", "ENABLED", "--profile", "named", "--region", "us-east-1", "--output", "json", "--no-cli-pager"]);
    const other = harness(images, uploadDb([jaRow()]), exists({ ChecksumSHA256: b64(png(1, 1)), ContentLength: PNG.length }));
    expect(await runUpload(applyArgs([jaRow()]), other.deps)).toBe(5);
    const unchecked = harness(images, uploadDb([jaRow()]), exists({ ContentLength: PNG.length }));
    expect(await runUpload(applyArgs([jaRow()]), unchecked.deps)).toBe(5);
    expect(unchecked.err.join("\n")).toContain("official/OP-OP01-001-JA.png exists with no stored SHA-256");
    for (const h of [adopt, other, unchecked]) expect(h.execCalls.filter((c) => c.args[1] === "put-object")).toHaveLength(1);
  });

  it("stops when the row could not be recorded by its full key", async () => {
    const h = harness(images, uploadDb([jaRow()], { recorded: 0 }), awsOk({ "official/OP-OP01-001-JA.png": b64(PNG) }));
    expect(await runUpload(applyArgs([jaRow()]), h.deps)).toBe(5);
    expect(h.dbs[0]!.calls.at(-1)!.sql).toBe("ROLLBACK");
  });
});

describe("image dimensions from bytes", () => {
  it("reads PNG IHDR and the three WebP headers", () => {
    expect(imageDimensions(png(600, 838), "image/png")).toEqual({ width: 600, height: 838 });
    expect(imageDimensions(webp(600, 838), "image/webp")).toEqual({ width: 600, height: 838 });
    const lossy = new Uint8Array(64); lossy.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 "), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, 0x58, 0x02, 0x46, 0x03]);
    expect(imageDimensions(lossy, "image/webp")).toEqual({ width: 600, height: 838 });
    const lossless = new Uint8Array(64); const bits = (600 - 1) | ((838 - 1) << 14);
    lossless.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8L"), 0, 0, 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]);
    expect(imageDimensions(lossless, "image/webp")).toEqual({ width: 600, height: 838 });
    expect(imageDimensions(png(), "image/webp")).toBeNull();
    expect(imageDimensions(new Uint8Array(100), "image/png")).toBeNull();
  });
});

describe("tool boundary", () => {
  it("imports no database driver, process module or server-only code [C15]", () => {
    const body = readFileSync(new URL("./official-image-tools.ts", import.meta.url), "utf8");
    const imports = [...body.matchAll(/^import\b[^;]*?["']([^"']+)["'];$/gm)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(5);
    for (const specifier of imports) expect(["pg", "node:child_process", "server-only"].includes(specifier) || specifier.startsWith("@/"), specifier).toBe(false);
    expect(body).not.toMatch(/\b(?:require|import)\(/);
  });
});

beforeEach(() => { vi.restoreAllMocks(); });
