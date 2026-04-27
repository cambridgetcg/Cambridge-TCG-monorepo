import { NextResponse } from "next/server";

// Admin login is now handled through the standard NextAuth magic-link flow.
// Admin users log in at /login like any other user — their role='admin' on
// the users table gives them admin access.
//
// This route is kept as a redirect for any bookmarks or client code that
// still references it. The old shared-password system is removed.

export async function POST() {
  return NextResponse.json(
    {
      error: "Admin login has moved to the standard sign-in flow at /login. Admin users are identified by their account role, not a shared password.",
    },
    { status: 410 } // Gone
  );
}

export async function GET() {
  return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL || "https://cambridgetcg.com"));
}
