import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFollowers, getFollowing, getPublicProfile, isFollowing } from "@/lib/social/db";

// GET — followers OR following list for a user.
//
//   ?user=<id|username>&mode=followers  — people who follow <user>
//   ?user=<id|username>&mode=following  — people <user> follows
//
// When the caller is signed in we also return `follows_back` per row
// so the UI can render a "Follow" / "Following" badge for each entry
// without issuing N extra requests.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const identifier = url.searchParams.get("user");
  const mode = url.searchParams.get("mode") === "following" ? "following" : "followers";
  const session = await auth();

  const targetId = identifier || session?.user?.id;
  if (!targetId) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const profile = await getPublicProfile(targetId);
  if (!profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const isOwn = session?.user?.id === profile.user_id;
  // Private profiles: only the owner sees their own social graph.
  if (!profile.is_public && !isOwn) {
    return NextResponse.json({ private: true, users: [] });
  }

  const users = mode === "following"
    ? await getFollowing(profile.user_id)
    : await getFollowers(profile.user_id);

  // Attach "am I following them?" so the UI can paint the button state.
  let enriched = users;
  if (session?.user?.id) {
    const me = session.user.id;
    enriched = await Promise.all(
      users.map(async (u) => ({
        ...u,
        follows_back: u.user_id === me ? null : await isFollowing(me, u.user_id),
      })),
    );
  }

  return NextResponse.json({
    mode,
    target: { user_id: profile.user_id, username: profile.username, name: profile.name },
    users: enriched,
    isOwn,
  });
}
