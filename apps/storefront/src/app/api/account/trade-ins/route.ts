import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — customer dashboard fetch.
// Looks up submissions linked by either user_id (post-0044) OR a matching
// customer_email — so users who change their email keep seeing old subs,
// and pre-link rows still surface.
//
// Each submission gets a `timeline` array of {status, at, label} entries
// computed from the canonical timestamp columns. Lets the client render a
// stepper without needing to know which column maps to which status.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subs = await query(
    `SELECT * FROM tradein_submissions
      WHERE user_id = $1 OR lower(customer_email) = lower($2)
      ORDER BY created_at DESC`,
    [session.user.id, session.user.email]
  );

  const submissions = [];
  for (const sub of subs.rows) {
    const items = await query(
      `SELECT * FROM tradein_items WHERE submission_id = $1 ORDER BY id`,
      [sub.id]
    );

    // Compose timeline from whichever timestamp columns exist on the row.
    // Order matters — earliest-first for a left-to-right stepper render.
    type Step = { key: string; at: string; label: string };
    const steps: Step[] = [
      { key: "submitted",  at: sub.created_at,                 label: "Submitted" },
      { key: "quoted",     at: sub.quoted_at,                  label: "Quoted" },
      { key: "responded",  at: sub.customer_responded_at,      label: "Response logged" },
      { key: "received",   at: sub.received_at,                label: "Received" },
      { key: "grading",    at: sub.grading_at,                 label: "Grading" },
      { key: "approved",   at: sub.approved_at,                label: "Approved" },
      { key: "paid",       at: sub.paid_at,                    label: "Paid" },
      { key: "credit_issued", at: sub.credit_issued_at,        label: "Credit issued" },
      { key: "cash_paid",  at: sub.cash_paid_at,               label: "Cash transferred" },
    ].filter((s) => !!s.at);

    submissions.push({ submission: sub, items: items.rows, timeline: steps });
  }

  return NextResponse.json({ submissions });
}
