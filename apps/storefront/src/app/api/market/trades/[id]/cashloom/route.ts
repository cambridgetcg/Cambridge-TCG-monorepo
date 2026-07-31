import { auth } from "@/lib/auth";
import {
  authorizeCashloomTradeSeller,
  getCashloomTradeHandoffView,
  isCashloomSettlementMigrationMissing,
  prepareCashloomTradeHandoff,
  type CashloomPrepareFailure,
  type CashloomTradeAccessFailure,
} from "@/lib/cashloom/db";
import { parseCashloomPrepareAction, parseCashloomTradeId } from "@/lib/cashloom/contract";
import {
  cashloomError,
  cashloomPrivateJson,
  readCashloomJsonBody,
} from "@/lib/cashloom/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unavailable() {
  return cashloomError(
    "CASHLOOM_SETTLEMENT_UNAVAILABLE",
    "CashLoom trade handoffs are temporarily unavailable because their database migration is not ready.",
    503,
  );
}

function accessFailure(result: CashloomTradeAccessFailure) {
  if (result.reason === "not_found") {
    return cashloomError("TRADE_NOT_FOUND", "Trade not found.", 404);
  }
  return cashloomError("TRADE_FORBIDDEN", "Only trade participants can view this handoff.", 403);
}

function prepareFailure(result: CashloomPrepareFailure) {
  switch (result.reason) {
    case "not_found":
    case "forbidden":
      return accessFailure(result);
    case "trade_not_awaiting_payment":
      return cashloomError(
        "TRADE_NOT_AWAITING_PAYMENT",
        "A CashLoom handoff can only be prepared while the trade is awaiting payment.",
        409,
      );
    case "payment_window_expired":
      return cashloomError(
        "PAYMENT_WINDOW_EXPIRED",
        "The trade payment window has expired.",
        409,
      );
    case "cashloom_profile_required":
      return cashloomError(
        "CASHLOOM_PROFILE_REQUIRED",
        "Save an enabled CashLoom settlement profile before preparing a handoff.",
        409,
      );
    case "cashloom_profile_disabled":
      return cashloomError(
        "CASHLOOM_PROFILE_DISABLED",
        "Enable the CashLoom settlement profile before preparing a handoff.",
        409,
      );
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return cashloomError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }
  const { id: rawId } = await params;
  const id = parseCashloomTradeId(rawId);
  if (!id.ok) return cashloomError("INVALID_INPUT", id.message, 422, id.field);

  try {
    const result = await getCashloomTradeHandoffView(id.value, session.user.id);
    if (!result.ok) return accessFailure(result);
    return cashloomPrivateJson(result.value);
  } catch (error) {
    if (isCashloomSettlementMigrationMissing(error)) return unavailable();
    console.error("[cashloom/trade] read failed:", error);
    return cashloomError(
      "CASHLOOM_SETTLEMENT_ERROR",
      "The CashLoom trade handoff could not be read.",
      500,
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return cashloomError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

  const { id: rawId } = await params;
  const id = parseCashloomTradeId(rawId);
  if (!id.ok) return cashloomError("INVALID_INPUT", id.message, 422, id.field);

  try {
    // Reject non-sellers before reading attacker-controlled body bytes. The
    // transactional DAL repeats this authorization to close state-change races.
    const access = await authorizeCashloomTradeSeller(id.value, session.user.id);
    if (!access.ok) return accessFailure(access);

    const body = await readCashloomJsonBody(request);
    if (!body.ok) {
      switch (body.reason) {
        case "unsupported_media_type":
          return cashloomError(
            "INVALID_INPUT",
            "Content-Type must be application/json.",
            415,
            "body",
          );
        case "too_large":
          return cashloomError("INVALID_INPUT", "Request body is too large.", 413, "body");
        case "invalid_json":
          return cashloomError(
            "INVALID_INPUT",
            "Request body must be valid JSON.",
            400,
            "body",
          );
      }
    }
    const parsed = parseCashloomPrepareAction(body.value);
    if (!parsed.ok) {
      return cashloomError("INVALID_INPUT", parsed.message, 422, parsed.field);
    }

    const result = await prepareCashloomTradeHandoff(id.value, session.user.id);
    if (!result.ok) return prepareFailure(result);
    return cashloomPrivateJson({ ...result.value, reused: result.reused });
  } catch (error) {
    if (isCashloomSettlementMigrationMissing(error)) return unavailable();
    console.error("[cashloom/trade] prepare failed:", error);
    return cashloomError(
      "CASHLOOM_SETTLEMENT_ERROR",
      "The CashLoom trade handoff could not be prepared.",
      500,
    );
  }
}
