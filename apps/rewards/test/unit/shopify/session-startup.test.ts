import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));

import { EncryptedPrismaSessionStorage } from "~/shopify/session-storage.server";

/**
 * The library checks for its session table when it is constructed, at module
 * load, and every session call waits for that check. On Vercel the check's
 * connection can stall while an idle instance is paused, so the next request
 * waited for the library's 5 s retry; and two failed checks (a database blip
 * at start) left the storage refusing every call until the instance was
 * replaced. Session calls must not wait on that check (seen on production,
 * 2026-11-06).
 */

const ONLINE_ID = "online-session-id";

function fakePrisma(count: () => Promise<number>) {
  const findUnique = vi.fn(async () => null);
  const prisma = { session: { count: vi.fn(count), findUnique } } as unknown as PrismaClient;
  return { prisma, findUnique };
}

const within = <T>(ms: number, work: Promise<T>) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms))]);

describe("session storage startup", () => {
  it("answers while the table check's connection is stalled", async () => {
    const { prisma, findUnique } = fakePrisma(() => new Promise<number>(() => {}));
    const storage = new EncryptedPrismaSessionStorage(prisma);

    await expect(within(500, storage.loadSession(ONLINE_ID))).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("keeps answering after the table check failed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { prisma, findUnique } = fakePrisma(async () => {
      throw new Error("Connection terminated due to connection timeout");
    });
    const storage = new EncryptedPrismaSessionStorage(prisma);

    await expect(within(500, storage.loadSession(ONLINE_ID))).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});
