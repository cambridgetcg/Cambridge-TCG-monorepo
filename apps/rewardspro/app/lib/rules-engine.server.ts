/**
 * Rules Engine - Path Foundation for Custom Loyalty Rules
 *
 * PURPOSE:
 * Extensible rules engine for custom points earning and rewards.
 * This pattern enables:
 * - Custom earning rules beyond basic order-based points
 * - Conditional rewards based on customer behavior
 * - Time-based and event-based triggers
 * - Composable rule conditions and actions
 *
 * USAGE:
 * ```typescript
 * // Define a rule
 * const rule: LoyaltyRule = {
 *   id: 'birthday-bonus',
 *   name: 'Birthday Double Points',
 *   trigger: { type: 'event', event: 'order.created' },
 *   conditions: [
 *     { type: 'customer_birthday', operator: 'is_today' }
 *   ],
 *   actions: [
 *     { type: 'multiply_points', multiplier: 2 }
 *   ],
 * };
 *
 * // Evaluate rules for an event
 * const results = await rulesEngine.evaluate('order.created', context);
 * ```
 *
 * ARCHITECTURE:
 * ```
 * Event/Trigger → Rules Engine → Condition Matcher → Action Executor
 *                      ↓
 *              Rule Repository (DB)
 * ```
 */

import { db } from "~/db.server";

// ============================================================================
// Types - Rule Definition
// ============================================================================

export type RuleTriggerType =
  | 'event'          // Triggered by specific event (order, signup, etc.)
  | 'schedule'       // Triggered by cron/schedule
  | 'threshold'      // Triggered when threshold crossed
  | 'manual';        // Triggered by admin action

export type RuleEvent =
  | 'order.created'
  | 'order.paid'
  | 'customer.created'
  | 'customer.birthday'
  | 'tier.upgraded'
  | 'points.earned'
  | 'referral.converted'
  | 'challenge.completed'
  | 'review.submitted'
  | 'social.shared';

export interface RuleTrigger {
  type: RuleTriggerType;
  event?: RuleEvent;
  schedule?: string; // Cron expression
  threshold?: {
    metric: string;
    operator: 'gte' | 'lte' | 'eq';
    value: number;
  };
}

// ============================================================================
// Types - Conditions
// ============================================================================

export type ConditionType =
  | 'customer_tier'
  | 'customer_birthday'
  | 'customer_anniversary'
  | 'customer_lifetime_value'
  | 'customer_order_count'
  | 'order_total'
  | 'order_contains_product'
  | 'order_contains_category'
  | 'order_contains_sku'
  | 'time_range'
  | 'day_of_week'
  | 'first_order'
  | 'referred_customer'
  | 'custom';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equals'
  | 'less_than_or_equals'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'is_today'
  | 'is_within_days'
  | 'between';

export interface RuleCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value?: any;
  field?: string; // For custom conditions
  // Logical grouping
  and?: RuleCondition[];
  or?: RuleCondition[];
}

// ============================================================================
// Types - Actions
// ============================================================================

export type ActionType =
  | 'award_points'
  | 'multiply_points'
  | 'award_store_credit'
  | 'upgrade_tier'
  | 'send_notification'
  | 'apply_discount'
  | 'trigger_email'
  | 'add_tag'
  | 'custom_webhook';

export interface RuleAction {
  type: ActionType;
  // Action-specific parameters
  points?: number;
  multiplier?: number;
  storeCredit?: number;
  tierId?: string;
  tierDuration?: number; // days
  discountCode?: string;
  discountPercent?: number;
  emailTemplateId?: string;
  tag?: string;
  webhookUrl?: string;
  webhookPayload?: Record<string, any>;
}

// ============================================================================
// Types - Rule Definition
// ============================================================================

export interface LoyaltyRule {
  id: string;
  shop: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority: number; // Higher = evaluated first

  trigger: RuleTrigger;
  conditions: RuleCondition[];
  actions: RuleAction[];

  // Limits
  maxExecutionsPerCustomer?: number;
  maxExecutionsTotal?: number;
  validFrom?: Date;
  validUntil?: Date;

