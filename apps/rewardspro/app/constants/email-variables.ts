/**
 * Email Personalization Variables
 *
 * Centralized definition of merge tags available for email templates.
 * These variables are replaced with actual customer data when emails are sent.
 */

export type EmailVariableCategory =
  | "customer"
  | "tier"
  | "spending"
  | "points"
  | "raffle"
  | "mystery_box"
  | "challenge"
  | "store";

export interface EmailVariable {
  /** The merge tag syntax, e.g., "{{customer_name}}" */
  variable: string;
  /** Display label for the UI */
  label: string;
  /** Description of what this variable contains */
  description: string;
  /** Example value for preview */
  example: string;
  /** Category for grouping in the UI */
  category: EmailVariableCategory;
}

/**
 * Category labels for display in the UI
 */
export const EMAIL_VARIABLE_CATEGORIES: Record<EmailVariableCategory, string> =
  {
    customer: "Customer Info",
    tier: "Tier & Membership",
    spending: "Spending & Orders",
    points: "Points & Rewards",
    raffle: "Raffles",
    mystery_box: "Mystery Boxes",
    challenge: "Challenges",
    store: "Store Info",
  };

/**
 * Available personalization variables for email templates.
 * Used in template editor for variable insertion.
 */
export const EMAIL_PERSONALIZATION_VARIABLES: EmailVariable[] = [
  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER INFO
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{customer_name}}",
    label: "Customer Name",
    description: "Customer's first name",
    example: "John",
    category: "customer",
  },
  {
    variable: "{{customer_since}}",
    label: "Member Since",
    description: "When the customer joined",
    example: "March 2023",
    category: "customer",
  },
  {
    variable: "{{days_since_last_order}}",
    label: "Days Since Last Order",
    description: "Days since customer's last purchase",
    example: "14",
    category: "customer",
  },

  // ═══════════════════════════════════════════════════════════════════
  // TIER & MEMBERSHIP
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{tier_name}}",
    label: "Tier Name",
    description: "Current membership tier",
    example: "Gold",
    category: "tier",
  },
  {
    variable: "{{next_tier_name}}",
    label: "Next Tier",
    description: "Next tier to unlock",
    example: "Platinum",
    category: "tier",
  },
  {
    variable: "{{spend_to_next_tier}}",
    label: "Spend to Next Tier",
    description: "Amount needed to reach next tier",
    example: "$150.00",
    category: "tier",
  },
  {
    variable: "{{progress_percent}}",
    label: "Tier Progress",
    description: "Progress percentage to next tier",
    example: "65%",
    category: "tier",
  },
  {
    variable: "{{tier_benefits}}",
    label: "Tier Benefits",
    description: "List of current tier benefits",
    example: "Free shipping, 10% bonus points",
    category: "tier",
  },
  {
    variable: "{{cashback_rate}}",
    label: "Cashback Rate",
    description: "Current cashback percentage",
    example: "5%",
    category: "tier",
  },

  // ═══════════════════════════════════════════════════════════════════
  // SPENDING & ORDERS
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{total_lifetime_spend}}",
    label: "Lifetime Spending",
    description: "Customer's total all-time spending",
    example: "$2,450.00",
    category: "spending",
  },
  {
    variable: "{{order_count}}",
    label: "Order Count",
    description: "Total number of orders placed",
    example: "15",
    category: "spending",
  },
  {
    variable: "{{total_cashback_earned}}",
    label: "Total Cashback Earned",
    description: "Cumulative cashback received",
    example: "$127.50",
    category: "spending",
  },

  // ═══════════════════════════════════════════════════════════════════
  // POINTS & REWARDS
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{store_credit}}",
    label: "Store Credit",
    description: "Available store credit balance",
    example: "$25.00",
    category: "points",
  },
  {
    variable: "{{points_balance}}",
    label: "Points Balance",
    description: "Customer's current points balance",
    example: "1,250",
    category: "points",
  },
  {
    variable: "{{lifetime_points}}",
    label: "Lifetime Points",
    description: "Total points ever earned",
    example: "5,420",
    category: "points",
  },

  // ═══════════════════════════════════════════════════════════════════
  // RAFFLES
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{raffle_name}}",
    label: "Raffle Name",
    description: "Name of active raffle",
    example: "Spring Giveaway",
    category: "raffle",
  },
  {
    variable: "{{raffle_entries_count}}",
    label: "My Raffle Entries",
    description: "Customer's total entries in raffle",
    example: "5",
    category: "raffle",
  },
  {
    variable: "{{raffle_entries_remaining}}",
    label: "Entries Remaining",
    description: "Entries still available to purchase",
    example: "5 of 10",
    category: "raffle",
  },
  {
    variable: "{{raffle_ends_at}}",
    label: "Raffle Ends",
    description: "When the raffle closes",
    example: "February 28, 2025",
    category: "raffle",
  },
  {
    variable: "{{raffle_entry_cost}}",
    label: "Points per Entry",
    description: "Points required per entry",
    example: "100 points",
    category: "raffle",
  },
  {
    variable: "{{raffle_prize}}",
    label: "Raffle Prize",
    description: "Prize being offered",
    example: "$500 Store Credit",
    category: "raffle",
  },

  // ═══════════════════════════════════════════════════════════════════
  // MYSTERY BOXES
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{mystery_box_name}}",
    label: "Mystery Box Name",
    description: "Name of active mystery box",
    example: "Golden Mystery Box",
    category: "mystery_box",
  },
  {
    variable: "{{mystery_box_opens_count}}",
    label: "My Box Opens",
    description: "Customer's total opens",
    example: "3",
    category: "mystery_box",
  },
  {
    variable: "{{mystery_box_opens_remaining}}",
    label: "Opens Remaining",
    description: "Opens still available",
    example: "2 of 5",
    category: "mystery_box",
  },
  {
    variable: "{{mystery_box_cost}}",
    label: "Open Cost",
    description: "Points required to open",
    example: "100 points",
    category: "mystery_box",
  },
  {
    variable: "{{mystery_box_ends_at}}",
    label: "Box Ends",
    description: "When the mystery box closes",
    example: "February 28, 2025",
    category: "mystery_box",
  },

  // ═══════════════════════════════════════════════════════════════════
  // CHALLENGES
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{challenge_name}}",
    label: "Challenge Name",
    description: "Name of active challenge",
    example: "Spend $500 Challenge",
    category: "challenge",
  },
  {
    variable: "{{challenge_progress}}",
    label: "Challenge Progress",
    description: "Current progress amount",
    example: "$275",
    category: "challenge",
  },
  {
    variable: "{{challenge_progress_percent}}",
    label: "Challenge Progress %",
    description: "Progress as percentage",
    example: "55%",
    category: "challenge",
  },
  {
    variable: "{{challenge_target}}",
    label: "Challenge Target",
    description: "Goal to achieve",
    example: "$500",
    category: "challenge",
  },
  {
    variable: "{{challenge_remaining}}",
    label: "Challenge Remaining",
    description: "Amount left to complete",
    example: "$225",
    category: "challenge",
  },
  {
    variable: "{{challenge_ends_at}}",
    label: "Challenge Ends",
    description: "Deadline to complete",
    example: "February 28, 2025",
    category: "challenge",
  },
  {
    variable: "{{challenge_reward}}",
    label: "Challenge Reward",
    description: "What customer can earn",
    example: "1,000 points",
    category: "challenge",
  },

  // ═══════════════════════════════════════════════════════════════════
  // STORE INFO
  // ═══════════════════════════════════════════════════════════════════
  {
    variable: "{{shop_name}}",
    label: "Shop Name",
    description: "Your store name",
    example: "My Awesome Store",
    category: "store",
  },
  {
    variable: "{{shop_url}}",
    label: "Shop URL",
    description: "Link to your store",
    example: "https://mystore.com",
    category: "store",
  },
];

/**
 * Get variables grouped by category
 */
export function getVariablesByCategory(): Record<
  EmailVariableCategory,
  EmailVariable[]
> {
  return EMAIL_PERSONALIZATION_VARIABLES.reduce(
    (acc, variable) => {
      if (!acc[variable.category]) {
        acc[variable.category] = [];
      }
      acc[variable.category].push(variable);
      return acc;
    },
    {} as Record<EmailVariableCategory, EmailVariable[]>
  );
}

export default EMAIL_PERSONALIZATION_VARIABLES;
