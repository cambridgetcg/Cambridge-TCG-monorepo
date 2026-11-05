import type { AdminApiContext, Session } from "@shopify/shopify-app-react-router/server";
import { findConnection, type ConnectionContext } from "~/lib/merchant.server";
import { monitoring } from "~/lib/telemetry.server";
import { authenticate } from "~/shopify.server";
import { onAppOpened } from "~/shopify/install.server";

/**
 * The start of every admin loader and action: the signed-in store, its
 * Admin API client and its connection.
 *
 * authenticate.admin does all the session work (token exchange, the
 * encrypted session storage and the renewal lease, Ruling 39), and its
 * afterAuth creates the merchant on every token exchange. The connection can
 * still be missing when the session outlived it: an afterAuth that failed
 * part way, or a connection marked uninstalled while the admin stayed open.
 * Then the open is run once more here (Shopify's shop details, ensureMerchant
 * and, if it never started, the past-orders import), exactly as afterAuth
 * runs it. Loaders that run in parallel may each do so; ensureMerchant and
 * the import's start are safe to race. A Response the library throws (a
 * re-auth redirect) passes on unchanged. Once the store is known, it names
 * every failure the request reports to monitoring (OPERATIONS-8).
 */
export async function requireMerchant(
  request: Request,
): Promise<{ admin: AdminApiContext; session: Session; conn: ConnectionContext }> {
  const { admin, session } = await authenticate.admin(request);
  monitoring.tagShop(session.shop);

  let conn = await findConnection(session.shop);
  if (!conn) {
    await onAppOpened({ session, admin });
    conn = await findConnection(session.shop);
  }
  if (!conn) throw new Error(`No active connection for ${session.shop} after opening the app`);

  return { admin, session, conn };
}