  // Tracking
  executionCount: number;
  lastExecutedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Types - Evaluation Context
// ============================================================================

export interface RuleContext {
  shop: string;
  customerId?: string;
  customer?: {
    id: string;
    email: string;
    tierId?: string;
    tierName?: string;
    totalSpent: number;
    orderCount: number;
    pointsBalance: number;
    lifetimePoints: number;
    birthday?: Date;
    createdAt: Date;
    tags?: string[];
  };
  order?: {
    id: string;
    total: number;
    subtotal: number;
    lineItems: Array<{
      productId: string;
      variantId: string;
      sku?: string;
      title: string;
      quantity: number;
      price: number;
      collections?: string[];
    }>;
    discountCodes?: string[];
    isFirstOrder?: boolean;
  };
  event?: {
    type: RuleEvent;
    data?: Record<string, any>;
  };
  timestamp: Date;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actions: RuleAction[];
  executedActions?: {
    action: RuleAction;
    success: boolean;
    result?: any;
    error?: string;
  }[];
}

// ============================================================================
// Condition Evaluators
// ============================================================================

type ConditionEvaluator = (
  condition: RuleCondition,
  context: RuleContext
) => boolean;

const conditionEvaluators: Record<ConditionType, ConditionEvaluator> = {
  customer_tier: (condition, context) => {
    const tierId = context.customer?.tierId;
    return evaluateOperator(tierId, condition.operator, condition.value);
  },

  customer_birthday: (condition, context) => {
    const birthday = context.customer?.birthday;
    if (!birthday) return false;

    const today = new Date();
    const birthdayThisYear = new Date(
      today.getFullYear(),
      birthday.getMonth(),
      birthday.getDate()
    );

    if (condition.operator === 'is_today') {
      return (
        today.getMonth() === birthdayThisYear.getMonth() &&
        today.getDate() === birthdayThisYear.getDate()
      );
    }

    if (condition.operator === 'is_within_days') {
      const diffTime = birthdayThisYear.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= (condition.value || 7);
    }

    return false;
  },

  customer_anniversary: (condition, context) => {
    const createdAt = context.customer?.createdAt;
    if (!createdAt) return false;

    const today = new Date();
    const anniversary = new Date(createdAt);
    anniversary.setFullYear(today.getFullYear());

    if (condition.operator === 'is_today') {
      return (
        today.getMonth() === anniversary.getMonth() &&
        today.getDate() === anniversary.getDate()
      );
    }

    return false;
  },

  customer_lifetime_value: (condition, context) => {
    const ltv = context.customer?.totalSpent || 0;
    return evaluateOperator(ltv, condition.operator, condition.value);
  },

  customer_order_count: (condition, context) => {
    const count = context.customer?.orderCount || 0;
    return evaluateOperator(count, condition.operator, condition.value);
  },

  order_total: (condition, context) => {
    const total = context.order?.total || 0;
    return evaluateOperator(total, condition.operator, condition.value);
  },

  order_contains_product: (condition, context) => {
    const productIds = context.order?.lineItems.map(li => li.productId) || [];
    return productIds.includes(condition.value);
  },

  order_contains_category: (condition, context) => {
    const collections = context.order?.lineItems.flatMap(li => li.collections || []) || [];
    return collections.includes(condition.value);
  },

  order_contains_sku: (condition, context) => {
    const skus = context.order?.lineItems.map(li => li.sku).filter(Boolean) || [];
    return skus.includes(condition.value);
  },

  time_range: (condition, context) => {
    const now = context.timestamp;
    const [startHour, endHour] = condition.value || [0, 24];
    const hour = now.getHours();
    return hour >= startHour && hour < endHour;
  },

  day_of_week: (condition, context) => {
    const day = context.timestamp.getDay();
    const allowedDays = condition.value || [];
    return allowedDays.includes(day);
  },

  first_order: (condition, context) => {
    return context.order?.isFirstOrder === true;
  },

  referred_customer: (condition, context) => {
    // Placeholder - will be implemented with referral system
    return false;
  },

  custom: (condition, context) => {
    // Custom condition evaluation - extensibility point
    // Could call external webhook or custom function
    console.warn('[RulesEngine] Custom conditions not yet implemented');
    return false;
  },
};

// ============================================================================
// Operator Evaluator
// ============================================================================

function evaluateOperator(value: any, operator: ConditionOperator, target: any): boolean {
  switch (operator) {
    case 'equals':
      return value === target;
    case 'not_equals':
      return value !== target;
    case 'greater_than':
      return value > target;
    case 'less_than':
      return value < target;
    case 'greater_than_or_equals':
      return value >= target;
    case 'less_than_or_equals':
      return value <= target;
    case 'contains':
      return String(value).includes(String(target));
    case 'not_contains':
      return !String(value).includes(String(target));
    case 'in':
      return Array.isArray(target) && target.includes(value);
    case 'not_in':
      return Array.isArray(target) && !target.includes(value);
    case 'between':
      return Array.isArray(target) && value >= target[0] && value <= target[1];
    default:
      return false;
  }
}

// ============================================================================
// Rules Engine Class
// ============================================================================

class RulesEngine {
  /**
   * Evaluate all rules for a given event and context
   */
  async evaluate(event: RuleEvent, context: RuleContext): Promise<RuleResult[]> {
    // Get active rules for this shop and event
    const rules = await this.getRulesForEvent(context.shop, event);
    const results: RuleResult[] = [];

    for (const rule of rules) {
      const matched = this.evaluateConditions(rule.conditions, context);

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched,
        actions: matched ? rule.actions : [],
      });
    }

