import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// POST — admin: send quotation for a trade-in submission
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { reference, items, payoutType, cashAmount, creditAmount, adminMessage, mintBonusApplied, mintBonusAmount } = body;

  if (!reference) return NextResponse.json({ error: "Reference required." }, { status: 400 });
  if (!items || !Array.isArray(items)) return NextResponse.json({ error: "Items with prices required." }, { status: 400 });
  if (!payoutType || !["cash", "credit", "mixed"].includes(payoutType)) {
    return NextResponse.json({ error: "Payout type must be cash, credit, or mixed." }, { status: 400 });
  }

  // Get the submission
  const subResult = await query(`SELECT * FROM tradein_submissions WHERE reference=$1`, [reference]);
  if (subResult.rows.length === 0) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const submission = subResult.rows[0];

  // Update each item with admin pricing
  for (const item of items) {
    await query(
      `UPDATE tradein_items SET admin_price=$2, admin_condition=$3, admin_notes=$4, rejected=$5, payout_type=$6
       WHERE id=$1 AND submission_id=$7`,
      [item.id, item.adminPrice?.toFixed(2) ?? null, item.adminCondition || null,
       item.adminNotes || null, item.rejected || false, item.payoutType || payoutType,
       submission.id]
    );
  }

  // Calculate totals
  const itemsResult = await query(
    `SELECT * FROM tradein_items WHERE submission_id=$1 AND NOT rejected`,
    [submission.id]
  );

  let totalCash = 0;
  let totalCredit = 0;
  for (const item of itemsResult.rows) {
    const price = parseFloat(item.admin_price || item.quoted_credit_price || "0");
    const qty = item.quantity;
    const itemPayout = item.payout_type || payoutType;
    if (itemPayout === "cash") totalCash += price * qty;
    else if (itemPayout === "credit") totalCredit += price * qty;
    else {
      // Mixed: use submission-level split
      totalCash += (cashAmount || 0);
      totalCredit += (creditAmount || 0);
      break; // Mixed is set at submission level, not per item
    }
  }

  // If mixed payout, use the explicit amounts
  if (payoutType === "mixed") {
    totalCash = cashAmount || 0;
    totalCredit = creditAmount || 0;
  }

  // Apply MINT bonus if applicable
  const bonus = mintBonusApplied ? (mintBonusAmount || 0) : 0;
  const finalTotal = totalCash + totalCredit + bonus;

  // Update submission
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await query(
    `UPDATE tradein_submissions SET
       status='quoted', payout_type=$2, cash_amount=$3, credit_amount=$4,
       final_total=$5, admin_message=$6, quoted_at=NOW(), quote_expires_at=$7,
       mint_bonus_applied=$8, mint_bonus_amount=$9, updated_at=NOW()
     WHERE id=$1`,
    [submission.id, payoutType, totalCash.toFixed(2), totalCredit.toFixed(2),
     finalTotal.toFixed(2), adminMessage || null, expiresAt.toISOString(),
     mintBonusApplied || false, bonus.toFixed(2)]
  );

  // Send email notification to customer
  try {
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({
      region: (process.env.AWS_REGION || "us-east-1").trim(),
      credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      },
    });

    const from = (process.env.TRADEIN_FROM_EMAIL || "tradein@cambridgetcg.com").trim();
    const payoutDesc = payoutType === "mixed"
      ? `£${totalCash.toFixed(2)} cash + £${totalCredit.toFixed(2)} credit`
      : payoutType === "cash"
      ? `£${totalCash.toFixed(2)} cash`
      : `£${totalCredit.toFixed(2)} store credit`;

    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [submission.customer_email] },
      Message: {
        Subject: { Data: `Your trade-in quote is ready — ${reference}` },
        Body: {
          Html: {
            Data: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <h2 style="color:#fff;font-size:16px;margin:0 0 16px;">Your Quote is Ready</h2>
    <p style="color:#a3a3a3;font-size:14px;">Hi ${submission.customer_name},</p>
    <p style="color:#a3a3a3;font-size:14px;">We've reviewed your trade-in <strong style="color:#f59e0b;">${reference}</strong> and prepared your quotation:</p>
    <p style="font-size:24px;font-weight:700;color:#f59e0b;margin:16px 0;">${payoutDesc}</p>
    ${bonus > 0 ? `<p style="color:#34d399;font-size:14px;">Includes £${bonus.toFixed(2)} MINT bonus</p>` : ""}
    ${adminMessage ? `<p style="color:#a3a3a3;font-size:14px;border-left:3px solid #f59e0b;padding-left:12px;margin:16px 0;">${adminMessage}</p>` : ""}
    <p style="color:#a3a3a3;font-size:14px;">This quote is valid for <strong>24 hours</strong>. Please review and respond.</p>
    <a href="https://cambridgetcg.com/trade-in/confirm/${reference}" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;margin-top:16px;">View & Accept Quote</a>
    <p style="color:#525252;font-size:12px;margin:24px 0 0;">If you don't respond within 24 hours, the quote will expire and prices may change.</p>
  </div>
</body></html>`,
          },
          Text: {
            Data: `Your trade-in quote (${reference}) is ready: ${payoutDesc}. View and accept: https://cambridgetcg.com/trade-in/confirm/${reference}`,
          },
        },
      },
    }));
  } catch (emailErr) {
    console.error("[tradein] Quote email failed:", emailErr);
  }

  return NextResponse.json({
    status: "quoted",
    payoutType,
    cashAmount: totalCash,
    creditAmount: totalCredit,
    mintBonus: bonus,
    finalTotal,
    expiresAt: expiresAt.toISOString(),
  });
}

// PATCH — customer: accept or decline quotation
export async function PATCH(request: Request) {
  const body = await request.json();
  const { reference, action } = body;

  if (!reference) return NextResponse.json({ error: "Reference required." }, { status: 400 });
  if (!["accept", "decline"].includes(action)) return NextResponse.json({ error: "Action must be accept or decline." }, { status: 400 });

  const subResult = await query(
    `SELECT * FROM tradein_submissions WHERE reference=$1 AND status='quoted'`,
    [reference]
  );
  if (subResult.rows.length === 0) {
    return NextResponse.json({ error: "Quote not found or already responded." }, { status: 404 });
  }

  const submission = subResult.rows[0];

  // Check expiry
  if (submission.quote_expires_at && new Date(submission.quote_expires_at) < new Date()) {
    await query(`UPDATE tradein_submissions SET status='expired', updated_at=NOW() WHERE id=$1`, [submission.id]);
    return NextResponse.json({ error: "This quote has expired. Please submit a new trade-in request." }, { status: 410 });
  }

  const newStatus = action === "accept" ? "accepted" : "declined";
  await query(
    `UPDATE tradein_submissions SET status=$2, customer_responded_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [submission.id, newStatus]
  );

  // Notify store
  try {
    const storeEmail = (process.env.STORE_NOTIFICATION_EMAIL || "contact@cambridgetcg.com").trim();
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({
      region: (process.env.AWS_REGION || "us-east-1").trim(),
      credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      },
    });
    await ses.send(new SendEmailCommand({
      Source: (process.env.TRADEIN_FROM_EMAIL || "tradein@cambridgetcg.com").trim(),
      Destination: { ToAddresses: [storeEmail] },
      Message: {
        Subject: { Data: `Trade-in ${newStatus}: ${reference}` },
        Body: { Text: { Data: `${submission.customer_name} ${newStatus} quote ${reference}. Total: £${submission.final_total || "0"}` } },
      },
    }));
  } catch { /* ignore */ }

  return NextResponse.json({ status: newStatus });
}
