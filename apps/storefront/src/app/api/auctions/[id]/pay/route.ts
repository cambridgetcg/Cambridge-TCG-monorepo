import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { getAuction } from "@/lib/auction/db";
import { getStripe } from "@/lib/stripe";
import { formatDateTime } from "@/lib/format";

// Absolute base for Stripe success/cancel URLs. Prefer the configured
// site URL (always set in production); otherwise fall back to the
// request's OWN origin rather than a hardcoded localhost:3000, which
// bounced a local tester (dev serves on :3001) to a dead port after pay.
function resolveSiteUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

// Every country Stripe Checkout can collect a shipping address for — copied
// verbatim from the market pay route (the full ShippingAddressCollection.
// AllowedCountry enum minus 'ZZ'). Global free trade: winners may live
// anywhere Stripe supports; traders arrange their own logistics.
const GLOBAL_SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO",
  "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC",
  "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA",
  "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ",
  "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID",
  "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB",
  "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD",
  "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT",
  "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL",
  "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK",
  "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA", "RE", "RO", "RS", "RU",
  "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL",
  "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD",
  "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV",
  "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VN",
  "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const SITE_URL = resolveSiteUrl(req);
  // NOTE: getStripe() is NOT called here — it is constructed inside the try
  // below. It throws when STRIPE_SECRET_KEY is absent, and a throw at the
  // module top produced a bodiless 500 that stranded the winner on a ticking
  // 48h forfeit clock with no explanation (the persona walkers hit exactly
  // this). Inside the try, a config/Stripe failure returns an honest 503.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to pay." }, { status: 401 });
  }

  const { id } = await params;
  const auction = await getAuction(id);

  if (!auction) {
    return NextResponse.json({ error: "Auction not found." }, { status: 404 });
  }

  if (auction.status !== "ended") {
    return NextResponse.json({ error: "Auction is not in ended state." }, { status: 400 });
  }

  if (auction.winner_user_id !== session.user.id) {
    return NextResponse.json({ error: "You are not the winner." }, { status: 403 });
  }

  const amount = parseFloat(auction.current_price);

  try {
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: auction.title,
              description: `Auction winner payment`,
              ...(auction.images.length > 0 ? { images: [auction.images[0].url] } : {}),
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${SITE_URL}/auctions/${id}?paid=true`,
      cancel_url: `${SITE_URL}/auctions/${id}`,
      customer_email: session.user.email || undefined,
      // Collect the winner's shipping address at pay time. The webhook
      // flattens session.collected_information.shipping_details into
      // auctions.shipping_address (migration 0114) so the seller knows
      // where to ship — mirrors the market trade pay route. Currency stays
      // GBP (the platform's settlement currency).
      shipping_address_collection: {
        allowed_countries: GLOBAL_SHIPPING_COUNTRIES,
      },
      metadata: {
        type: "auction_payment",
        auction_id: id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[auction] Payment session error:", err);
    // Honest failure. Two truths the winner needs: (1) this is our side,
    // not theirs, and (2) the payment window does NOT pause while checkout
    // is down — it still ends at the auction's real payment_expires_at. We
    // name that time rather than inventing a grace period the unpaid-cancel
    // sweep won't honour. The dev-only STRIPE_SECRET_KEY message stays
    // server-side.
    const unconfigured = err instanceof Error && /STRIPE_SECRET_KEY/.test(err.message);
    const whenIso: string | null = auction.payment_expires_at ?? null;
    const whenLabel = whenIso ? formatDateTime(whenIso) : null;
    const error = whenLabel
      ? `Payments are temporarily unavailable — this is on our side, not yours. Your payment window is unchanged: it still closes ${whenLabel} and does not pause while checkout is down. Please try again in a few minutes; if it keeps failing, contact support before the window closes.`
      : `Payments are temporarily unavailable — this is on our side, not yours. Your payment window is unchanged and does not pause while checkout is down. Please try again shortly, and contact support if it persists.`;
    return NextResponse.json(
      { error, code: unconfigured ? "payments_unconfigured" : "payments_unavailable", payment_expires_at: whenIso },
      { status: 503 },
    );
  }
}
