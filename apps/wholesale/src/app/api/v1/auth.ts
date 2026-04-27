import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channelApiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function authenticateApiKey(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7);
  if (!rawKey) return null;

  const keyHash = hashKey(rawKey);
  const [row] = await db
    .select()
    .from(channelApiKeys)
    .where(eq(channelApiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return null;

  // Update lastUsedAt (fire-and-forget)
  db.update(channelApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(channelApiKeys.id, row.id))
    .execute()
    .catch(() => {});

  return row;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
