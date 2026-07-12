/**
 * Public process-liveness check.
 *
 * Dependency health belongs on an authenticated operator surface. This route
 * deliberately does not inspect the request, environment, cache, or database.
 */

import { json } from "@remix-run/node";

export function loader() {
  return json(
    { status: "ok" },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
