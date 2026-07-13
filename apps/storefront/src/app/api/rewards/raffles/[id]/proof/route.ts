import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import {
  commitSeed,
  getDrawProof,
  provablyFairDraw,
  toPublicDrawProof,
  verifyDraw,
  verifyPublicDraw,
} from "@/lib/rewards/provable-fair";

// GET — public: view draw proof + verification
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proof = await getDrawProof(id);

  if (!proof) {
    return NextResponse.json({ error: "No draw proof available yet." }, { status: 404 });
  }

  const publicProof = toPublicDrawProof(proof);
  const verification = verifyPublicDraw(publicProof);

  return NextResponse.json({
    proof: publicProof,
    verification,
  });
}

// POST — admin: store a seed commitment or execute the recorded draw
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "commit") {
    const { seedCommitment } = await commitSeed(id);
    return NextResponse.json({
      seedCommitment,
      message: "Seed and commitment stored in our database. Active raffle listings expose the hash; drafts do not. It is not externally anchored. The seed is revealed after the draw.",
    });
  }

  if (body.action === "draw") {
    const { winner, proof } = await provablyFairDraw(id);
    const verification = verifyDraw(proof);

    return NextResponse.json({
      winner: winner ? {
        user_id: winner.user_id,
        entry_count: winner.entry_count,
      } : null,
      proof: {
        seed_commitment: proof.seed_commitment,
        server_seed: proof.server_seed,
        entry_hash: proof.entry_hash,
        combined_hash: proof.combined_hash,
        winner_index: proof.winner_index,
        total_weighted_entries: proof.total_weighted_entries,
        entry_count: proof.entries.length,
      },
      verification,
    });
  }

  return NextResponse.json({ error: "Unknown action. Use 'commit' or 'draw'." }, { status: 400 });
}
