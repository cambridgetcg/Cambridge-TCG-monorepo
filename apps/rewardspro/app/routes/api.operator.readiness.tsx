import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { probeDatabase } from "~/utils/database-health.server";
import { verifyCronAuth } from "~/utils/cron-auth.server";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Authenticated dependency-readiness check for operators.
 *
 * Runs the same bounded `SELECT 1` probe as public `/api/health`, behind the
 * cron bearer credential, and never returns configuration or error detail.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (!verifyCronAuth(request)) {
    return json(
      { status: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE },
    );
  }

  if (await probeDatabase()) {
    return json({ status: "ready" }, { headers: PRIVATE_NO_STORE });
  }
  return json(
    { status: "unavailable" },
    { status: 503, headers: PRIVATE_NO_STORE },
  );
}
