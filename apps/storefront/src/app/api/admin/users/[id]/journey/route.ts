import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { getUserJourney } from "@/lib/journey/timeline";

// Admin "user 360" endpoint — full forensic timeline with no privacy
// filter. Support uses this to answer "what happened to this user?"
// without diff'ing nightly DB snapshots.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const events = await getUserJourney(id, {
    perSource: 100, // admin gets a deeper window than the customer view
    hideAdminOnly: false,
  });

  return NextResponse.json({ events });
}
