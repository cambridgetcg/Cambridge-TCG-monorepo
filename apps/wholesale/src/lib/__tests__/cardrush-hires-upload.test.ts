import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
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
  it("maps dbs to jp-db-photos", () => {
    expect(BUCKET_BY_GAME.dbs).toBe("jp-db-photos");
  });
});

describe("CARDRUSH_HOST_BY_GAME", () => {
  it("maps pkm to www.cardrush-pokemon.jp", () => {
    expect(CARDRUSH_HOST_BY_GAME.pkm).toBe("www.cardrush-pokemon.jp");
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

describe("runHiresUpload — happy path", () => {
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
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg",
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

    // db.execute(sql`SELECT count(*)...`) → [{ count: 0 }]
    db.execute.mockResolvedValue([{ count: 0 }]);

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
