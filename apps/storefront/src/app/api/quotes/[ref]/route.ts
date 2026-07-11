import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import {
  getQuoteByRef, getQuoteDetail, setItemPrices, sendOffer, respondToOffer,
  updateQuoteStatus, issueQuoteCreditIfDue, payQuoteCashIfDue,
} from "@/lib/quote/db";
import { sendQuoteOfferEmail, sendQuoteAcceptedAdminNotification, sendQuoteStatusEmail } from "@/lib/quote/email";
import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

const QUOTE_NOTIFY_COPY: Record<string, { title: string; body: string }> = {
  received:  { title: "Quote: cards received", body: "We've received your cards and will process payment next." },
  paid:      { title: "Quote paid", body: "Your payout has been sent." },
  cancelled: { title: "Quote cancelled", body: "This quote has been cancelled." },
};

// GET — retired customer flow: full quote detail is admin-only.
export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Quote not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const { ref } = await params;
  const quote = await getQuoteByRef(ref);
  if (!quote) {
    return NextResponse.json(
      { error: "Quote not found." },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }
  return NextResponse.json(quote, { headers: PRIVATE_NO_STORE });
}

// PATCH — admin: set prices and send offer, or update status
export async function PATCH(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ref } = await params;
  const body = await request.json();

  // Look up request by reference
  const result = await query(`SELECT * FROM quote_requests WHERE reference = $1`, [ref]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }
  const request_row = result.rows[0];

  // Action: set prices and send offer
  if (body.action === "send_offer") {
    if (!body.items || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "Items with prices required." }, { status: 400 });
    }

    await setItemPrices(body.items);
    const updated = await sendOffer(request_row.id, body.adminNotes);

    // Send email
    sendQuoteOfferEmail({
      reference: ref,
      customerName: updated.customer_name,
      customerEmail: updated.customer_email,
      total: parseFloat(updated.quoted_total || "0"),
      paymentMethod: updated.payment_method,
      expiresAt: updated.offer_expires_at || "",
    }).catch((e) => console.error("[quote] Offer email failed:", e));

    return NextResponse.json({ request: updated });
  }

  // Action: cancel
  if (body.action === "cancel") {
    const updated = await query(
      `UPDATE quote_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [request_row.id]
    );
    return NextResponse.json({ request: updated.rows[0] });
  }

  // Action: lifecycle status updates beyond the quoted/accepted dance.
  // Mirrors the trade-in admin flow: received → paid (credit + transfer
  // both fire automatically when paid, idempotent across re-flips).
  if (body.action === "set_status") {
    const validStatuses = ["received", "paid", "cancelled"];
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const updated = await updateQuoteStatus(ref, body.status);
    if (!updated) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

    let creditResult: Awaited<ReturnType<typeof issueQuoteCreditIfDue>> | null = null;
    let cashResult: Awaited<ReturnType<typeof payQuoteCashIfDue>> | null = null;
    if (body.status === "paid") {
      try { creditResult = await issueQuoteCreditIfDue(ref); }
      catch (err) {
        console.error("[quote] Credit issuance failed:", err);
        creditResult = { ok: false, reason: "credit issuance threw" };
      }
      try { cashResult = await payQuoteCashIfDue(ref); }
      catch (err) {
        console.error("[quote] Cash payout failed:", err);
        cashResult = { ok: false, reason: "cash payout threw" };
      }
    }

    // Fan out the customer-facing lifecycle email. sendQuoteStatusEmail
    // filters unsupported statuses internally, so a no-op for anything
    // outside received/paid/expired/cancelled is safe.
    if (updated.customer_email) {
      sendQuoteStatusEmail({
        email: updated.customer_email,
        reference: ref,
        status: body.status,
      }).catch((err) => console.error("[quote] status email failed:", err));
    }

    // In-app notification alongside the email.
    const copy = QUOTE_NOTIFY_COPY[body.status];
    const quoteUserId = (updated as unknown as { user_id?: string | null }).user_id;
    if (copy && quoteUserId) {
      void notify({
        userId: quoteUserId,
        kind: `quote.${body.status}`,
        title: copy.title,
        body: `${copy.body} Reference: ${ref}.`,
        linkUrl: `/trade-in/quote/${ref}`,
        referenceType: "quote_request",
        referenceId: `${ref}:${body.status}`,
      });
    }

    return NextResponse.json({ request: updated, credit: creditResult, cash: cashResult });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// POST — the customer quote flow is retired; retain this transition for admins only.
export async function POST(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  const { ref } = await params;
  const body = await request.json();

  if (!["accept", "decline"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const updated = await respondToOffer(ref, body.action === "accept");
  if (!updated) {
    return NextResponse.json({ error: "Quote not found or already responded." }, { status: 404 });
  }

  if (body.action === "accept") {
    sendQuoteAcceptedAdminNotification({
      reference: ref,
      customerName: updated.customer_name,
      total: parseFloat(updated.quoted_total || "0"),
    }).catch((e) => console.error("[quote] Accept email failed:", e));
  }

  return NextResponse.json({ request: updated });
}
