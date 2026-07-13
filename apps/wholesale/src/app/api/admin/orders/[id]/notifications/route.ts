import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { PUBLIC_INTERNAL_ERROR } from "@/lib/public-errors";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id);

  const result = await db
    .select()
    .from(notifications)
    .where(eq(notifications.orderId, orderId))
    .orderBy(desc(notifications.sentAt));

  return NextResponse.json(
    result.map((notification) => ({
      ...notification,
      error: notification.error ? PUBLIC_INTERNAL_ERROR : null,
    })),
  );
}
