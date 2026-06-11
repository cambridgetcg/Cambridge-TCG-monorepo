/**
 * Anthropic Claude Prompt Templates
 *
 * Specialized prompts for loyalty program email content generation.
 * Includes context about RewardsPro features and personalization variables.
 */

import type { AIAction, AIContext } from "./anthropic.server";

// ============================================================================
// PERSONALIZATION VARIABLES DOCUMENTATION
// ============================================================================

const PERSONALIZATION_VARIABLES = `
AVAILABLE PERSONALIZATION VARIABLES:
These can be inserted anywhere in the email content and will be replaced with actual customer data.

CUSTOMER INFO:
- {{customer_name}} - Customer's first name (e.g., "John")
- {{customer_since}} - When the customer joined (e.g., "March 2023")
- {{days_since_last_order}} - Days since last purchase (e.g., "14")

TIER & MEMBERSHIP:
- {{tier_name}} - Current membership tier (e.g., "Gold")
- {{next_tier_name}} - Next tier to unlock (e.g., "Platinum")
- {{spend_to_next_tier}} - Amount needed for next tier (e.g., "$150.00")
- {{progress_percent}} - Progress to next tier (e.g., "65%")
- {{tier_benefits}} - List of current tier benefits
- {{cashback_rate}} - Current cashback percentage (e.g., "5%")

SPENDING & ORDERS:
- {{total_lifetime_spend}} - Total all-time spending (e.g., "$2,450.00")
- {{order_count}} - Total orders placed (e.g., "15")
- {{total_cashback_earned}} - Cumulative cashback (e.g., "$127.50")

POINTS & REWARDS:
- {{store_credit}} - Available store credit (e.g., "$25.00")
- {{points_balance}} - Current points balance (e.g., "1,250")
- {{lifetime_points}} - Total points ever earned (e.g., "5,420")

RAFFLES:
- {{raffle_name}} - Active raffle name
- {{raffle_entries_count}} - Customer's entries
- {{raffle_ends_at}} - Raffle deadline

MYSTERY BOXES:
- {{mystery_box_name}} - Active box name
- {{mystery_box_opens_remaining}} - Opens still available

CHALLENGES:
- {{challenge_name}} - Active challenge name
- {{challenge_progress_percent}} - Progress percentage
- {{challenge_ends_at}} - Challenge deadline
- {{challenge_reward}} - What customer can earn

STORE INFO:
- {{shop_name}} - Store name
- {{shop_url}} - Store URL
`;

// ============================================================================
// TEMPLATE TYPE GUIDANCE
// ============================================================================

const TEMPLATE_TYPE_GUIDANCE: Record<string, string> = {
  tier_welcome: `
TEMPLATE TYPE: Tier Welcome
PURPOSE: Welcome new tier members and highlight their new benefits
TONE: Warm, celebratory, appreciative
FOCUS:
- Congratulate on reaching the tier
- Highlight key benefits they now have access to
- Encourage first use of new benefits
- Create excitement about their status
SUGGESTED VARIABLES: {{customer_name}}, {{tier_name}}, {{cashback_rate}}, {{tier_benefits}}
`,

  tier_upgrade: `
TEMPLATE TYPE: Tier Upgrade
PURPOSE: Celebrate customer advancement to a higher tier
TONE: Excited, congratulatory, rewarding
FOCUS:
- Acknowledge their achievement
- Emphasize the improved benefits
- Compare old vs new perks
- Drive immediate engagement with new benefits
SUGGESTED VARIABLES: {{customer_name}}, {{tier_name}}, {{cashback_rate}}, {{total_lifetime_spend}}
`,

  tier_downgrade: `
TEMPLATE TYPE: Tier Downgrade
PURPOSE: Notify about tier status change with path to recovery
TONE: Understanding, supportive, motivational
FOCUS:
- Be transparent but not harsh
- Show them how to regain status
- Highlight what they still have
- Provide clear path back up
SUGGESTED VARIABLES: {{customer_name}}, {{tier_name}}, {{spend_to_next_tier}}, {{next_tier_name}}
`,

  reward_expiry: `
TEMPLATE TYPE: Reward Expiry Warning
PURPOSE: Create urgency about expiring rewards/points
TONE: Urgent but helpful, action-oriented
FOCUS:
- Clear expiration timeline
- What they'll lose if unused
- Easy ways to use rewards now
- Direct link to shop
SUGGESTED VARIABLES: {{customer_name}}, {{store_credit}}, {{points_balance}}, {{shop_url}}
`,

  inactive_reengagement: `
TEMPLATE TYPE: Win-Back / Re-engagement
PURPOSE: Bring back dormant customers
TONE: Personal, understanding, enticing
FOCUS:
- Acknowledge absence warmly
- Remind of value/benefits
- Offer incentive to return
- Make it easy to come back
SUGGESTED VARIABLES: {{customer_name}}, {{days_since_last_order}}, {{store_credit}}, {{tier_name}}
`,

  promotional: `
TEMPLATE TYPE: Promotional
PURPOSE: Drive sales with special offers
TONE: Exciting, urgent, benefit-focused
FOCUS:
- Clear value proposition
- Limited time/availability
- Member-exclusive angle
- Strong call-to-action
SUGGESTED VARIABLES: {{customer_name}}, {{tier_name}}, {{cashback_rate}}, {{shop_url}}
`,

  transactional: `
TEMPLATE TYPE: Transactional
PURPOSE: Order confirmations, shipping updates
TONE: Clear, professional, helpful
FOCUS:
- Essential information first
- Reassurance and next steps
- Loyalty program tie-in (points earned, etc.)
- Support contact if needed
SUGGESTED VARIABLES: {{customer_name}}, {{shop_name}}
`,
};

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export function buildSystemPrompt(context: AIContext): string {
  const templateGuidance =
    TEMPLATE_TYPE_GUIDANCE[context.templateType] ||
    TEMPLATE_TYPE_GUIDANCE.promotional;

  return `You are an expert email copywriter specializing in e-commerce loyalty programs. You create engaging, personalized email content for RewardsPro, a Shopify loyalty app.

CORE PRINCIPLES:
1. Write concise, scannable content (mobile-first)
2. Use personalization variables naturally
3. Focus on customer benefits, not features
4. Include clear calls-to-action
5. Match tone to template type
6. Keep paragraphs short (2-3 sentences max)

${PERSONALIZATION_VARIABLES}

${templateGuidance}

${context.shopName ? `BRAND: ${context.shopName}` : ""}

OUTPUT RULES:
- Return ONLY the requested content (no explanations, no markdown formatting unless asked)
- Include personalization variables where they naturally fit
- Keep content email-friendly (short paragraphs, clear structure)
- For subject lines, return each on a new line without numbers or bullets`;
}

