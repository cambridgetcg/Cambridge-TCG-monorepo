/**
 * Slack Integration API Endpoint
 *
 * Handles Slack slash commands and interactive components.
 *
 * Routes:
 *   POST /api/integrations/slack?type=command - Slash commands
 *   POST /api/integrations/slack?type=interaction - Button/modal callbacks
 *   GET /api/integrations/slack - Health check / info
 *
 * Authentication: Slack request signature verification
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "~/db.server";
import { createLogger } from "~/services/logger.server";
import { getIntegration } from "~/services/integrations/integration-manager.server";
import {
  buildCustomerLookupResponse,
  buildPointsAwardedResponse,
  buildErrorResponse,
  buildStatsResponse,
  type SlackConfig,
} from "~/services/integrations/adapters/slack-adapter.server";

const logger = createLogger("SlackAPI");

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify Slack request signature
 */
function verifySlackSignature(
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    logger.error("SLACK_SIGNING_SECRET not configured");
    return false;
  }

  // Check timestamp is within 5 minutes
  const requestTimestamp = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTimestamp) > 300) {
    logger.warn("Slack request timestamp too old", {
      requestTimestamp,
      now,
      diff: Math.abs(now - requestTimestamp),
    });
    return false;
  }

  // Compute signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const hmac = createHmac("sha256", signingSecret);
  hmac.update(sigBasestring);
  const computedSignature = `v0=${hmac.digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Find shop by Slack team ID
 */
async function findShopByTeamId(teamId: string): Promise<string | null> {
  const integration = await prisma.integration.findFirst({
    where: {
      provider: "SLACK",
      status: "CONNECTED",
    },
    select: {
      shop: true,
      config: true,
    },
  });

  if (!integration) return null;

  const config = integration.config as unknown as SlackConfig;
  if (config.teamId === teamId) {
    return integration.shop;
  }

  // Check all integrations if first doesn't match
  const integrations = await prisma.integration.findMany({
    where: {
      provider: "SLACK",
      status: "CONNECTED",
    },
    select: {
      shop: true,
      config: true,
    },
  });

  for (const int of integrations) {
    const intConfig = int.config as unknown as SlackConfig;
    if (intConfig.teamId === teamId) {
      return int.shop;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADER - GET requests
// ═══════════════════════════════════════════════════════════════════════════

export async function loader({ request }: LoaderFunctionArgs) {
  // Health check / info endpoint
  return json({
    provider: "SLACK",
    version: "1.0",
    endpoints: {
      commands: "/api/integrations/slack?type=command",
      interactions: "/api/integrations/slack?type=interaction",
    },
    commands: [
      "/loyalty lookup <email> - Look up customer",
      "/loyalty points <email> <amount> <reason> - Award/deduct points",
      "/loyalty tier <email> - Get tier info",
      "/loyalty stats [period] - Program statistics",
    ],
    authentication: "Slack signature verification",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION - POST requests
// ═══════════════════════════════════════════════════════════════════════════

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "command";

  // Get raw body for signature verification
  const body = await request.text();

  // Verify Slack signature
  const timestamp = request.headers.get("X-Slack-Request-Timestamp") || "";
  const signature = request.headers.get("X-Slack-Signature") || "";

  if (!verifySlackSignature(timestamp, body, signature)) {
    logger.warn("Invalid Slack signature");
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    // Parse body based on content type
    let payload: Record<string, unknown>;

    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(body);

      // Check if it's an interaction payload (has 'payload' field)
      const interactionPayload = params.get("payload");
      if (interactionPayload) {
        payload = JSON.parse(interactionPayload);
      } else {
        // Convert URLSearchParams to object for commands
        payload = Object.fromEntries(params.entries());
      }
    } else {
      payload = JSON.parse(body);
    }

    // Route to appropriate handler
    if (type === "interaction" || payload.type) {
      return handleInteraction(payload);
    }

    return handleCommand(payload);
  } catch (error) {
    logger.error("Slack API error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return json(buildErrorResponse("An error occurred processing your request"));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleCommand(payload: Record<string, unknown>) {
  const {
    team_id,
    command,
    text,
    user_name,
    response_url,
  } = payload as {
    team_id: string;
    command: string;
    text: string;
    user_name: string;
    response_url: string;
  };

  logger.info("Slack command received", {
    teamId: team_id,
    command,
    text,
    user: user_name,
  });

  // Find shop by team ID
  const shop = await findShopByTeamId(team_id);
  if (!shop) {
    return json(buildErrorResponse("Slack workspace not connected to any shop"));
  }

  // Parse command
  const args = text.trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
    case "lookup":
      return handleLookupCommand(shop, args.slice(1));

    case "points":
      return handlePointsCommand(shop, args.slice(1), user_name);

    case "tier":
      return handleTierCommand(shop, args.slice(1));

    case "stats":
      return handleStatsCommand(shop, args.slice(1));

    case "help":
    default:
      return json({
        text: "RewardsPro Commands",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Available Commands:*\n" +
                "`/loyalty lookup <email>` - Look up customer\n" +
                "`/loyalty points <email> <amount> <reason>` - Award/deduct points\n" +
                "`/loyalty tier <email>` - Get tier info\n" +
                "`/loyalty stats [today|week|month]` - Program statistics",
            },
          },
        ],
      });
  }
}

/**
 * Handle /loyalty lookup <email>
 */
async function handleLookupCommand(shop: string, args: string[]) {
  const email = args[0]?.toLowerCase();

  if (!email) {
    return json(buildErrorResponse("Usage: `/loyalty lookup <email>`"));
  }

  // Find customer
  const customer = await prisma.customer.findUnique({
    where: { shop_email: { shop, email } },
    include: { currentTier: true },
  });

  if (!customer) {
    return json(buildErrorResponse(`Customer not found: ${email}`));
  }

  return json(buildCustomerLookupResponse({
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    currentPoints: Number(customer.pointsBalance),
    totalPointsEarned: Number(customer.lifetimePoints),
    tier: customer.currentTier,
  }));
}

/**
 * Handle /loyalty points <email> <amount> <reason>
 */
async function handlePointsCommand(
  shop: string,
  args: string[],
  userName: string
) {
  const [email, amountStr, ...reasonParts] = args;
  const amount = parseInt(amountStr, 10);
  const reason = reasonParts.join(" ") || `Awarded by ${userName} via Slack`;

  if (!email || isNaN(amount)) {
    return json(buildErrorResponse("Usage: `/loyalty points <email> <amount> <reason>`"));
  }

  // Find customer
  const customer = await prisma.customer.findUnique({
    where: { shop_email: { shop, email: email.toLowerCase() } },
  });

  if (!customer) {
    return json(buildErrorResponse(`Customer not found: ${email}`));
  }

  const currentBalance = Number(customer.pointsBalance);

  // Check for negative points deduction
  if (amount < 0 && currentBalance < Math.abs(amount)) {
    return json(buildErrorResponse(
      `Insufficient points. Balance: ${currentBalance}, Requested: ${Math.abs(amount)}`
    ));
  }

  // Calculate new balance
  const newBalance = currentBalance + amount;

  // Update points
  const updatedCustomer = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      pointsBalance: newBalance,
      lifetimePoints: amount > 0 ? { increment: amount } : undefined,
    },
  });

  // Create ledger entry
  await prisma.pointsLedger.create({
    data: {
      shop,
      customerId: customer.id,
      type: amount > 0 ? "MANUAL_CREDIT" : "RAFFLE_ENTRY", // MANUAL_CREDIT for positive, use appropriate type for negative
      amount: amount,
      balance: newBalance,
      description: reason,
      metadata: {
        provider: "SLACK",
        action: "points_command",
        slackUser: userName,
      },
    },
  });

  logger.info("Points awarded via Slack", {
    shop,
    customerId: customer.id,
    amount,
    slackUser: userName,
  });

  return json(buildPointsAwardedResponse(
    email,
    amount,
    Number(updatedCustomer.pointsBalance),
    reason
  ));
}

/**
 * Handle /loyalty tier <email>
 */
async function handleTierCommand(shop: string, args: string[]) {
  const email = args[0]?.toLowerCase();

  if (!email) {
    return json(buildErrorResponse("Usage: `/loyalty tier <email>`"));
  }

  // Find customer with tier
  const customer = await prisma.customer.findUnique({
    where: { shop_email: { shop, email } },
    include: { currentTier: true },
  });

  if (!customer) {
    return json(buildErrorResponse(`Customer not found: ${email}`));
  }

  // Get next tier if exists
  let nextTier = null;
  if (customer.currentTier) {
    nextTier = await prisma.tier.findFirst({
      where: {
        shop,
        level: customer.currentTier.level + 1,
      },
    });
  }

  const tierName = customer.currentTier?.name || "No Tier";
  const lifetimePoints = Number(customer.lifetimePoints);
  const progress = nextTier
    ? Math.round((lifetimePoints / Number(nextTier.minSpend || 0)) * 100)
    : 100;

  return json({
    text: `Tier info for ${email}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `:trophy: ${tierName}`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${email}*`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Current Tier:*\n${tierName}` },
          { type: "mrkdwn", text: `*Lifetime Points:*\n${lifetimePoints.toLocaleString()}` },
          ...(nextTier ? [
            { type: "mrkdwn", text: `*Next Tier:*\n${nextTier.name}` },
            { type: "mrkdwn", text: `*Progress:*\n${progress}%` },
          ] : []),
        ],
      },
    ],
  });
}

