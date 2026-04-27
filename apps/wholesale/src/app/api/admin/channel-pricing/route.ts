import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { channelPricing, cards } from "@/lib/db/schema";
import { eq, asc, isNotNull, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/channel-pricing";
import { computePrice, type ChannelConfig, DEFAULTS } from "@/lib/pricing";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

// Reference JPY amounts for sample price computation
const SAMPLE_JPY = [500, 2000, 10000];

function computeSamples(config: ChannelConfig, gbpJpyRate: number) {
  return SAMPLE_JPY.map((jpy) => ({
    jpy,
    singles: computePrice(jpy, gbpJpyRate, config, "singles").price,
    sealed: computePrice(jpy, gbpJpyRate, config, "sealed").price,
  }));
}

export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(channelPricing)
    .orderBy(asc(channelPricing.id));

  // Get a recent gbpJpyRate from any card that has one
  const [rateRow] = await db
    .select({ gbpJpyRate: cards.gbpJpyRate })
    .from(cards)
    .where(isNotNull(cards.gbpJpyRate))
    .orderBy(desc(cards.lastSyncedAt))
    .limit(1);
  const gbpJpyRate = rateRow?.gbpJpyRate ?? 190;

  const configs = rows.map((row) => {
    const defaults = DEFAULTS[row.channel] ?? DEFAULTS.wholesale;
    const config: ChannelConfig = {
      channel: row.channel,
      marginMultiplier: row.marginMultiplier ?? defaults.marginMultiplier,
      flatFeeSingles: row.flatFeeSingles ?? defaults.flatFeeSingles,
      flatFeeSealed: row.flatFeeSealed ?? defaults.flatFeeSealed,
      vatMultiplier: row.vatMultiplier ?? defaults.vatMultiplier,
      retailMultiplier: row.retailMultiplier ?? defaults.retailMultiplier,
      roundTo: row.roundTo ?? defaults.roundTo,
    };

    return {
      ...row,
      samples: computeSamples(config, gbpJpyRate),
    };
  });

  return NextResponse.json({ configs, gbpJpyRate });
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { channel, ...fields } = body;

  if (!channel || typeof channel !== "string") {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  // Only allow updating known numeric fields
  const allowedFields = [
    "label", "description", "marginMultiplier", "flatFeeSingles", "flatFeeSealed",
    "vatMultiplier", "retailMultiplier", "roundTo", "active",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowedFields) {
    if (key in fields) {
      updates[key] = fields[key];
    }
  }

  await db
    .update(channelPricing)
    .set(updates)
    .where(eq(channelPricing.channel, channel));

  invalidateCache();

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { channel, label, ...rest } = body;

  if (!channel || !label) {
    return NextResponse.json({ error: "channel and label are required" }, { status: 400 });
  }

  const allowedFields = [
    "description", "marginMultiplier", "flatFeeSingles", "flatFeeSealed",
    "vatMultiplier", "retailMultiplier", "roundTo", "active",
  ] as const;

  const values: Record<string, unknown> = { channel, label };
  for (const key of allowedFields) {
    if (key in rest) {
      values[key] = rest[key];
    }
  }

  await db.insert(channelPricing).values(values as typeof channelPricing.$inferInsert);
  invalidateCache();

  return NextResponse.json({ ok: true }, { status: 201 });
}
