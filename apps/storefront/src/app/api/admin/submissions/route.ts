import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import {
  getAllSubmissions,
  updateSubmissionStatus,
  issueTradeinCreditIfDue,
  payTradeinCashIfDue,
} from "@/lib/tradein/db";
import { sendTradeinStatusEmail } from "@/lib/tradein/email";
import { notify } from "@/lib/notifications/db";

// What title + body each lifecycle status should produce in the user's
// notifications inbox. Matches the existing status email pattern —
// statuses not in this map are admin-internal (e.g. 'cancelled') or
// lack a useful customer-facing copy line.
const TRADEIN_NOTIFY_COPY: Record<string, { title: string; body: string }> = {
  received: { title: "Cards received", body: "We've received your cards and will start grading next." },
  grading:  { title: "Grading in progress", body: "Our team is going through each card. Payment follows approval." },
  approved: { title: "Trade-in approved", body: "Grading complete — payment is queued." },
  paid:     { title: "Trade-in paid", body: "Your payout has been sent." },
  rejected: { title: "Trade-in not accepted", body: "We weren't able to accept this trade-in after grading." },
};

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const submissions = await getAllSubmissions();
    return NextResponse.json({ submissions });
  } catch (err) {
    console.error("[admin] Failed to fetch submissions:", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { reference, status } = await request.json();
    // 'submitted' and 'accepted' omitted on purpose — the first is the
    // default-on-create; the second is customer-driven via /api/tradein.
    // Admin can only drive the fulfilment chain forward.
    const validStatuses = ["received", "grading", "approved", "paid", "rejected", "cancelled"];

    if (!reference || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid reference or status." }, { status: 400 });
    }

    const updated = await updateSubmissionStatus(reference, status);
    if (!updated) {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }

    // On transition to 'paid', try BOTH legs of payout. Each is idempotent
    // (credit_issued_at and cash_paid_at gate re-runs), so admin can flip
    // status back and forth without double-paying. Cash leg requires
    // Stripe Connect onboarding; if absent, we fall back to manual.
    let creditResult: Awaited<ReturnType<typeof issueTradeinCreditIfDue>> | null = null;
    let cashResult: Awaited<ReturnType<typeof payTradeinCashIfDue>> | null = null;
    if (status === "paid") {
      try {
        creditResult = await issueTradeinCreditIfDue(reference);
      } catch (err) {
        console.error("[admin] Trade-in credit issuance failed:", err);
        creditResult = { ok: false, reason: "credit issuance threw" };
      }
      try {
        cashResult = await payTradeinCashIfDue(reference);
      } catch (err) {
        console.error("[admin] Trade-in cash payout failed:", err);
        cashResult = { ok: false, reason: "cash payout threw" };
      }
    }

    // Customer-facing email for visible milestones — fire-and-forget.
    // sendTradeinStatusEmail filters internally on supported statuses,
    // so unknown ones just no-op.
    if (updated.customer_email) {
      sendTradeinStatusEmail({
        email: updated.customer_email,
        reference: updated.reference,
        status,
      }).catch((err) => console.error("[admin] status email failed:", err));
    }

    // In-app notification — idempotent via reference_type+reference_id
    // so re-flipping status won't create duplicates. Typed with a
    // dot-separated kind so the UI can filter/style per event class.
    const copy = TRADEIN_NOTIFY_COPY[status];
    const updatedUserId = (updated as unknown as { user_id?: string | null }).user_id;
    if (copy && updatedUserId) {
      void notify({
        userId: updatedUserId,
        kind: `tradein.${status}`,
        title: copy.title,
        body: `${copy.body} Reference: ${updated.reference}.`,
        linkUrl: `/trade-in/confirm/${updated.reference}`,
        referenceType: "tradein_submission",
        referenceId: `${updated.reference}:${status}`,
      });
    }

    return NextResponse.json({ submission: updated, credit: creditResult, cash: cashResult });
  } catch (err) {
    console.error("[admin] Failed to update submission:", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
