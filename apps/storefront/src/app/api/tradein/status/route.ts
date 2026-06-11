import { NextResponse } from "next/server";
import { getSubmission, getSubmissionByRef } from "@/lib/tradein/db";

// Public lookup for a customer's trade-in. Anonymous lookup-by-ref is
// allowed so the confirmation link in the acknowledgement email works
// without a login; passing ?email=… binds the lookup to the submitter.
//
// Historical note: the client has always sent ?reference=… while this
// route read ?ref= — an accidental contract drift meant the confirm
// page always returned 400. We now accept both names so any stale
// deploys, bookmarks, or external links keep working.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("reference") ?? url.searchParams.get("ref");
  const email = url.searchParams.get("email");

  if (!ref) {
    return NextResponse.json({ error: "Reference number is required." }, { status: 400 });
  }

  try {
    const result = email
      ? await getSubmission(ref, email)
      : await getSubmissionByRef(ref);

    if (!result) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    const { submission, items } = result;
    // pg returns TIMESTAMPTZ as Date at runtime; the SubmissionRow types
    // they as string. Cast through unknown so we can read the columns
    // that were added in later migrations (0024, 0044, 0045, 0047) which
    // the SubmissionRow interface doesn't yet enumerate.
    const s = submission as unknown as Record<string, string | null | boolean | undefined>;

    return NextResponse.json({
      reference: submission.reference,
      status: submission.status,
      paymentMethod: submission.payment_method,
      deliveryMethod: submission.delivery_method,
      cashTotal: parseFloat(submission.quoted_cash_total || "0"),
      creditTotal: parseFloat(submission.quoted_credit_total || "0"),
      expiresAt: submission.quote_expires_at,
      createdAt: submission.created_at,

      // Post-accept quote detail (migration 0024). The confirm page
      // renders the breakdown the admin composed — final_total, payout
      // split, mint bonus — so the customer sees exactly what we quoted.
      adminMessage: (s.admin_message as string | null) ?? null,
      payoutType: (s.payout_type as string | null) ?? null,
      cashAmount: parseFloat((s.cash_amount as string | null) ?? "0"),
      creditAmount: parseFloat((s.credit_amount as string | null) ?? "0"),
      finalTotal: parseFloat((s.final_total as string | null) ?? "0"),
      mintBonusApplied: !!s.mint_bonus_applied,
      mintBonusAmount: parseFloat((s.mint_bonus_amount as string | null) ?? "0"),

      // Fulfilment-chain timestamps (migration 0047) — power the
      // customer-facing received → grading → approved → paid timeline.
      receivedAt: (s.received_at as string | null) ?? null,
      gradingAt: (s.grading_at as string | null) ?? null,
      approvedAt: (s.approved_at as string | null) ?? null,
      paidAt: (s.paid_at as string | null) ?? null,

      // Payout completion (migrations 0044 + 0045) — lets the customer
      // see whether credit actually landed in their balance and whether
      // the Stripe transfer went through for the cash leg.
      creditIssuedAt: (s.credit_issued_at as string | null) ?? null,
      cashPaidAt: (s.cash_paid_at as string | null) ?? null,
      stripeTransferId: (s.stripe_transfer_id as string | null) ?? null,

      items: items.map((i) => {
        const it = i as unknown as Record<string, string | null | boolean | undefined | number>;
        return {
          sku: i.sku,
          game: i.game || "one-piece",
          name: i.name || i.sku,
          card_number: i.card_number || "",
          quantity: i.quantity,
          cash_price: parseFloat(i.quoted_cash_price || "0"),
          credit_price: parseFloat(i.quoted_credit_price || "0"),
          admin_price: it.admin_price != null ? parseFloat(String(it.admin_price)) : null,
          admin_condition: (it.admin_condition as string | null) ?? null,
          admin_notes: (it.admin_notes as string | null) ?? null,
          rejected: !!it.rejected,
          payout_type: (it.payout_type as string | null) ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[tradein] Status lookup error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
