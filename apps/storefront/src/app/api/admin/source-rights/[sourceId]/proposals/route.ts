import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { readBoundedJson, SourceRightsInputError } from "@/lib/source-rights/workbench";
import { createSourceRightsDraft } from "@/lib/source-rights/workbench-db";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const MAX_BODY_BYTES = 65_536;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers: NO_STORE });
  }
  const { sourceId } = await params;

  try {
    const body = await readBoundedJson(request, MAX_BODY_BYTES);
    const review = await createSourceRightsDraft({
      sourceId,
      createdBy: admin.id,
      body,
    });
    return NextResponse.json({ review }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof SourceRightsInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    if (error instanceof Error && /current open review/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE });
    }
    console.error("[source-rights/proposal] persistence unavailable", {
      event: "source_rights_proposal_unavailable",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "The proposal ledger is unavailable. Nothing was recorded." },
      { status: 503, headers: NO_STORE },
    );
  }
}
