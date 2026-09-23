import { auth } from "@/lib/auth";
import { NEW_PAID_COMMERCE_RETIRED_CODE, NEW_PAID_COMMERCE_RETIRED_MESSAGE } from "@/lib/release/commercial-retirement";
import { prismStripeError, prismStripeHttpErrorResponse, readPrismStripeEmptyJson, requirePrismStripeSameOrigin } from "../http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** New sandbox subscription checkout is retired; existing receipts and cancellation remain. */
export async function POST(request: Request): Promise<Response> {
  try {
    requirePrismStripeSameOrigin(request);
    await readPrismStripeEmptyJson(request);
    const session = await auth();
    if (!session?.user?.id) {
      return prismStripeError("authentication_required", "Sign in to inspect your existing PRISM records.", 401);
    }
    return prismStripeError(NEW_PAID_COMMERCE_RETIRED_CODE, NEW_PAID_COMMERCE_RETIRED_MESSAGE, 410);
  } catch (error) {
    return prismStripeHttpErrorResponse(error) ?? prismStripeError("checkout_unavailable", "Checkout is unavailable.", 503);
  }
}
