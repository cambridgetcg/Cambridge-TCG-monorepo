import type { ActionFunctionArgs } from "react-router";

import { requireMerchant } from "~/admin/require-merchant.server";
import { buildPrivacyReport } from "~/lib/erasure.server";

/**
 * The download of one customer data request's report (spec 4.7): a POST
 * from the Customer data requests page, with the request's `id`, answered
 * with buildPrivacyReport's JSON as an attachment. buildPrivacyReport builds
 * it live and records the first download, which clears Home's banner. A
 * request that isn't this merchant's, has expired or was erased with its
 * customer answers 404, the same for each, so nothing says which ids exist.
 *
 * Its own route, with no page: React Router renders a page route's action
 * result into the page, so only a route without one can answer with a file.
 * The page posts with fetch, which carries App Bridge's session token. The
 * report is never stored, and never logged.
 */

const NO_STORE = "private, no-store";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { conn } = await requireMerchant(request);
  const id = (await request.formData()).get("id");
  const report = typeof id === "string" ? await buildPrivacyReport(conn.merchantId, id) : null;

  if (!report) {
    return new Response("This report is no longer available.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE },
    });
  }
  return new Response(report.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": NO_STORE,
    },
  });
};
