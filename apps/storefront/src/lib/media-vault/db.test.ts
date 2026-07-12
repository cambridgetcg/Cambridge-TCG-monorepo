import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

import {
  claimExpiredPendingCollectorMedia,
  deleteCollectorMediaRow,
  findOwnedCollectorMedia,
  listCollectorMedia,
  reserveCollectorMedia,
} from "./db";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const KEY = `collector-media/v1/aa/${"a".repeat(64)}.webp`;

describe("collector media persistence boundary", () => {
  beforeEach(() => queryMock.mockReset());

  it("uses the advisory-lock reservation function for quota and pending insert", async () => {
    queryMock.mockResolvedValue({ rows: [{ reserved: true }], rowCount: 1 });
    const reserved = await reserveCollectorMedia({
      id: ID,
      ownerUserId: USER_ID,
      objectKey: KEY,
      sourceMimeType: "image/jpeg",
      sourceBytes: 100,
      sourceWidth: 10,
      sourceHeight: 10,
      storedBytes: 80,
      width: 10,
      height: 10,
      sha256Hex: "a".repeat(64),
    });

    expect(reserved).toBe(true);
    expect(queryMock.mock.calls[0][0]).toContain("reserve_collector_media_vault_object");
    expect(queryMock.mock.calls[0][1]).toEqual([
      ID,
      USER_ID,
      KEY,
      "image/jpeg",
      100,
      10,
      10,
      80,
      10,
      10,
      "a".repeat(64),
    ]);
  });

  it("does not select object keys or URLs in owner lists", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    await listCollectorMedia(USER_ID);

    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).not.toContain("object_key");
    expect(sql.toLowerCase()).not.toContain("url");
    expect(queryMock.mock.calls[0][1]).toEqual([USER_ID, 20]);
  });

  it("binds both id and owner for access and deletion", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });

    await findOwnedCollectorMedia(ID, USER_ID, true);
    expect(queryMock.mock.calls[0][0]).toContain("id = $1 AND owner_user_id = $2");
    expect(queryMock.mock.calls[0][0]).toContain("status = 'ready'");
    expect(queryMock.mock.calls[0][1]).toEqual([ID, USER_ID]);

    await deleteCollectorMediaRow(ID, USER_ID);
    expect(queryMock.mock.calls[1][0]).toContain("id = $1 AND owner_user_id = $2");
    expect(queryMock.mock.calls[1][1]).toEqual([ID, USER_ID]);
  });

  it("atomically claims expired pending rows before object deletion", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    await claimExpiredPendingCollectorMedia(25);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("SET status = 'deleting'");
    expect(sql).toContain("status = 'deleting' AND cleanup_claimed_at");
  });
});
