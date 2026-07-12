import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
  HIRES_GAMES,
  cardrushImagePattern,
  hiresQueueStatus,
  s3KeyFor,
  validateImageBytes,
  runHiresUpload,
} from "../cardrush-hires-upload";

// Module mocks. vi.mock is hoisted automatically so these intercept the
// runner's imports even though they appear after the import statements
// here. Mock paths must match the runner's import specifiers exactly.
vi.mock("../db", () => {
  return {
    db: {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      execute: vi.fn(),
    },
  };
});

vi.mock("@cambridge-tcg/aws/s3", () => {
  class HeadObjectCommand {
    constructor(args: unknown) { Object.assign(this, args ?? {}); }
  }
  class PutObjectCommand {
    constructor(args: unknown) { Object.assign(this, args ?? {}); }
  }
  return {
    createS3ClientOrThrow: vi.fn(),
    HeadObjectCommand,
    PutObjectCommand,
  };
});

describe("BUCKET_BY_GAME", () => {
  it("maps pkm to jp-pk-photos", () => {
    expect(BUCKET_BY_GAME.pkm).toBe("jp-pk-photos");
  });
  it("maps op to jp-op-photos", () => {
    expect(BUCKET_BY_GAME.op).toBe("jp-op-photos");
  });
  it("maps dbf to jp-db-photos", () => {
    expect(BUCKET_BY_GAME.dbf).toBe("jp-db-photos");
  });
});

describe("CARDRUSH_HOST_BY_GAME", () => {
  it("maps pkm to www.cardrush-pokemon.jp", () => {
    expect(CARDRUSH_HOST_BY_GAME.pkm).toBe("www.cardrush-pokemon.jp");
  });
});

describe("HIRES_GAMES", () => {
  it("covers every game with a cardrush host", () => {
    expect(HIRES_GAMES).toEqual(["pkm", "op", "dbf"]);
  });
});

describe("cardrushImagePattern", () => {
  // Real prod image_url shapes, verified 2026-07-05:
  //   pkm https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/…
  //   op  https://www.cardrush-op.jp/data/cardrush-op/_/…
  //   dbf https://www.cardrush-db.jp/data/cardrush-db/_/…
  const REAL_URLS = {
    pkm: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/70726f647563742f4352505f4d335f3036302e6a7067.jpg",
    op: "https://www.cardrush-op.jp/data/cardrush-op/_/70726f647563742f4f5031353030315f303434365f33362e6a7067.jpg",
    dbf: "https://www.cardrush-db.jp/data/cardrush-db/_/70726f647563742f32303236303230335f3039323039332e6a7067.jpg",
  } as const;

  // SQL LIKE with only a trailing % is a prefix match.
  const likeMatches = (pattern: string, value: string) =>
    value.startsWith(pattern.slice(0, -1));

  it("matches the real prod image URL for every game", () => {
    for (const game of HIRES_GAMES) {
      expect(likeMatches(cardrushImagePattern(game), REAL_URLS[game])).toBe(true);
    }
  });

  it("does not match S3-rewritten or foreign URLs", () => {
    expect(
      likeMatches(
        cardrushImagePattern("pkm"),
        "https://jp-op-photos.s3.amazonaws.com/hires/SV1S/PK-SV1S-011.jpg",
      ),
    ).toBe(false);
    expect(
      likeMatches(cardrushImagePattern("op"), REAL_URLS.pkm),
    ).toBe(false);
  });

  it("would have rejected the dead pre-2026-07-05 pattern's assumption", () => {
    // The old pattern required /data/cardrush-%/product/% — real pkm URLs
    // have no hyphen after cardrush and /_/ instead of /product/.
    expect(REAL_URLS.pkm.includes("/product/")).toBe(false);
    expect(REAL_URLS.pkm.includes("/data/cardrush-")).toBe(false);
  });
});

describe("s3KeyFor", () => {
  it("builds hires/{set_code}/{sku}.jpg", () => {
    expect(s3KeyFor({ set_code: "SV1S", sku: "PKM-SV1S-001-JP-V42" }))
      .toBe("hires/SV1S/PKM-SV1S-001-JP-V42.jpg");
  });
  it("preserves set_code case", () => {
    expect(s3KeyFor({ set_code: "sv1S", sku: "x" })).toBe("hires/sv1S/x.jpg");
  });
});

