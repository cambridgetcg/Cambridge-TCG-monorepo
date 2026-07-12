import { NextResponse } from "next/server";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { requireAdmin } from "@/lib/admin/auth";
import { listLatestSourceRightsReviews } from "@/lib/source-rights/workbench-db";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });

  let reviewsAvailable = true;
  let latest = new Map<string, Awaited<ReturnType<typeof listLatestSourceRightsReviews>>[number]>();
  try {
    latest = new Map((await listLatestSourceRightsReviews()).map((review) => [review.source_id, review]));
  } catch {
    reviewsAvailable = false;
  }

  return NextResponse.json(
    {
      authority: {
        effective: "deployed @cambridge-tcg/data-ingest registry",
        proposals: "not effective; code review and deployment required",
      },
      reviews_available: reviewsAvailable,
      sources: listSourceMeta().map((meta) => ({
        id: meta.id,
        name: meta.name,
        status: meta.status,
        safe_default: meta.rights.safe_default,
        redistribution_verdict: meta.rights.redistribution.verdict,
        reviewed_at: meta.rights.reviewed_at,
        evidence_count: meta.rights.evidence_urls.length,
        latest_proposal: latest.get(meta.id) ?? null,
      })),
    },
    { headers: NO_STORE },
  );
}