    return results;
  }

  /**
   * Evaluate and execute rules for an event
   */
  async evaluateAndExecute(
    event: RuleEvent,
    context: RuleContext
  ): Promise<RuleResult[]> {
    const results = await this.evaluate(event, context);

    for (const result of results) {
      if (result.matched) {
        result.executedActions = await this.executeActions(
          result.actions,
          context
        );

        // Update rule execution count
        await this.trackRuleExecution(result.ruleId);
      }
    }

    return results;
  }

  /**
   * Evaluate conditions with AND/OR logic
   */
  private evaluateConditions(
    conditions: RuleCondition[],
    context: RuleContext
  ): boolean {
    return conditions.every(condition => this.evaluateCondition(condition, context));
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: RuleCondition,
    context: RuleContext
  ): boolean {
    // Handle AND groups
    if (condition.and) {
      return condition.and.every(c => this.evaluateCondition(c, context));
    }

    // Handle OR groups
    if (condition.or) {
      return condition.or.some(c => this.evaluateCondition(c, context));
    }

    // Evaluate the condition
    const evaluator = conditionEvaluators[condition.type];
    if (!evaluator) {
      console.warn(`[RulesEngine] Unknown condition type: ${condition.type}`);
      return false;
    }

    return evaluator(condition, context);
  }

  /**
   * Execute actions for matched rules
   */
  private async executeActions(
    actions: RuleAction[],
    context: RuleContext
  ): Promise<RuleResult['executedActions']> {
    const results: RuleResult['executedActions'] = [];

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, context);
        results.push({ action, success: true, result });
      } catch (error) {
        results.push({
          action,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: RuleAction,
    context: RuleContext
  ): Promise<any> {
    switch (action.type) {
      case 'award_points':
        return this.awardPoints(context, action.points || 0);

      case 'multiply_points':
        // This will be applied by the points calculation service
        return { multiplier: action.multiplier };

      case 'award_store_credit':
        return this.awardStoreCredit(context, action.storeCredit || 0);

      case 'send_notification':
        // Placeholder - integrate with notification service
        console.log(`[RulesEngine] Would send notification to ${context.customer?.email}`);
        return { sent: false, reason: 'Not implemented' };

      case 'trigger_email':
        // Placeholder - integrate with email service
        console.log(`[RulesEngine] Would send email template ${action.emailTemplateId}`);
        return { sent: false, reason: 'Not implemented' };

      case 'add_tag':
        return this.addCustomerTag(context, action.tag || '');

      case 'custom_webhook':
        return this.callWebhook(action.webhookUrl || '', action.webhookPayload || {}, context);

      default:
        console.warn(`[RulesEngine] Unknown action type: ${action.type}`);
        return { executed: false };
    }
  }

  /**
   * Award points to customer
   */
  private async awardPoints(context: RuleContext, points: number): Promise<any> {
    if (!context.customerId || points <= 0) return { awarded: false };

    // Use existing points ledger service
    const { awardPoints } = await import('~/services/points-ledger.server');
    await awardPoints({
      shop: context.shop,
      customerId: context.customerId,
      amount: points,
      source: 'RULE',
      description: 'Points awarded by loyalty rule',
      referenceType: 'RULE',
    });

    return { awarded: true, points };
  }

  /**
   * Award store credit to customer
   */
  private async awardStoreCredit(context: RuleContext, amount: number): Promise<any> {
    if (!context.customerId || amount <= 0) return { awarded: false };

    // Placeholder - integrate with store credit service
    console.log(`[RulesEngine] Would award ${amount} store credit to ${context.customerId}`);
    return { awarded: false, reason: 'Not fully implemented' };
  }

  /**
   * Add tag to customer
   */
  private async addCustomerTag(context: RuleContext, tag: string): Promise<any> {
    if (!context.customerId || !tag) return { added: false };

    // Placeholder - integrate with Shopify customer tags
    console.log(`[RulesEngine] Would add tag '${tag}' to customer ${context.customerId}`);
    return { added: false, reason: 'Not fully implemented' };
  }

  /**
   * Call custom webhook
   */
  private async callWebhook(
    url: string,
    payload: Record<string, any>,
    context: RuleContext
  ): Promise<any> {
    if (!url) return { called: false };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          context: {
            shop: context.shop,
            customerId: context.customerId,
            event: context.event,
            timestamp: context.timestamp.toISOString(),
          },
        }),
      });

      return { called: true, status: response.status };
    } catch (error) {
      return {
        called: false,
        error: error instanceof Error ? error.message : 'Webhook failed',
      };
    }
  }

  /**
   * Get rules for a specific event
   */
  private async getRulesForEvent(shop: string, event: RuleEvent): Promise<LoyaltyRule[]> {
    // TODO: Fetch from database when LoyaltyRule model is created
    // For now, return empty array (rules not yet stored in DB)
    return [];
  }

  /**
   * Track rule execution
   */
  private async trackRuleExecution(ruleId: string): Promise<void> {
    // TODO: Update execution count in database
    console.log(`[RulesEngine] Tracked execution for rule ${ruleId}`);
  }

  /**
   * Create a new rule
   */
  async createRule(rule: Omit<LoyaltyRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'>): Promise<LoyaltyRule> {
    // TODO: Save to database when model is created
    const newRule: LoyaltyRule = {
      ...rule,
      id: crypto.randomUUID(),
      executionCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(`[RulesEngine] Created rule: ${newRule.name}`);
    return newRule;
  }

  /**
   * Get rule templates for common use cases
   */
  getRuleTemplates(): Partial<LoyaltyRule>[] {
    return [
      {
        name: 'Birthday Double Points',
        description: 'Award double points on customer birthday',
        trigger: { type: 'event', event: 'order.paid' },
        conditions: [
          { type: 'customer_birthday', operator: 'is_today' }
        ],
        actions: [
          { type: 'multiply_points', multiplier: 2 }
        ],
      },
      {
        name: 'First Order Bonus',
        description: 'Extra points for first-time customers',
        trigger: { type: 'event', event: 'order.paid' },
        conditions: [
          { type: 'first_order', operator: 'equals', value: true }
        ],
        actions: [
          { type: 'award_points', points: 100 }
        ],
      },
      {
        name: 'High Spender Bonus',
        description: 'Bonus points for orders over $100',
        trigger: { type: 'event', event: 'order.paid' },
        conditions: [
          { type: 'order_total', operator: 'greater_than_or_equals', value: 100 }
        ],
        actions: [
          { type: 'award_points', points: 50 }
        ],
      },
      {
        name: 'Category Promotion',
        description: 'Double points on specific collection',
        trigger: { type: 'event', event: 'order.paid' },
        conditions: [
          { type: 'order_contains_category', operator: 'equals', value: 'PROMOTION_COLLECTION_ID' }
        ],
        actions: [
          { type: 'multiply_points', multiplier: 2 }
        ],
      },
      {
        name: 'VIP Tier Reward',
        description: 'Bonus for VIP tier customers',
        trigger: { type: 'event', event: 'order.paid' },
        conditions: [
          { type: 'customer_tier', operator: 'equals', value: 'VIP_TIER_ID' }
        ],
        actions: [
          { type: 'award_points', points: 25 }
        ],
      },
      {
        name: 'Anniversary Celebration',
        description: 'Bonus points on customer anniversary',
        trigger: { type: 'event', event: 'customer.anniversary' },
        conditions: [
          { type: 'customer_anniversary', operator: 'is_today' }
        ],
        actions: [
          { type: 'award_points', points: 200 },
          { type: 'trigger_email', emailTemplateId: 'anniversary' }
        ],
      },
    ];
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const rulesEngine = new RulesEngine();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build context from order webhook
 */
export async function buildContextFromOrder(
  shop: string,
  order: any,
  customerId?: string
): Promise<RuleContext> {
  let customer;
  if (customerId) {
    const dbCustomer = await db.customer.findUnique({
      where: { id: customerId },
      include: { tier: true },
    });
    if (dbCustomer) {
      customer = {
        id: dbCustomer.id,
        email: dbCustomer.email || '',
        tierId: dbCustomer.currentTierId || undefined,
        tierName: dbCustomer.tier?.name,
        totalSpent: Number(dbCustomer.totalSpent) || 0,
        orderCount: dbCustomer.orderCount || 0,
        pointsBalance: dbCustomer.pointsBalance || 0,
        lifetimePoints: dbCustomer.lifetimePoints || 0,
        createdAt: dbCustomer.createdAt,
      };
    }
  }

  return {
    shop,
    customerId,
    customer,
    order: order ? {
      id: order.id,
      total: Number(order.total_price) || 0,
      subtotal: Number(order.subtotal_price) || 0,
      lineItems: (order.line_items || []).map((li: any) => ({
        productId: String(li.product_id),
        variantId: String(li.variant_id),
        sku: li.sku,
        title: li.title,
        quantity: li.quantity,
        price: Number(li.price) || 0,
      })),
      discountCodes: order.discount_codes?.map((d: any) => d.code) || [],
      isFirstOrder: false, // Would need to check order count
    } : undefined,
    event: {
      type: 'order.paid',
    },
    timestamp: new Date(),
  };
}
