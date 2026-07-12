import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { sendMail } from "@cambridge-tcg/email";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

// POST — admin review only. Public self-submission is paused because an email,
// order reference, or marketplace handle does not prove that the caller owns
// either the account or the purchase. The admin check intentionally happens
// before body parsing and before any og_claims query.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      {
        error: "Public OG claims are paused while ownership proof is rebuilt.",
        status: "og-claims-disabled",
        body_inspected: false,
        claim_database_accessed: false,
      },
      { status: 503, headers: PRIVATE_NO_STORE },
    );
  }

  const body = await request.json();

  // Admin actions
  if (body.action === "approve" || body.action === "reject") {
    const { claimId, adminNotes } = body;
    if (!claimId) return NextResponse.json({ error: "Claim ID required." }, { status: 400 });

    if (body.action === "approve") {
      // Get claim
      const claim = await query(`SELECT * FROM og_claims WHERE id=$1`, [claimId]);
      if (claim.rows.length === 0) return NextResponse.json({ error: "Claim not found." }, { status: 404 });

      // Assign OG tier
      const tierResult = await query(`SELECT id FROM tiers WHERE name='OG'`);
      if (tierResult.rows.length === 0) return NextResponse.json({ error: "OG tier not found." }, { status: 500 });
      const tierId = tierResult.rows[0].id;

      // Find or create user
      let userResult = await query(`SELECT id FROM users WHERE email=LOWER($1)`, [claim.rows[0].email]);
      if (userResult.rows.length === 0) {
        userResult = await query(`INSERT INTO users (email) VALUES (LOWER($1)) RETURNING id`, [claim.rows[0].email]);
      }

      // Assign OG tier (manual — won't be overridden)
      await query(
        `UPDATE users SET tier_id=$2, tier_source='manual', tier_calculated_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [userResult.rows[0].id, tierId]
      );

      // Update claim
      await query(
        `UPDATE og_claims SET status='approved', admin_notes=$2, reviewed_at=NOW() WHERE id=$1`,
        [claimId, adminNotes || null]
      );

      // Send email notification via the platform transport seam (@cambridge-tcg/email)
      {
        const result = await sendMail({
          from: (process.env.AUTH_FROM_EMAIL || "noreply@cambridgetcg.com").trim(),
          to: [claim.rows[0].email],
          subject: "👑 Your OG Status is Active — Cambridge TCG",
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;padding:32px;background:#171717;border-radius:16px;">
    <h1 style="color:#fff;font-size:20px;margin:0 0 8px;">Cambridge <span style="color:#34d399;">TCG</span></h1>
    <div style="text-align:center;font-size:48px;margin:16px 0;">👑</div>
    <h2 style="color:#fff;font-size:18px;text-align:center;margin:0 0 16px;">Welcome Back, OG</h2>
    <p style="color:#a3a3a3;font-size:14px;">You were here at the very start. When no one was paying attention to One Piece TCG. Before the hype, before the prices. You stayed through the highs and lows — not for the money, but for the cards.</p>
    <p style="color:#a3a3a3;font-size:14px;margin-top:12px;">We are grateful to have had you from the beginning. Your OG membership is now permanently active. You deserve the best:</p>
    <div style="background:#262626;border-radius:8px;padding:16px;margin:16px 0;font-size:13px;color:#d4d4d4;">
      <p style="margin:4px 0;">✓ 7% store discount on everything</p>
      <p style="margin:4px 0;">✓ 7% cashback on every purchase</p>
      <p style="margin:4px 0;">✓ 7x Berries multiplier</p>
      <p style="margin:4px 0;">✓ 0% marketplace commission — forever</p>
      <p style="margin:4px 0;">✓ 0% auction fees — forever</p>
      <p style="margin:4px 0;">✓ 👑 OG badge on your profile</p>
    </div>
    <p style="color:#a3a3a3;font-size:14px;">No subscription. No renewal. This is permanent — our thank you to you.</p>
    <a href="https://cambridgetcg.com/login" style="display:inline-block;padding:12px 32px;background:#f59e0b;color:#000;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;margin-top:16px;">Sign In to Your Account</a>
    <p style="color:#737373;font-size:12px;margin:24px 0 0;font-style:italic;">You were here before the hype. That means everything to us.</p>
  </div>
</body></html>`,
          text: "Your OG Status is active on Cambridge TCG. Sign in at https://cambridgetcg.com/login to access your perks.",
        }, { stream: "noreply" });
        if (!result.ok) console.error("[og] Email failed:", result.error);
      }

      return NextResponse.json({ status: "approved", email: claim.rows[0].email });
    }

    if (body.action === "reject") {
      await query(
        `UPDATE og_claims SET status='rejected', admin_notes=$2, reviewed_at=NOW() WHERE id=$1`,
        [claimId, body.adminNotes || null]
      );
      return NextResponse.json({ status: "rejected" });
    }
  }

  return NextResponse.json(
    { error: "Admin action must be approve or reject." },
    { status: 400, headers: PRIVATE_NO_STORE },
  );
}

// GET — admin: list claims
export async function GET(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;

  let where = "";
  const params: unknown[] = [];
  if (status) { params.push(status); where = `WHERE status=$1`; }

  const result = await query(
    `SELECT * FROM og_claims ${where} ORDER BY created_at DESC`,
    params
  );
  return NextResponse.json({ claims: result.rows });
}
