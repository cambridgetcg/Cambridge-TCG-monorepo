import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { deployedSourceMeta, SourceRightsInputError } from "@/lib/source-rights/workbench";
import { getSourceRightsReviewHistory } from "@/lib/source-rights/workbench-db";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  const { sourceId } = await params;

  let deployed;
  try {
    deployed = deployedSourceMeta(sourceId);
  } catch (error) {
    if (error instanceof SourceRightsInputError) {
      return NextResponse.json({ error: "Source not found." }, { status: 404, headers: NO_STORE });
    }
    throw error;
  }

  try {
    const reviews = await getSourceRightsReviewHistory(sourceId);
    return NextResponse.json(
      {
        authority: {
          effective: "deployed",
          proposal_effect: "none",
        },
        deployed,
        reviews_available: true,
        reviews,
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      {
        authority: {
          effective: "deployed",
          proposal_effect: "none",
        },
        deployed,
        reviews_available: false,
        reviews: [],
      },
      { headers: NO_STORE },
    );
  }
}
