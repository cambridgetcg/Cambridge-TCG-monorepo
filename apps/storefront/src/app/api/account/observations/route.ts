import { auth } from "@/lib/auth";
import {
  createCollectorObservation,
  isCollectorObservationsTableMissing,
  listCollectorObservations,
} from "@/lib/collector-observations/db";
import {
  parseCollectorObservationSku,
  parseCreateCollectorObservation,
} from "@/lib/collector-observations/validation";
import {
  collectorObservationError,
  privateJson,
} from "@/lib/collector-observations/http";

export const dynamic = "force-dynamic";

function unavailable() {
  return collectorObservationError(
    "COLLECTOR_OBSERVATIONS_UNAVAILABLE",
    "Collector observations are temporarily unavailable because their database table is not ready.",
    503,
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return collectorObservationError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

  const searchParams = new URL(request.url).searchParams;
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return collectorObservationError(
      "INVALID_INPUT",
      "limit must be an integer from 1 to 100.",
      400,
      "limit",
    );
  }
  const rawSku = searchParams.get("sku");
  const parsedSku = rawSku === null ? null : parseCollectorObservationSku(rawSku);
  if (parsedSku && !parsedSku.ok) {
    return collectorObservationError("INVALID_INPUT", parsedSku.message, 422, parsedSku.field);
  }

  try {
    const observations = await listCollectorObservations(session.user.id, {
      limit,
      ...(parsedSku?.ok ? { sku: parsedSku.value } : {}),
    });
    return privateJson({ observations });
  } catch (error) {
    if (isCollectorObservationsTableMissing(error)) return unavailable();
    console.error("[collector-observations] list failed:", error);
    return collectorObservationError(
      "COLLECTOR_OBSERVATIONS_ERROR",
      "Collector observations could not be read.",
      500,
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return collectorObservationError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return collectorObservationError("INVALID_INPUT", "Request body must be valid JSON.", 400, "body");
  }

  const parsed = parseCreateCollectorObservation(body);
  if (!parsed.ok) {
    return collectorObservationError("INVALID_INPUT", parsed.message, 422, parsed.field);
  }

  try {
    const result = await createCollectorObservation(session.user.id, parsed.value);
    return privateJson(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (isCollectorObservationsTableMissing(error)) return unavailable();
    console.error("[collector-observations] create failed:", error);
    return collectorObservationError(
      "COLLECTOR_OBSERVATIONS_ERROR",
      "Collector observation could not be saved.",
      500,
    );
  }
}
