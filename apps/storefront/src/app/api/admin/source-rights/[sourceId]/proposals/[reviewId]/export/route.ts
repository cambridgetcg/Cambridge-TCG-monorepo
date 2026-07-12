import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import {
  buildSourceRightsArtifact,
  deployedSourceMeta,
  SourceRightsInputError,
  sourceRightsArtifactJson,
  sourceRightsRevisionHash,
} from "@/lib/source-rights/workbench";
import { getSourceRightsReviewHistory } from "@/lib/source-rights/workbench-db";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string; reviewId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  const { sourceId, reviewId } = await params;
  try {
    deployedSourceMeta(sourceId);
  } catch (error) {
    if (error instanceof SourceRightsInputError) {
      return NextResponse.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
    }
    throw error;
  }
  if (!UUID_RE.test(reviewId)) {
    return NextResponse.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
  }

  try {
    const history = await getSourceRightsReviewHistory(sourceId);
    const review = history.find((entry) => entry.id === reviewId);
    if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404, headers: NO_STORE });
    const parent = review.parent_review_id
      ? history.find((entry) => entry.id === review.parent_review_id)
      : null;
    const artifact = buildSourceRightsArtifact({
      sourceId,
      state: review.state,
      baseRegistryHash: review.base_registry_hash,
      parentRevisionHash: parent?.revision_hash ?? null,
      decisionNote: review.decision_note,
      landedCommit: review.landed_commit,
      content: {
        summary: review.summary,
        public_evidence: review.public_evidence,
        agreement_reference: review.agreement_reference,
        valid_until: review.valid_until,
        review_trigger: review.review_trigger,
        cells: review.cells ?? [],
      },
    });
    const computed = sourceRightsRevisionHash(artifact);
    if (computed !== review.revision_hash) {
      return NextResponse.json(
        { error: "Stored review does not match its deterministic hash." },
        { status: 409, headers: NO_STORE },
      );
    }
    return new NextResponse(sourceRightsArtifactJson(artifact), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="source-rights-${sourceId}-${computed.slice(0, 12)}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "The proposal ledger is unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }
}
