import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/db.server", () => ({ default: {}, databaseSchema: "rewards" }));

import { EncryptedPrismaSessionStorage } from "~/shopify/session-storage.server";

/**
 * The library checks for its session table when it is constructed, at module
 * load, and every session call waits for that check. On Vercel the check's
 * connection could stall while an idle instance was paused, so the next
 * request waited for the library's 5 s retry; and two failed checks (a
 * database blip at start) left the storage refusing every call until the
 * instance was replaced. Seen on production, 2026-11-06.
 */

const ONLINE_ID = "online-session-id";

function fakePrisma() {
  const count = vi.fn(() => new Promise<number>(() => {}));
  const findUnique = vi.fn(async () => null);
  const prisma = { session: { count, findUnique } } as unknown as PrismaClient;
  return { prisma, count, findUnique };
}

const within = <T>(ms: number, work: Promise<T>) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms))]);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("session storage startup", () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
    unhandled.length = 0;
  });

  it("queries nothing when it is constructed", async () => {
    const { prisma, count } = fakePrisma();
    new EncryptedPrismaSessionStorage(prisma);
    await settle();

    expect(count).not.toHaveBeenCalled();
  });

  it("answers session calls without waiting for a table check", async () => {
    const { prisma, findUnique } = fakePrisma();
    const storage = new EncryptedPrismaSessionStorage(prisma);

    await expect(within(500, storage.loadSession(ONLINE_ID))).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("keeps answering, with no unhandled rejection, once the unused check has failed", async () => {
    process.on("unhandledRejection", onUnhandled);
    const { prisma, findUnique } = fakePrisma();
    const storage = new EncryptedPrismaSessionStorage(prisma);
    // The library's own check has failed by now (no attempts)
    await settle();

    expect(unhandled).toEqual([]);
    await expect(within(500, storage.loadSession(ONLINE_ID))).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledOnce();
  });
});
