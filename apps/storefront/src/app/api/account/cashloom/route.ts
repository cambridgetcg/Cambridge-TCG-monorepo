import { auth } from "@/lib/auth";
import {
  deleteCashloomSettlementProfile,
  getCashloomSettlementProfile,
  isCashloomSettlementMigrationMissing,
  saveCashloomSettlementProfile,
} from "@/lib/cashloom/db";
import { parseCashloomProfileWrite } from "@/lib/cashloom/contract";
import { getCashloomKarmaDecision } from "@/lib/cashloom/karma-db";
import {
  cashloomError,
  cashloomPrivateJson,
  readCashloomJsonBody,
} from "@/lib/cashloom/http";

export const dynamic = "force-dynamic";

function unavailable() {
  return cashloomError(
    "CASHLOOM_SETTLEMENT_UNAVAILABLE",
    "CashLoom settlement profiles are temporarily unavailable because their database migration is not ready.",
    503,
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return cashloomError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

  try {
    const [profile, karma] = await Promise.all([
      getCashloomSettlementProfile(session.user.id),
      getCashloomKarmaDecision(
        session.user.id,
        "account.cashloom-profile",
      ),
    ]);
    return cashloomPrivateJson({ profile, karma });
  } catch (error) {
    if (isCashloomSettlementMigrationMissing(error)) return unavailable();
    console.error("[cashloom/profile] read failed:", error);
    return cashloomError(
      "CASHLOOM_SETTLEMENT_ERROR",
      "The CashLoom settlement profile could not be read.",
      500,
    );
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return cashloomError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

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
  const parsed = parseCashloomProfileWrite(body.value);
  if (!parsed.ok) {
    return cashloomError("INVALID_INPUT", parsed.message, 422, parsed.field);
  }

  try {
    const profile = await saveCashloomSettlementProfile(session.user.id, parsed.value);
    return cashloomPrivateJson({ profile });
  } catch (error) {
    if (isCashloomSettlementMigrationMissing(error)) return unavailable();
    console.error("[cashloom/profile] save failed:", error);
    return cashloomError(
      "CASHLOOM_SETTLEMENT_ERROR",
      "The CashLoom settlement profile could not be saved.",
      500,
    );
  }
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return cashloomError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

  try {
    await deleteCashloomSettlementProfile(session.user.id);
    return cashloomPrivateJson({ deleted: true });
  } catch (error) {
    if (isCashloomSettlementMigrationMissing(error)) return unavailable();
    console.error("[cashloom/profile] delete failed:", error);
    return cashloomError(
      "CASHLOOM_SETTLEMENT_ERROR",
      "The CashLoom settlement profile could not be deleted.",
      500,
    );
  }
}
