import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toggleFollow } from "@/lib/social/db";
import { isBlockedEither } from "@/lib/messages/db";
import { notify } from "@/lib/notifications/db";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { userId } = await request.json();
  if (!userId) return NextResponse.json({ error: "User ID required." }, { status: 400 });
  if (userId === session.user.id) {
    return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
  }

  // Same bidirectional gate as messaging (assertCanMessage): a block in
  // either direction means no follower-list presence and no bell ping.
  if (await isBlockedEither(session.user.id, userId)) {
    return NextResponse.json(
      { error: "Cannot follow — block list prevents this." },
      { status: 403 },
    );
  }

  const following = await toggleFollow(session.user.id, userId);

  // Fire a one-shot notification on new follows. Idempotent via the
  // (reference_type, reference_id, kind) tuple — a follow/unfollow/
  // re-follow cycle will not spam the target.
  if (following) {
    const me = await query(
      `SELECT username, name FROM users WHERE id=$1`,
      [session.user.id],
    );
    const row = me.rows[0];
    const label = row?.username ? `@${row.username}` : (row?.name || "Someone");
    const linkUrl = row?.username ? `/u/${row.username}` : `/u/${session.user.id}`;
    await notify({
      userId,
      kind: "follow.new",
      title: `${label} started following you`,
      linkUrl,
      referenceType: "follow",
      referenceId: `${session.user.id}:${userId}`,
    });
  }

  return NextResponse.json({ following });
}
