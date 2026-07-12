import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getOwnerPassport,
  publishPassportItem,
  reorderPassportDrafts,
  withdrawPassportItem,
} from "@/lib/collector-passport/db";
import { consumeActionRateLimit } from "@/lib/privacy/action-rate-limit";

const OWNER_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status: number = 200, extraHeaders: HeadersInit = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...OWNER_HEADERS, ...extraHeaders } });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in required." }, 401);

  try {
    const passport = await getOwnerPassport(session.user.id);
    return json({ passport });
  } catch (error) {
    console.error("[collector-passport] owner read failed", {
      event: "collector_passport_owner_read_unavailable",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Collector Passport is temporarily unavailable." }, 503);
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Sign in required." }, 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") {
    return json({ error: "A valid action is required." }, 400);
  }

  try {
    if (body.action === "publish") {
      if (body.acceptPublication !== true) {
        return json(
          { error: "Accept the current publication notice before publishing.", code: "notice_required" },
          400,
        );
      }
      if (typeof body.portfolioCardId !== "string" || !UUID_RE.test(body.portfolioCardId)) {
        return json({ error: "Passport item not found." }, 404);
      }
      const budget = await consumeActionRateLimit({
        action: "passport-publish",
        subject: session.user.id,
        windows: [
          { name: "hour", seconds: 3_600, limit: 10 },
          { name: "day", seconds: 86_400, limit: 20 },
        ],
      });
      if (!budget.ok) {
        return json(
          { error: "Publication safety limit is temporarily unavailable.", code: "rate_limit_unavailable" },
          503,
        );
      }
      if (!budget.allowed) {
        return json(
          { error: "Publication limit reached. Withdrawal remains available.", code: "publish_rate_limited" },
          429,
          {
            "Retry-After": String(budget.retryAfterSeconds),
            "RateLimit-Remaining": "0",
            "RateLimit-Reset": String(budget.retryAfterSeconds),
          },
        );
      }
      const result = await publishPassportItem({
        userId: session.user.id,
        portfolioCardId: body.portfolioCardId,
        publicLabel: body.publicLabel,
        publicStory: body.publicStory,
        noticeVersion: body.noticeVersion,
      });
      if (!result.ok) {
        return json({ error: result.reason, code: result.code }, result.status);
      }
      return json({ item: result.value });
    }

    if (body.action === "withdraw") {
      if (typeof body.portfolioCardId !== "string" || !UUID_RE.test(body.portfolioCardId)) {
        return json({ error: "Passport item not found." }, 404);
      }
      const result = await withdrawPassportItem({
        userId: session.user.id,
        portfolioCardId: body.portfolioCardId,
      });
      if (!result.ok) {
        return json({ error: result.reason, code: result.code }, result.status);
      }
      return json({ item: result.value });
    }

    if (body.action === "reorder") {
      const result = await reorderPassportDrafts({
        userId: session.user.id,
        portfolioCardIds: body.portfolioCardIds,
      });
      if (!result.ok) {
        return json({ error: result.reason, code: result.code }, result.status);
      }
      return json(result.value);
    }

    return json({ error: "Unknown Collector Passport action." }, 400);
  } catch (error) {
    console.error("[collector-passport] owner mutation failed", {
      event: "collector_passport_owner_mutation_unavailable",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ error: "Collector Passport could not be updated." }, 503);
  }
}
