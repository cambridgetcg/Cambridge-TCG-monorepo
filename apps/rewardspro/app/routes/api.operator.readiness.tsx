import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getAuroraClient } from "~/utils/aurora-data-api";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Authenticated dependency-readiness check for operators.
 *
 * Public `/api/health` proves process liveness only. This route performs one
 * read-only Data API statement and never returns configuration or error detail.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return json(
      { status: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  try {
    await getAuroraClient().executeStatement("SELECT 1 AS ready");
    return json({ status: "ready" }, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    console.error("[operator-readiness] Database probe failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return json(
      { status: "unavailable" },
      { status: 503, headers: PRIVATE_NO_STORE },
    );
  }
}
