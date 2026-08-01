import { auth } from "@/lib/auth";
import { parseCashloomTradeId } from "@/lib/cashloom/contract";
import {
  authorizeCashloomPaymentPreparationBuyer,
  getCashloomPaymentPreparationView,
  isCashloomPaymentPreparationMigrationMissing,
  recordCashloomPaymentPreparation,
  type CashloomPaymentPreparationView,
  type CashloomPreparationAccessFailure,
  type CashloomPreparationFailure,
} from "@/lib/cashloom/preparation-db";
import { resolveCashloomPaymentPreparationMode } from "@/lib/cashloom/preparation-mode";
import { parseCashloomPaymentPreparationWrite } from "@/lib/cashloom/preparation";
import {
  cashloomError,
  cashloomPrivateJson,
  readCashloomJsonBody,
} from "@/lib/cashloom/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unavailable() {
  return cashloomError(
    "CASHLOOM_PREPARATION_UNAVAILABLE",
    "CashLoom preparation receipts are temporarily unavailable because their database migration is not ready.",
    503,
  );
}

function accessFailure(
  result: CashloomPreparationAccessFailure,
  operation: "read" | "record" = "record",
) {
  if (result.reason === "not_found") {
    return cashloomError("TRADE_NOT_FOUND", "Trade not found.", 404);
  }
  if (result.reason === "self_trade") {
    return cashloomError(
      "SELF_TRADE_NOT_ALLOWED",
      "A self-trade cannot create buyer preparation evidence.",
      409,
    );
  }
  return cashloomError(
    "TRADE_FORBIDDEN",
    operation === "read"
      ? "Only trade participants can read preparation for this trade."
      : "Only the buyer can record preparation for this trade.",
    403,
  );
}

function preparationFailure(result: CashloomPreparationFailure) {
  switch (result.reason) {
    case "not_found":
    case "forbidden":
    case "self_trade":
      return accessFailure(result);
    case "handoff_required":
      return cashloomError(
        "CASHLOOM_HANDOFF_REQUIRED",
        "The seller must prepare the immutable CashLoom terms handoff first.",
        409,
      );
    case "handoff_changed":
      return cashloomError(
        "CASHLOOM_HANDOFF_CHANGED",
        "The stored handoff does not match the exact handoff you reviewed. Refresh before trying again.",
        409,
      );
    case "trade_not_awaiting_payment":
      return cashloomError(
        "TRADE_NOT_AWAITING_PAYMENT",
        "Preparation can only be recorded while the trade is awaiting payment.",
        409,
      );
    case "payment_window_expired":
      return cashloomError("PAYMENT_WINDOW_EXPIRED", "The trade payment window has expired.", 409);
    case "preparation_already_recorded":
      return cashloomError(
        "CASHLOOM_PREPARATION_ALREADY_RECORDED",
        "A buyer preparation receipt already exists for this trade. Refresh to read it.",
        409,
      );
    case "idempotency_conflict":
      return cashloomError(
        "CASHLOOM_IDEMPOTENCY_CONFLICT",
        "That retry key was already used for different preparation bytes.",
        409,
        "idempotency_key",
      );
  }
}

function applyMode(view: CashloomPaymentPreparationView) {
  const mode = resolveCashloomPaymentPreparationMode();
  if (mode === "disabled" && view.can_record_preparation) {
    return {
      ...view,
      mode,
      can_record_preparation: false,
      unavailable_reason: "writes_disabled" as const,
    };
  }
  return { ...view, mode };
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
    const result = await getCashloomPaymentPreparationView(id.value, session.user.id);
    if (!result.ok) return accessFailure(result, "read");
    return cashloomPrivateJson(applyMode(result.value));
  } catch (error) {
    if (isCashloomPaymentPreparationMigrationMissing(error)) return unavailable();
    console.error("[cashloom/preparation] read failed:", error);
    return cashloomError(
      "CASHLOOM_PREPARATION_ERROR",
      "The CashLoom preparation receipt could not be read.",
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
    // Reject non-buyers before reading attacker-controlled request bytes. The
    // transactional writer repeats buyer, state, deadline, and handoff checks.
    const access = await authorizeCashloomPaymentPreparationBuyer(id.value, session.user.id);
    if (!access.ok) return accessFailure(access);
    if (resolveCashloomPaymentPreparationMode() !== "record_only") {
      return cashloomError(
        "CASHLOOM_PREPARATION_DISABLED",
        "This deployment is not accepting new CashLoom preparation receipts.",
        409,
      );
    }

    const body = await readCashloomJsonBody(request);
    if (!body.ok) {
      switch (body.reason) {
        case "unsupported_media_type":
          return cashloomError("INVALID_INPUT", "Content-Type must be application/json.", 415, "body");
        case "too_large":
          return cashloomError("INVALID_INPUT", "Request body is too large.", 413, "body");
        case "invalid_json":
          return cashloomError("INVALID_INPUT", "Request body must be valid JSON.", 400, "body");
      }
    }
    const parsed = parseCashloomPaymentPreparationWrite(body.value);
    if (!parsed.ok) return cashloomError("INVALID_INPUT", parsed.message, 422, parsed.field);

    const result = await recordCashloomPaymentPreparation(
      id.value,
      session.user.id,
      parsed.value,
    );
    if (!result.ok) return preparationFailure(result);
    return cashloomPrivateJson({
      preparation: result.value,
      role: "buyer",
      mode: "record_only",
      can_record_preparation: false,
      unavailable_reason: "preparation_already_recorded",
      reused: result.reused,
    });
  } catch (error) {
    if (isCashloomPaymentPreparationMigrationMissing(error)) return unavailable();
    console.error("[cashloom/preparation] record failed:", error);
    return cashloomError(
      "CASHLOOM_PREPARATION_ERROR",
      "The CashLoom preparation receipt could not be recorded.",
      500,
    );
  }
}