describe("validateImageBytes", () => {
  function jpegBytes(size: number): Buffer {
    const b = Buffer.alloc(size);
    b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
    return b;
  }
  function pngBytes(size: number): Buffer {
    const b = Buffer.alloc(size);
    b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
    return b;
  }

  it("accepts a 50KB JPEG", () => {
    expect(validateImageBytes(jpegBytes(50_000))).toEqual({ ok: true });
  });
  it("rejects bytes shorter than 5KB", () => {
    expect(validateImageBytes(jpegBytes(3_000))).toEqual({
      ok: false,
      reason: "too_small",
    });
  });
  it("rejects PNG magic bytes", () => {
    expect(validateImageBytes(pngBytes(50_000))).toEqual({
      ok: false,
      reason: "not_jpeg",
    });
  });
  it("rejects empty buffer", () => {
    expect(validateImageBytes(Buffer.alloc(0))).toEqual({
      ok: false,
      reason: "too_small",
    });
  });
});

describe("runHiresUpload source-rights gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops before database, S3, or HTTP work", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const dbModule = await import("../db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const createS3 = awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>;
    for (const operation of Object.values(db)) operation.mockReset?.();
    createS3.mockReset();

    await expect(runHiresUpload({ game: "pkm", maxBatch: 1 }))
      .rejects.toThrow("formal partnership");

    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(createS3).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Retained as reactivation fixtures. They must stay skipped while the immutable
// source-rights gate is false; a reviewed partnership would update the gate and
// re-enable these implementation tests in the same release.
describe.skip("runHiresUpload — retired implementation happy path", () => {
  const mockFetch = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
    // Reset module-mock state between tests.
    const dbModule = await import("../db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    (dbModule.db.insert as ReturnType<typeof vi.fn>).mockReset?.();
    (dbModule.db.select as ReturnType<typeof vi.fn>).mockReset?.();
    (dbModule.db.update as ReturnType<typeof vi.fn>).mockReset?.();
    (dbModule.db.execute as ReturnType<typeof vi.fn>).mockReset?.();
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReset?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a row whose image is missing from S3", async () => {
    const dbModule = await import("../db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, ReturnType<typeof vi.fn>>;

    // db.insert(ingestRun).values({...}).returning({id}) → [{id: 1}]
    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });

    // db.select() chained, returns games row first, then cards rows.
    let selectCall = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCall += 1;
        if (selectCall === 1) {
          // games
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 99 }]),
            }),
          };
        }
        // cards batch
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{
                id: 7,
                sku: "PKM-SV1S-001-JP-V42",
                setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/SV1S_1.jpg",
              }]),
            }),
          }),
        };
      }),
    }));

    // db.update(cards|ingestRun).set(...).where(...) → resolves
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // db.execute(sql`SELECT count(*) AS matched, ... AS remaining`) — the
    // one card in the batch is the only pattern match; archived after this run.
    db.execute.mockResolvedValue([{ matched: 1, remaining: 0 }]);

    // S3 client: HEAD throws NotFound; PUT resolves.
    const s3Send = vi.fn().mockImplementation((cmd) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        const err = new Error("NotFound");
        (err as { name: string }).name = "NotFound";
        throw err;
      }
      return Promise.resolve({});
    });
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });

    // Fetch returns a 50KB JPEG.
    const jpegBuf = Buffer.alloc(50_000);
    jpegBuf[0] = 0xff; jpegBuf[1] = 0xd8; jpegBuf[2] = 0xff;
    mockFetch.mockResolvedValueOnce(
      new Response(jpegBuf, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );

    // Act
    const result = await runHiresUpload({ game: "pkm", maxBatch: 1 });

    // Assert
    expect(result.game).toBe("pkm");
    expect(result.bucket).toBe("jp-pk-photos");
    expect(result.processed).toBe(1);
    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.ingestRunId).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe.skip("runHiresUpload — retired implementation non-happy paths", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: same chain-mock setup as Task 4, exposed so each test
  // can override the leaves it cares about. Note relative path "../db"
  // matches the runner's `import { db } from "./db"`.
  async function wireMocks(opts: {
    cards?: Array<{ id: number; sku: string; setCode: string; imageUrl: string }>;
    headBehavior?: "found" | "not_found" | "throws_other";
    s3PutBehavior?: "ok" | "throws";
    remaining?: number;
    matched?: number;
  }) {
    const dbModule = await import("../db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, ReturnType<typeof vi.fn>>;

    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 99 }]),
            }),
          };
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(opts.cards ?? []),
            }),
          }),
        };
      }),
    }));
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    db.execute.mockResolvedValue([
      {
        matched: opts.matched ?? opts.remaining ?? 0,
        remaining: opts.remaining ?? 0,
      },
    ]);
    const s3Send = vi.fn().mockImplementation((cmd) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        if (opts.headBehavior === "found") return Promise.resolve({});
        if (opts.headBehavior === "throws_other") {
          const err = new Error("Service error");
          (err as { name: string }).name = "ServiceUnavailable";
          throw err;
        }
        const err = new Error("NotFound");
        (err as { name: string }).name = "NotFound";
        throw err;
      }
      if (opts.s3PutBehavior === "throws") {
        return Promise.reject(new Error("Access denied"));
      }
      return Promise.resolve({});
    });
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });
    return { s3Send };
  }

  it("skips a row whose key already exists in S3", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/SV1S_1.jpg" }],
      headBehavior: "found",
    });
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("counts a 404 image fetch as failed without marking archived", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/SV1S_1.jpg" }],
      headBehavior: "not_found",
    });
    mockFetch.mockResolvedValueOnce(new Response("", { status: 404 }));
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.failed).toBe(1);
  });

  it("counts a 3KB tiny response as failed (too_small)", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/SV1S_1.jpg" }],
      headBehavior: "not_found",
    });
    mockFetch.mockResolvedValueOnce(new Response(Buffer.alloc(3_000), { status: 200 }));
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.failed).toBe(1);
  });

  it("returns processed=0, remaining=N when batch is empty", async () => {
    await wireMocks({ cards: [], remaining: 68_941, matched: 70_000 });
    const r = await runHiresUpload({ game: "pkm", maxBatch: 100 });
    expect(r.processed).toBe(0);
    expect(r.uploaded).toBe(0);
    expect(r.remaining).toBe(68_941);
    expect(r.matched).toBe(70_000);
  });

  it("reports matched=0 (pattern found nothing) distinctly from all-archived", async () => {
    await wireMocks({ cards: [], remaining: 0, matched: 0 });
    const r = await runHiresUpload({ game: "op", maxBatch: 100 });
    expect(r.matched).toBe(0);
    expect(r.remaining).toBe(0);
  });
});

