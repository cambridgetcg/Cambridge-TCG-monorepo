import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * GET /api/admin/refill/history
 *
 * Returns metadata from past refill manifest files (tools/logs/refill-*.json).
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const logsDir = path.join(process.cwd(), "tools", "logs");

  try {
    const files = readdirSync(logsDir).filter((f) => f.startsWith("refill-") && f.endsWith(".json"));

    const entries = files.map((filename) => {
      try {
        const raw = JSON.parse(readFileSync(path.join(logsDir, filename), "utf-8"));
        return {
          filename,
          runAt: raw.runAt ?? null,
          dryRun: raw.dryRun ?? false,
          submitted: raw.submitted ?? 0,
          failed: raw.failed ?? 0,
          totalJpy: raw.totalJpy ?? 0,
          itemCount: Array.isArray(raw.items) ? raw.items.length : 0,
          filters: raw.filters ?? { set: null, minPrice: null, maxPrice: null },
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Sort newest first
    entries.sort((a: any, b: any) => (b.runAt || "").localeCompare(a.runAt || ""));

    return NextResponse.json(entries);
  } catch {
    // Directory doesn't exist (e.g. on Vercel)
    return NextResponse.json([]);
  }
}
