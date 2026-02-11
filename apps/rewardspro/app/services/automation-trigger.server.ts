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

import db from "~/db.server";
import * as sendgrid from "./sendgrid.server";

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
    const automations = await db.emailAutomation.findMany({
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
          // Delayed execution — log for now, needs queue/cron in production
          result.delayed++;
          console.log(
            `[AutomationTrigger] Automation ${automation.id} (${automation.name}) has ${automation.delayMinutes}min delay — skipping (delayed execution not yet implemented)`
          );
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
  const template = await db.emailTemplate.findFirst({
    where: { id: automation.templateId, shop: event.shop },
    select: { subject: true, htmlContent: true, bodyHtml: true, name: true },
  });

  if (!template) {
    throw new Error(`Template ${automation.templateId} not found`);
  }

  const htmlContent = template.htmlContent || template.bodyHtml;
  if (!htmlContent) {
    throw new Error(`Template ${automation.templateId} has no HTML content`);
  }

  // Resolve recipient name
  const recipientName = [event.customer.firstName, event.customer.lastName]
    .filter(Boolean)
    .join(" ") || undefined;

  // Send via SendGrid
  await sendgrid.sendEmail(event.shop, {
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

  // Update automation metrics
  try {
    await db.emailAutomation.update({
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
