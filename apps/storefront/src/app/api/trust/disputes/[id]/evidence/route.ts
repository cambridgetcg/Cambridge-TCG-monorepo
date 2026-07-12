import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/admin/auth";
import {
  getDisputeEvidence,
  userCanAccessDispute,
} from "@/lib/trust/db";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// GET — list evidence attached to the dispute. Admin or party only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  if (!admin) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!(await userCanAccessDispute(id, session.user.id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }
  const evidence = await getDisputeEvidence(id);
  return NextResponse.json(
    {
      evidence: evidence.map((item) => ({
        id: item.id,
        dispute_id: item.dispute_id,
        label: item.label,
        created_at: item.created_at,
        access: "withheld_pending_private_storage",
      })),
    },
    { headers: PRIVATE_HEADERS },
  );
}

// POST — two-step upload:
//
//   { contentType: "image/jpeg" }
//     → returns { uploadUrl, imageUrl, s3Key } for direct S3 PUT.
//
//   { s3Key, url, label? }
//     → after the client finishes the S3 PUT, call again to persist
//       the dispute_evidence row.
//
// Admin or party may upload. Counter-party evidence is useful too
// (seller uploading proof-of-shipment photos, etc.), so we don't
// restrict to just the raiser.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const admin = await isAdmin();
  const session = admin ? null : await auth();
  if (!admin) {
    if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (!(await userCanAccessDispute(id, session.user.id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
  }
  void request;
  return NextResponse.json(
    {
      error:
        "Dispute-evidence uploads are paused until private storage, byte limits and retention are verified.",
      code: "dispute_evidence_intake_paused",
    },
    { status: 503, headers: PRIVATE_HEADERS },
  );
}
