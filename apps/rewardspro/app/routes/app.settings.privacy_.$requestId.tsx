import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { readDataRequestReport } from "~/services/customer-data-request.server";

/**
 * Download one customer data report (resource route for
 * app.settings.privacy.tsx). Only the requesting shop's reports are served.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const report = await readDataRequestReport(session.shop, params.requestId ?? "");
  if (!report) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(report.json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