/**
 * Handle /loyalty stats [period]
 */
async function handleStatsCommand(shop: string, args: string[]) {
  const period = args[0]?.toLowerCase() || "today";

  // Calculate date range
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "today":
    default:
      startDate = new Date(now.setHours(0, 0, 0, 0));
  }

  // Fetch statistics
  const [pointsStats, newMembers, tierUpgrades] = await Promise.all([
    prisma.pointsLedger.aggregate({
      where: {
        shop,
        createdAt: { gte: startDate },
      },
      _sum: { amount: true },
    }),
    prisma.customer.count({
      where: {
        shop,
        createdAt: { gte: startDate },
      },
    }),
    prisma.tierChangeLog.count({
      where: {
        shop,
        createdAt: { gte: startDate },
        changeType: "UPGRADE",
      },
    }),
  ]);

  // Separate earned vs redeemed (positive amounts = earned, negative = redeemed)
  const earned = await prisma.pointsLedger.aggregate({
    where: {
      shop,
      createdAt: { gte: startDate },
      amount: { gt: 0 },
    },
    _sum: { amount: true },
  });

  const redeemed = await prisma.pointsLedger.aggregate({
    where: {
      shop,
      createdAt: { gte: startDate },
      amount: { lt: 0 },
    },
    _sum: { amount: true },
  });

  return json(buildStatsResponse({
    period: period.charAt(0).toUpperCase() + period.slice(1),
    pointsEarned: earned._sum.amount || 0,
    pointsRedeemed: Math.abs(redeemed._sum.amount || 0),
    newMembers,
    tierUpgrades,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTION HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleInteraction(payload: Record<string, unknown>) {
  const { type, user, actions, response_url } = payload as {
    type: string;
    user: { id: string; username: string; team_id: string };
    actions?: Array<{ action_id: string; value?: string }>;
    response_url?: string;
  };

  logger.info("Slack interaction received", {
    type,
    user: user?.username,
    actions: actions?.map((a) => a.action_id),
  });

  // Handle button clicks
  if (type === "block_actions" && actions && actions.length > 0) {
    const action = actions[0];
    const actionId = action.action_id;

    // Award points button
    if (actionId.startsWith("award_points_")) {
      const email = actionId.replace("award_points_", "");
      // Return modal trigger (simplified - full implementation needs trigger_id)
      return json({
        text: `To award points to ${email}, use: \`/loyalty points ${email} <amount> <reason>\``,
      });
    }

    // View profile button - acknowledged
    if (actionId.startsWith("view_profile_")) {
      return json({ text: "Opening profile..." });
    }
  }

  // Default acknowledgment
  return json({ text: "Action received" });
}
