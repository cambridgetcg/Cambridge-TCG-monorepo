import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/lib/auth";
import { magicLinkRequestCapacity } from "@/lib/auth/adapter";

export const GET = handlers.GET;

export async function POST(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname === "/api/auth/signin/email") {
    let email: string | null = null;
    try {
      const form = await request.clone().formData();
      const raw = form.get("email");
      if (typeof raw === "string") email = raw.trim().toLowerCase();
    } catch {
      // Auth.js owns malformed-body handling. Do not turn its established
      // response contract into a second parser contract here.
    }

    if (email) {
      const capacity = await magicLinkRequestCapacity(email);
      if (!capacity.allowed) {
        const retryAfter = Math.max(1, capacity.retryAfterSeconds);
        const atGlobalLimit = capacity.reason === "global";
        return NextResponse.json(
          {
            error: atGlobalLimit
              ? "Sign-in email is temporarily at its service-wide safety limit."
              : "This email address has reached its active sign-in token limit.",
            code: atGlobalLimit
              ? "magic_link_global_limit"
              : "magic_link_email_limit",
            scope: capacity.reason,
          },
          {
            status: 429,
            headers: {
              "Cache-Control": "private, no-store",
              "Retry-After": String(retryAfter),
            },
          },
        );
      }
    }
  }

  return handlers.POST(request);
}
