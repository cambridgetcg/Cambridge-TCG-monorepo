import { describe, it, expect } from "vitest";
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
  s3KeyFor,
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
