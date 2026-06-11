/**
 * API endpoint for SendGrid domain authentication management
 *
 * POST /api/email/domain - Set up a new custom domain
 * POST /api/email/domain/verify - Verify domain DNS records
 * DELETE /api/email/domain - Remove a custom domain
 * GET /api/email/domain - Get domain status
 */

import { json, ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import sendgrid from "~/services/sendgrid.server";

// ============================================
// LOADER - Get domain status
// ============================================

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    // Get all domains for this shop
    const domains = await prisma.sendGridDomain.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });

    // Get email settings to see current sending mode
    const emailSettings = await prisma.emailSettings.findUnique({
      where: { shop },
    });

    return json({
      success: true,
      domains,
      currentSendingMode: emailSettings?.sendingMode || "SHARED",
      activeDomainId: emailSettings?.customDomainId,
    });
  } catch (error: any) {
    console.error("[Domain API] Loader error:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};

// ============================================
// ACTION - Domain management operations
// ============================================

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    switch (intent) {
      case "setup": {
        // Set up a new custom domain
        const domain = formData.get("domain") as string;
        const subdomain = (formData.get("subdomain") as string) || "mail";

        if (!domain) {
          return json(
            { success: false, error: "Domain is required" },
            { status: 400 }
          );
        }

        // Validate domain format
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
        if (!domainRegex.test(domain)) {
          return json(
            { success: false, error: "Invalid domain format" },
            { status: 400 }
          );
        }

        // Check if domain already exists
        const existing = await prisma.sendGridDomain.findFirst({
          where: { shop, domain },
        });

        if (existing) {
          return json(
            { success: false, error: "Domain already registered" },
            { status: 400 }
          );
        }

        // Set up the domain in SendGrid
        const result = await sendgrid.setupCustomDomain(shop, domain, subdomain);

        if (!result.success) {
          return json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        return json({
          success: true,
          message: "Domain created. Please add the DNS records below.",
          domainId: result.domainId,
          dnsRecords: result.dnsRecords,
        });
      }

      case "verify": {
        // Verify domain DNS records
        const domainId = formData.get("domainId") as string;

        if (!domainId) {
          return json(
            { success: false, error: "Domain ID is required" },
            { status: 400 }
          );
        }

        const result = await sendgrid.verifyCustomDomain(shop, domainId);

        if (!result.success) {
          return json(
            { success: false, error: result.error, results: result.results },
            { status: 400 }
          );
        }

        if (result.verified) {
          return json({
            success: true,
            verified: true,
            message: "Domain verified successfully! You can now send emails from your custom domain.",
            results: result.results,
          });
        } else {
          return json({
            success: true,
            verified: false,
            message: "DNS records not yet verified. Please ensure all records are correctly configured.",
            results: result.results,
          });
        }
      }

      case "activate": {
        // Activate a verified domain for sending
        const domainId = formData.get("domainId") as string;
        const senderEmail = formData.get("senderEmail") as string;

        if (!domainId) {
          return json(
            { success: false, error: "Domain ID is required" },
            { status: 400 }
          );
        }

        // Check domain is verified
        const domain = await prisma.sendGridDomain.findFirst({
          where: { id: domainId, shop, status: "VERIFIED" },
        });

        if (!domain) {
          return json(
            { success: false, error: "Domain must be verified before activation" },
            { status: 400 }
          );
        }

        // Update email settings to use this domain
        await prisma.emailSettings.upsert({
          where: { shop },
          create: {
            shop,
            senderEmail: senderEmail || `rewards@${domain.domain}`,
            sendingMode: "CUSTOM_DOMAIN",
            customDomainId: domainId,
          },
          update: {
            sendingMode: "CUSTOM_DOMAIN",
            customDomainId: domainId,
            ...(senderEmail && { senderEmail }),
          },
        });

        return json({
          success: true,
          message: "Custom domain activated! Emails will now be sent from your domain.",
        });
      }

      case "deactivate": {
        // Switch back to shared domain
        await prisma.emailSettings.updateMany({
          where: { shop },
          data: {
            sendingMode: "SHARED",
            customDomainId: null,
          },
        });

        return json({
          success: true,
          message: "Switched to shared domain mode.",
        });
      }

      case "delete": {
        // Delete a custom domain
        const domainId = formData.get("domainId") as string;

        if (!domainId) {
          return json(
            { success: false, error: "Domain ID is required" },
            { status: 400 }
          );
        }

        const result = await sendgrid.removeCustomDomain(shop, domainId);

        if (!result.success) {
          return json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }

        return json({
          success: true,
          message: "Domain removed successfully.",
        });
      }

      default:
        return json(
          { success: false, error: "Invalid intent" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[Domain API] Action error:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
