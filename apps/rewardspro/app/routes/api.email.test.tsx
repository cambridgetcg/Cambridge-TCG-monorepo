/**
 * API endpoint for sending test emails
 *
 * POST /api/email/test - Send a test email
 */

import { json, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import sendgrid from "~/services/sendgrid.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // SECURITY: Only allow in non-production or with explicit flag
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_EMAIL_TEST) {
    console.warn('[Email Test] Blocked in production environment');
    return json(
      { success: false, error: "Email testing is disabled in production" },
      { status: 403 }
    );
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const toEmail = formData.get("email") as string;

  if (!toEmail) {
    return json(
      { success: false, error: "Email address is required" },
      { status: 400 }
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(toEmail)) {
    return json(
      { success: false, error: "Invalid email address" },
      { status: 400 }
    );
  }

  try {
    const result = await sendgrid.sendTestEmail(shop, toEmail);

    if (result.success) {
      return json({
        success: true,
        message: `Test email sent to ${toEmail}`,
      });
    } else {
      return json(
        { success: false, error: result.error || "Failed to send test email" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("[Test Email] Error:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
