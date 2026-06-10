/**
 * Automation Trigger Engine
 *
 * Evaluates automation triggers and fires actions (send email, etc.)
 * when events occur in the system.
 *
 * Integration points:
 * - Call processAutomationTrigger() from webhook handlers alongside existing
 *   notification functions (e.g., in webhooks.orders.paid.tsx after tier upgrade)
 * - For delayed automations (delayMinutes > 0), a cron job should process
 *   pending executions (future enhancement)
 *
 * Supported triggers:
 * - tier_change / tier_upgrade: Customer tier changes
 * - purchase: Order completed
 * - birthday: Customer birthday
 * - inactive: Customer inactive 30+ days
 * - cashback_earned: Cashback credited
 * - points_milestone: Points threshold reached
 * - welcome / customer_create: New customer joins
 * - And all rewards engagement triggers (raffle, mystery box, etc.)
 */

import prisma from "~/db.server";
import { sendTransactionalEmail } from "./email-provider.server";
import { sanitizeEmailHtml } from "~/utils/html-sanitizer";

// ============================================
// TYPES
// ============================================

export interface TriggerEvent {
  /** The trigger type matching EmailAutomation.trigger */
  type: string;
  /** Shop domain */
  shop: string;
  /** Customer info for the triggered event */
  customer: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    customerId?: string;
  };
  /** Optional event-specific data for condition evaluation */
  data?: Record<string, unknown>;
}

interface AutomationMatch {
  id: string;
  name: string;
  templateId: string;
  delayMinutes: number;
  conditions: Record<string, unknown>;
}

export interface TriggerResult {
  processed: number;
  sent: number;
  delayed: number;
  skipped: number;
  errors: string[];
}

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Process an automation trigger event.
 *
 * Looks up all active automations matching the trigger type for the shop,
 * evaluates conditions, and fires the configured action (send email).
 *
 * This function is designed to be non-blocking — errors are caught and
 * logged but don't propagate to the caller. This ensures webhook
 * processing isn't disrupted by automation failures.
 *
 * @param event - The trigger event to process
 * @returns Result summary of automations processed
 */
export async function processAutomationTrigger(
  event: TriggerEvent
): Promise<TriggerResult> {
  const result: TriggerResult = {
    processed: 0,
    sent: 0,
    delayed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    if (!event.customer.email) {
      return result;
    }

    // Find all active automations matching this trigger for the shop
    const automations = await prisma.emailAutomation.findMany({
      where: {
        shop: event.shop,
        trigger: event.type,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        templateId: true,
        delayMinutes: true,
        conditions: true,
      },
    });

    if (automations.length === 0) {
      return result;
    }

    console.log(
      `[AutomationTrigger] Found ${automations.length} automation(s) for trigger "${event.type}" in shop ${event.shop}`
    );

    for (const automation of automations) {
      result.processed++;
      const conditions = (automation.conditions as Record<string, unknown>) || {};

      try {
        // Evaluate conditions
        if (!evaluateConditions(conditions, event)) {
          result.skipped++;
          console.log(
            `[AutomationTrigger] Skipped automation ${automation.id} (${automation.name}) — conditions not met`
          );
          continue;
        }

        if (automation.delayMinutes > 0) {
          // Delayed execution — store in PendingAutomation for cron processing
          try {
            const executeAt = new Date(Date.now() + automation.delayMinutes * 60 * 1000);
            await prisma.pendingAutomation.create({
              data: {
                shop: event.shop,
                automationId: automation.id,
                automationName: automation.name,
                templateId: automation.templateId,
                recipientEmail: event.customer.email,
                recipientFirstName: event.customer.firstName || null,
                recipientLastName: event.customer.lastName || null,
                triggerType: event.type,
                triggerData: event.data || {},
                executeAt,
              },
            });
            result.delayed++;
            console.log(
              `[AutomationTrigger] Automation ${automation.id} (${automation.name}) scheduled for ${executeAt.toISOString()} (${automation.delayMinutes}min delay)`
            );
          } catch (delayError: any) {
            result.errors.push(`Failed to schedule delayed automation ${automation.id}: ${delayError.message}`);
            console.error(`[AutomationTrigger] Failed to schedule delayed automation:`, delayError.message);
          }
          continue;
        }

        // Immediate execution
        await executeAutomationAction(event, automation);
        result.sent++;

        console.log(
          `[AutomationTrigger] Executed automation ${automation.id} (${automation.name}) for ${event.customer.email}`
        );
      } catch (error: any) {
        result.errors.push(`Automation ${automation.id}: ${error.message}`);
        console.error(
          `[AutomationTrigger] Error executing automation ${automation.id}:`,
          error.message
        );
      }
    }
  } catch (error: any) {
    result.errors.push(`Trigger processing error: ${error.message}`);
    console.error(`[AutomationTrigger] Error processing trigger:`, error.message);
  }

  return result;
}

// ============================================
// CONDITION EVALUATION
// ============================================

/**
 * Evaluate automation conditions against the trigger event data.
 * Returns true if all conditions are met (or no conditions specified).
 */
