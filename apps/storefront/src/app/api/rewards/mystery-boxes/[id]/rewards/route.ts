import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { addBoxReward, updateMysteryBoxStatus } from "@/lib/rewards/db";
import { query } from "@/lib/db";

// POST — admin: add reward to box or update status
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (body.action === "add_reward") {
    if (!body.name?.trim()) return NextResponse.json({ error: "Reward name required." }, { status: 400 });
    const reward = await addBoxReward(id, body);
    return NextResponse.json({ reward });
  }

  if (body.action === "update_status") {
    await updateMysteryBoxStatus(id, body.status);
    return NextResponse.json({ status: body.status });
  }

  if (body.action === "remove_reward") {
    await query(`DELETE FROM mystery_box_rewards WHERE id=$1 AND box_id=$2`, [body.rewardId, id]);
    return NextResponse.json({ removed: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
