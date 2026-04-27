import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { getDrawProof, verifyDraw, commitSeed, provablyFairDraw } from "@/lib/rewards/provable-fair";

// GET — public: view draw proof + verification
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proof = await getDrawProof(id);

  if (!proof) {
    return NextResponse.json({ error: "No draw proof available yet." }, { status: 404 });
  }

  // Auto-verify
  const verification = verifyDraw(proof);

  return NextResponse.json({
    proof: {
      seed_commitment: proof.seed_commitment,
      server_seed: proof.server_seed,
      entry_hash: proof.entry_hash,
      combined_hash: proof.combined_hash,
      winner_index: proof.winner_index,
      total_weighted_entries: proof.total_weighted_entries,
      entries: proof.entries,
      blockchain_tx_hash: proof.blockchain_tx_hash,
      blockchain_network: proof.blockchain_network,
    },
    verification,
  });
}

// POST — admin: commit seed or execute provably fair draw
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "commit") {
    const { seedCommitment } = await commitSeed(id);
    return NextResponse.json({
      seedCommitment,
      message: "Seed committed. This hash is now public. The seed will be revealed after the draw.",
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
