/**
 * SendGrid Webhook Handler
 *
 * Processes email events from SendGrid to track:
 * - Opens
 * - Clicks
 * - Bounces
 * - Delivered
 * - Unsubscribes
 *
 * Events are batched and sent to this endpoint.
 * We use categories or custom_args to identify the campaign.
 *
 * @see https://docs.sendgrid.com/for-developers/tracking-events/event
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "~/db.server";
import * as crypto from "node:crypto";

// ============================================
// TYPES
// ============================================

interface SendGridEvent {
  event: "delivered" | "open" | "click" | "bounce" | "dropped" | "deferred" | "spam_report" | "unsubscribe" | "processed";
  email: string;
  timestamp: number;
  category?: string[];
  sg_event_id?: string;
  sg_message_id?: string;
  campaign_id?: string; // Custom arg we set during sending
  shop?: string; // Custom arg we set during sending
  url?: string; // For click events
  reason?: string; // For bounce events
  status?: string;
  type?: string; // For bounce: "bounce" or "blocked"
}

// ============================================
// VERIFICATION
// ============================================

/**
 * Verify SendGrid webhook signature
 * SendGrid signs webhooks using their Event Webhook Verification Key
 */
function verifySendGridSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  try {
    const timestampPayload = timestamp + payload;
    const decodedSignature = Buffer.from(signature, "base64");

    const verifier = crypto.createVerify("sha256");
    verifier.update(timestampPayload);
    verifier.end();

    return verifier.verify(publicKey, decodedSignature);
  } catch (error) {
    console.error("[SendGrid Webhook] Signature verification error:", error);
    return false;
  }
}

// ============================================
// EVENT PROCESSING
// ============================================

/**
 * Process a batch of SendGrid events
 */