function evaluateConditions(
  conditions: Record<string, unknown>,
  event: TriggerEvent
): boolean {
  // Tier filter: only trigger for a specific tier
  if (conditions.tierFilter && event.data?.tierId) {
    if (conditions.tierFilter !== event.data.tierId) {
      return false;
    }
  }

  // Minimum spend filter
  if (conditions.minSpend && event.data?.orderTotal !== undefined) {
    const minSpend = Number(conditions.minSpend);
    const orderTotal = Number(event.data.orderTotal);
    if (orderTotal < minSpend) {
      return false;
    }
  }

  return true;
}

// ============================================
// ACTION EXECUTION
// ============================================

/**
 * Execute the automation's configured action (currently: send email).
 */
async function executeAutomationAction(
  event: TriggerEvent,
  automation: AutomationMatch
): Promise<void> {
  const conditions = automation.conditions || {};
  const actionType = (conditions.actionType as string) || "send_email";

  if (actionType !== "send_email") {
    console.log(
      `[AutomationTrigger] Action type "${actionType}" not yet implemented for automation ${automation.id}`
    );
    return;
  }

  // Fetch template
  const template = await prisma.emailTemplate.findFirst({
    where: { id: automation.templateId, shop: event.shop },
    select: { subject: true, htmlContent: true, bodyHtml: true, name: true },
  });

  if (!template) {
    throw new Error(`Template ${automation.templateId} not found`);
  }

  const rawHtmlContent = template.htmlContent || template.bodyHtml;
  if (!rawHtmlContent) {
    throw new Error(`Template ${automation.templateId} has no HTML content`);
  }

  // Sanitize HTML to strip dangerous tags/attributes
  const htmlContent = sanitizeEmailHtml(rawHtmlContent);

  // Resolve recipient name
  const recipientName = [event.customer.firstName, event.customer.lastName]
    .filter(Boolean)
    .join(" ") || undefined;

  // Send via unified email provider (routes to SendGrid or Klaviyo based on shop config)
  const result = await sendTransactionalEmail(event.shop, {
    to: { email: event.customer.email, name: recipientName },
    subject: template.subject || `Update from your store`,
    html: htmlContent,
    categories: ["automation", automation.id],
    customArgs: {
      automation_id: automation.id,
      trigger: event.type,
      shop: event.shop,
    },
  });

  if (!result.success) {
    throw new Error(result.error || "Email send failed");
  }

  // Update automation metrics
  try {
    await prisma.emailAutomation.update({
      where: { id: automation.id },
      data: {
        totalSent: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  } catch (e) {
    // Non-critical — don't fail the send if metrics update fails
    console.error(`[AutomationTrigger] Failed to update metrics for automation ${automation.id}`);
  }
}

// ============================================
// DELAYED AUTOMATION PROCESSING
// ============================================

/**
 * Process pending delayed automations that are due.
 * Should be called from a cron job (e.g., every minute or every 5 minutes).
 *
 * @returns Summary of processed automations
 */
export async function processDelayedAutomations(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const result = { processed: 0, sent: 0, failed: 0 };

  try {
    // Fetch pending automations that are due
    const pending = await prisma.pendingAutomation.findMany({
      where: {
        status: "pending",
        executeAt: { lte: new Date() },
      },
      take: 50, // Process in batches to avoid timeouts
      orderBy: { executeAt: "asc" },
    });

    if (pending.length === 0) {
      return result;
    }

    console.log(`[AutomationTrigger] Processing ${pending.length} delayed automation(s)`);

    for (const item of pending) {
      result.processed++;

      try {
        // Fetch template
        const template = await prisma.emailTemplate.findFirst({
          where: { id: item.templateId, shop: item.shop },
          select: { subject: true, htmlContent: true, bodyHtml: true },
        });

        if (!template) {
          throw new Error(`Template ${item.templateId} not found`);
        }

        const rawHtmlContent = template.htmlContent || template.bodyHtml;
        if (!rawHtmlContent) {
          throw new Error(`Template ${item.templateId} has no HTML content`);
        }

        const htmlContent = sanitizeEmailHtml(rawHtmlContent);
        const recipientName = [item.recipientFirstName, item.recipientLastName]
          .filter(Boolean)
          .join(" ") || undefined;

        // Send via unified email provider
        const sendResult = await sendTransactionalEmail(item.shop, {
          to: { email: item.recipientEmail, name: recipientName },
          subject: template.subject || "Update from your store",
          html: htmlContent,
          categories: ["automation", item.automationId],
          customArgs: {
            automation_id: item.automationId,
            trigger: item.triggerType,
            shop: item.shop,
          },
        });

        if (!sendResult.success) {
          throw new Error(sendResult.error || "Email send failed");
        }

        // Mark as sent
        await prisma.pendingAutomation.update({
          where: { id: item.id },
          data: { status: "sent", sentAt: new Date() },
        });

        // Update automation metrics
        try {
          await prisma.emailAutomation.update({
            where: { id: item.automationId },
            data: { totalSent: { increment: 1 }, updatedAt: new Date() },
          });
        } catch (e) {
          // Non-critical
        }

        result.sent++;
      } catch (error: any) {
        // Mark as failed
        await prisma.pendingAutomation.update({
          where: { id: item.id },
          data: { status: "failed", error: error.message },
        });
        result.failed++;
        console.error(`[AutomationTrigger] Failed to send delayed automation ${item.id}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error(`[AutomationTrigger] Error processing delayed automations:`, error.message);
  }

  return result;
}
