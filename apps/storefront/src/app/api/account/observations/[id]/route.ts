import { auth } from "@/lib/auth";
import {
  deleteCollectorObservation,
  getCollectorObservation,
  isCollectorObservationsTableMissing,
  updateCollectorObservation,
} from "@/lib/collector-observations/db";
import { parsePatchCollectorObservation } from "@/lib/collector-observations/validation";
import {
  collectorObservationError,
  PRIVATE_NO_STORE_HEADERS,
  privateJson,
} from "@/lib/collector-observations/http";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function notFound() {
  // Deliberately identical for an absent id and another owner's id.
  return collectorObservationError(
    "OBSERVATION_NOT_FOUND",
    "Collector observation not found.",
    404,
  );
}

function unavailable() {
  return collectorObservationError(
    "COLLECTOR_OBSERVATIONS_UNAVAILABLE",
    "Collector observations are temporarily unavailable because their database table is not ready.",
    503,
  );
}

async function ownerAndId(params: Promise<{ id: string }>) {
  const session = await auth();
  const { id } = await params;
  return { userId: session?.user?.id ?? null, id };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, id } = await ownerAndId(params);
  if (!userId) return collectorObservationError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  if (!UUID.test(id)) return notFound();

  try {
    const observation = await getCollectorObservation(userId, id);
    return observation ? privateJson({ observation }) : notFound();
  } catch (error) {
    if (isCollectorObservationsTableMissing(error)) return unavailable();
    console.error("[collector-observations] read failed:", error);
    return collectorObservationError(
      "COLLECTOR_OBSERVATIONS_ERROR",
      "Collector observation could not be read.",
      500,
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, id } = await ownerAndId(params);
  if (!userId) return collectorObservationError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  if (!UUID.test(id)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return collectorObservationError("INVALID_INPUT", "Request body must be valid JSON.", 400, "body");
  }
  const parsed = parsePatchCollectorObservation(body);
  if (!parsed.ok) {
    return collectorObservationError("INVALID_INPUT", parsed.message, 422, parsed.field);
  }

  try {
    const result = await updateCollectorObservation(userId, id, parsed.value);
    if (result.status === "not_found") return notFound();
    if (result.status === "conflict") {
      return privateJson(
        {
          error: {
            code: "REVISION_CONFLICT",
            message: "This observation changed after it was read. Reload it before correcting it.",
            current_revision: result.current_revision,
          },
        },
        { status: 409 },
      );
    }
    return privateJson({ observation: result.observation });
  } catch (error) {
    if (isCollectorObservationsTableMissing(error)) return unavailable();
    console.error("[collector-observations] update failed:", error);
    return collectorObservationError(
      "COLLECTOR_OBSERVATIONS_ERROR",
      "Collector observation could not be corrected.",
      500,
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, id } = await ownerAndId(params);
  if (!userId) return collectorObservationError("SIGN_IN_REQUIRED", "Sign in required.", 401);
  if (!UUID.test(id)) return notFound();

  try {
    const deleted = await deleteCollectorObservation(userId, id);
    if (!deleted) return notFound();
    return new Response(null, { status: 204, headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    if (isCollectorObservationsTableMissing(error)) return unavailable();
    console.error("[collector-observations] delete failed:", error);
    return collectorObservationError(
      "COLLECTOR_OBSERVATIONS_ERROR",
      "Collector observation could not be deleted.",
      500,
    );
  }
}