async function processEvents(events: SendGridEvent[]): Promise<{
  processed: number;
  errors: number;
}> {
  let processed = 0;
  let errors = 0;

  // Group events by campaign for batch updates
  const campaignUpdates = new Map<
    string,
    {
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      unsubscribed: number;
      shop: string;
    }
  >();

  // Deduplication: collect event IDs to check against database
  const eventIds = events
    .map((e) => e.sg_event_id)
    .filter((id): id is string => !!id);

  let processedEventIds = new Set<string>();
  if (eventIds.length > 0) {
    try {
      const existing = await prisma.emailEvent.findMany({
        where: { id: { in: eventIds } },
        select: { id: true },
      });
      processedEventIds = new Set(existing.map((e) => e.id));
    } catch (e) {
      // If emailEvent table doesn't exist yet, skip dedup
    }
  }

  for (const event of events) {
    try {
      // Deduplicate: skip events we've already processed
      if (event.sg_event_id && processedEventIds.has(event.sg_event_id)) {
        continue;
      }

      // Skip if no campaign ID
      const campaignId = event.campaign_id || (event.category?.[0] ?? null);
      const shop = event.shop || (event.category?.[1] ?? null);

      if (!campaignId || !shop) {
        console.log("[SendGrid Webhook] Skipping event without campaign/shop:", event.event);
        continue;
      }

      // Initialize campaign updates if not exists
      if (!campaignUpdates.has(campaignId)) {
        campaignUpdates.set(campaignId, {
          delivered: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0,
          shop,
        });
      }

      const updates = campaignUpdates.get(campaignId)!;

      // Increment based on event type
      switch (event.event) {
        case "delivered":
          updates.delivered++;
          break;
        case "open":
          updates.opened++;
          break;
        case "click":
          updates.clicked++;
          break;
        case "bounce":
        case "dropped":
          updates.bounced++;
          // Suppress customer on hard bounce to protect sender reputation
          if (event.email && event.type === "bounce") {
            try {
              await prisma.customer.updateMany({
                where: { shop, email: event.email, emailSuppressed: false },
                data: {
                  emailSuppressed: true,
                  suppressedAt: new Date(),
                  suppressionReason: "bounce",
                },
              });
            } catch (e) {
              // Non-critical — field may not exist yet until migration runs
            }
          }
          break;
        case "unsubscribe":
          updates.unsubscribed++;
          // Respect unsubscribe by updating marketing consent
          if (event.email) {
            try {
              await prisma.customer.updateMany({
                where: { shop, email: event.email },
                data: { acceptsMarketing: false },
              });
            } catch (e) {
              // Non-critical
            }
          }
          break;
        case "spam_report":
          updates.unsubscribed++;
          // Suppress customer on spam complaint
          if (event.email) {
            try {
              await prisma.customer.updateMany({
                where: { shop, email: event.email, emailSuppressed: false },
                data: {
                  emailSuppressed: true,
                  suppressedAt: new Date(),
                  suppressionReason: "spam_report",
                  acceptsMarketing: false,
                },
              });
            } catch (e) {
              // Non-critical
            }
          }
          break;
        case "processed":
        case "deferred":
          // Don't count these as metrics
          break;
      }

      // Record event for deduplication
      if (event.sg_event_id) {
        try {
          await prisma.emailEvent.create({
            data: {
              id: event.sg_event_id,
              shop,
              eventType: event.event.toUpperCase(),
              campaignId,
              customerEmail: event.email || "",
              metadata: {
                sg_message_id: event.sg_message_id,
                url: event.url,
                reason: event.reason,
              },
              createdAt: new Date(event.timestamp * 1000),
            },
          });
        } catch (e) {
          // Unique constraint violation = already processed, or table doesn't exist
        }
      }

      processed++;
    } catch (error) {
      console.error("[SendGrid Webhook] Error processing event:", error);
      errors++;
    }
  }

  // Apply campaign updates
  for (const [campaignId, updates] of campaignUpdates) {
    try {
      // Fetch current metrics
      const campaign = await prisma.emailCampaign.findFirst({
        where: { id: campaignId, shop: updates.shop },
        select: { metrics: true },
      });

      if (!campaign) {
        console.log(`[SendGrid Webhook] Campaign not found: ${campaignId}`);
        continue;
      }

      const currentMetrics = (campaign.metrics as any) || {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
        revenue: 0,
        orders: 0,
      };

      // Update metrics
      const newMetrics = {
        ...currentMetrics,
        delivered: currentMetrics.delivered + updates.delivered,
        opened: currentMetrics.opened + updates.opened,
        clicked: currentMetrics.clicked + updates.clicked,
        bounced: currentMetrics.bounced + updates.bounced,
        unsubscribed: currentMetrics.unsubscribed + updates.unsubscribed,
      };

      await prisma.emailCampaign.updateMany({
        where: { id: campaignId, shop: updates.shop },
        data: {
          metrics: newMetrics,
          updatedAt: new Date(),
        },
      });

      console.log(`[SendGrid Webhook] Updated campaign ${campaignId} metrics:`, {
        delivered: `+${updates.delivered}`,
        opened: `+${updates.opened}`,
        clicked: `+${updates.clicked}`,
        bounced: `+${updates.bounced}`,
        unsubscribed: `+${updates.unsubscribed}`,
      });
    } catch (error) {
      console.error(`[SendGrid Webhook] Error updating campaign ${campaignId}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

// ============================================
// ACTION HANDLER
// ============================================

export async function action({ request }: ActionFunctionArgs) {
  // Only accept POST requests
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const rawBody = await request.text();

    // Verify signature if verification key is configured
    const verificationKey = process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
    if (verificationKey) {
      const signature = request.headers.get("X-Twilio-Email-Event-Webhook-Signature");
      const timestamp = request.headers.get("X-Twilio-Email-Event-Webhook-Timestamp");

      if (!signature || !timestamp) {
        console.error("[SendGrid Webhook] Missing signature headers");
        return json({ error: "Missing signature" }, { status: 401 });
      }

      const isValid = verifySendGridSignature(verificationKey, rawBody, signature, timestamp);
      if (!isValid) {
        console.error("[SendGrid Webhook] Invalid signature");
        return json({ error: "Invalid signature" }, { status: 401 });
      }
    } else {
      console.warn("[SendGrid Webhook] No verification key configured - skipping signature check");
    }

    // Parse events
    let events: SendGridEvent[];
    try {
      events = JSON.parse(rawBody);
      if (!Array.isArray(events)) {
        events = [events];
      }
    } catch (parseError) {
      console.error("[SendGrid Webhook] Failed to parse body:", parseError);
      return json({ error: "Invalid JSON" }, { status: 400 });
    }

    console.log(`[SendGrid Webhook] Received ${events.length} events`);

    // Process events
    const result = await processEvents(events);

    console.log(`[SendGrid Webhook] Processed: ${result.processed}, Errors: ${result.errors}`);

    return json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("[SendGrid Webhook] Unexpected error:", error);
    return json({ error: error.message }, { status: 500 });
  }
}

// Loader returns 405 for GET requests
export async function loader() {
  return json({ error: "Method not allowed" }, { status: 405 });
}