// ============================================================================
// USER PROMPTS BY ACTION
// ============================================================================

export function buildUserPrompt(
  action: AIAction,
  userPrompt: string,
  context: AIContext
): string {
  switch (action) {
    case "generate":
      return buildGeneratePrompt(userPrompt, context);
    case "enhance":
      return buildEnhancePrompt(userPrompt, context);
    case "subject_lines":
      return buildSubjectLinesPrompt(userPrompt, context);
    default:
      return userPrompt;
  }
}

function buildGeneratePrompt(userPrompt: string, context: AIContext): string {
  const blockContext = context.blockType
    ? `\nGENERATING FOR: ${context.blockType} block`
    : "";

  return `Create email content for a ${context.templateType} email.
${blockContext}

USER REQUEST: ${userPrompt}

Write the content now:`;
}

function buildEnhancePrompt(userPrompt: string, context: AIContext): string {
  if (!context.currentContent) {
    return buildGeneratePrompt(userPrompt, context);
  }

  return `Improve the following email content for a ${context.templateType} email.

CURRENT CONTENT:
${context.currentContent}

ENHANCEMENT REQUEST: ${userPrompt}

Write the improved content now:`;
}

function buildSubjectLinesPrompt(
  userPrompt: string,
  context: AIContext
): string {
  const currentSubject = context.currentSubject
    ? `\nCURRENT SUBJECT: ${context.currentSubject}`
    : "";
  const previewText = context.previewText
    ? `\nPREVIEW TEXT: ${context.previewText}`
    : "";

  return `Generate 5 compelling email subject lines for a ${context.templateType} email.
${currentSubject}
${previewText}

REQUIREMENTS:
- Under 50 characters each
- Use personalization ({{customer_name}} or {{tier_name}}) in at least 2
- Vary approaches: question, benefit, urgency, personalized, emoji
- Match the ${context.templateType} email purpose

${userPrompt ? `ADDITIONAL GUIDANCE: ${userPrompt}` : ""}

Write 5 subject lines now (one per line, no numbers or bullets):`;
}

// ============================================================================
// QUICK PROMPT SUGGESTIONS
// ============================================================================

export const QUICK_PROMPTS: Record<string, { label: string; prompt: string }[]> =
  {
    tier_welcome: [
      { label: "Welcome message", prompt: "Write a warm welcome for new tier members highlighting their key benefits" },
      { label: "Benefits overview", prompt: "Create a brief overview of their new tier benefits and how to use them" },
      { label: "First purchase CTA", prompt: "Write an engaging call-to-action encouraging their first purchase as a new tier member" },
    ],
    tier_upgrade: [
      { label: "Congratulations", prompt: "Write an exciting congratulations message for reaching a new tier" },
      { label: "New perks", prompt: "Highlight the new perks and benefits they've unlocked" },
      { label: "Exclusive access", prompt: "Emphasize their new exclusive access and VIP status" },
    ],
    promotional: [
      { label: "Limited offer", prompt: "Create urgency around a limited-time exclusive offer for members" },
      { label: "Flash sale", prompt: "Write an exciting flash sale announcement with member-exclusive discount" },
      { label: "New arrivals", prompt: "Announce new arrivals with a personalized recommendation feel" },
    ],
    inactive_reengagement: [
      { label: "We miss you", prompt: "Write a warm 'we miss you' message to re-engage inactive customers" },
      { label: "What's new", prompt: "Highlight what they've been missing and new benefits available" },
      { label: "Special offer", prompt: "Create a special comeback offer to incentivize return" },
    ],
    reward_expiry: [
      { label: "Expiry warning", prompt: "Create an urgent but friendly reminder about expiring rewards" },
      { label: "Use your points", prompt: "Encourage using points before they expire with specific suggestions" },
      { label: "Last chance", prompt: "Write a final reminder with clear deadline and call-to-action" },
    ],
    default: [
      { label: "Welcome message", prompt: "Write a warm welcome message for loyalty members" },
      { label: "Thank you", prompt: "Create a heartfelt thank you message for being a valued customer" },
      { label: "Shop now CTA", prompt: "Write an engaging call-to-action to visit the store" },
    ],
  };

export function getQuickPromptsForType(templateType: string): { label: string; prompt: string }[] {
  return QUICK_PROMPTS[templateType] || QUICK_PROMPTS.default;
}
