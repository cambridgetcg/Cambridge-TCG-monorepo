import { describe, it, expect } from "vitest";
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
  s3KeyFor,
  validateImageBytes,
} from "../cardrush-hires-upload";

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