describe("hiresQueueStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps per-game rows and zero-fills games absent from the result", async () => {
    const dbModule = await import("../db");
    const db = dbModule.db as unknown as Record<string, ReturnType<typeof vi.fn>>;
    db.execute.mockResolvedValue([
      { game: "pkm", matched: 349, remaining: 349 },
      { game: "op", matched: 252, remaining: 12 },
      // dbf absent — e.g. no games row in a fresh dev DB
    ]);
    const status = await hiresQueueStatus();
    expect(status.pkm).toEqual({ matched: 349, remaining: 349 });
    expect(status.op).toEqual({ matched: 252, remaining: 12 });
    expect(status.dbf).toEqual({ matched: 0, remaining: 0 });
  });
});

describe.skip("runHiresUpload — retired implementation dry-run", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("counts would-upload toward uploaded and emits would_upload event without S3 PUT", async () => {
    const dbModule = await import("../db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, ReturnType<typeof vi.fn>>;

    db.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    let selectCallCount = 0;
    db.select.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 99 }]) }) };
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 7, sku: "X", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrushpokemon/_/SV1S_1.jpg" }]),
            }),
          }),
        };
      }),
    }));
    db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    db.execute.mockResolvedValue([{ count: 0 }]);
    const s3Send = vi.fn().mockImplementation(() => {
      const err = new Error("NotFound");
      (err as { name: string }).name = "NotFound";
      throw err;
    });
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });

    const r = await runHiresUpload({ game: "pkm", maxBatch: 1, dryRun: true });
    expect(r.uploaded).toBe(1);   // counted-as-uploaded for symmetry
    expect(r.dryRun).toBe(true);
    // S3 send was called once for HEAD; never for PutObject.
    expect(s3Send.mock.calls.filter((c) => c[0].constructor.name === "PutObjectCommand").length).toBe(0);
  });
});
