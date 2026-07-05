import { redirect } from "next/navigation";
import type Stripe from "stripe";
import OrderDetails from "./OrderDetails";
import GoogleAdsConversion from "./GoogleAdsConversion";
import { getStripe } from "@/lib/stripe";
import { recordOrderFromStripeSession } from "@/lib/orders/record";

export default async function OrderConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  if (!session_id) redirect("/");

  let session: Stripe.Checkout.Session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items", "collected_information"],
    });
  } catch {
    redirect("/");
  }

  if (session.payment_status !== "paid") redirect("/checkout");

  // Defensive backup: also record the order here. The webhook is the
  // primary writer (and the only path that commits stock + sends email
  // + processes rewards), but the user can land here before the webhook
  // arrives — or, in the worst case, the webhook can fail entirely and
  // this is the only place the order gets persisted. Idempotent: if
  // the webhook already wrote the row, this is a no-op via
  // ON CONFLICT (stripe_session_id) DO NOTHING.
  try {
    await recordOrderFromStripeSession(session);
  } catch (err) {
    // Don't fail the page render — the user has already paid; logging
    // the gap is enough. The hourly reconciliation cron is the third
    // line of defence.
    console.error("[order-confirmation] backup record failed:", err);
  }

  const lineItems = session.line_items?.data || [];
  const shipping = session.collected_information?.shipping_details;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-ok/15 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-display font-semibold text-ink">Order Confirmed!</h1>
        <p className="text-ink-muted mt-2">Thank you for your purchase.</p>
      </div>

      <div className="bg-surface border border-border-subtle rounded-lg p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm text-ink-muted">Order Reference</p>
            <p className="font-mono font-semibold text-ink">{session.id.slice(-12).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-muted">Total Paid</p>
            <p className="text-xl font-semibold text-ink">
              {"\u00A3"}{((session.amount_total || 0) / 100).toFixed(2)}
            </p>
          </div>
        </div>

        {shipping?.address && (
          <div>
            <p className="text-sm text-ink-muted mb-1">Shipping To</p>
            <p className="text-sm">
              {shipping.name}
              <br />
              {[
                shipping.address.line1,
                shipping.address.line2,
                shipping.address.city,
                shipping.address.postal_code,
                shipping.address.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        )}

        <div>
          <p className="text-sm text-ink-muted mb-3">Items Ordered</p>
          <div className="space-y-2">
            {lineItems.map((item) => (
              <div key={item.id} className="flex justify-between text-sm py-2 border-b border-border-subtle last:border-0">
                <span>
                  {item.description}{" "}
                  <span className="text-ink-faint">x{item.quantity}</span>
                </span>
                <span className="text-ink font-medium">
                  {"\u00A3"}{((item.amount_total) / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <GoogleAdsConversion
        value={(session.amount_total || 0) / 100}
        transactionId={session.id}
        currency={session.currency?.toUpperCase() || "GBP"}
      />
      <OrderDetails />
    </div>
  );
}
