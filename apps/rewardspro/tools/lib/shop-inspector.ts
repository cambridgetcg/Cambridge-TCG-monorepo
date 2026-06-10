/**
 * Shop State Inspector
 *
 * Query and visualize the current state of a shop's data.
 * Essential for debugging and understanding shop state without Shopify Admin UI.
 *
 * Features:
 * - Overview of shop configuration and counts
 * - Customer data inspection with tier and credit details
 * - Order history and statistics
 * - Billing status and usage tracking
 * - Points system configuration and transactions
 * - Webhook processing history
 */

import { getDb, disconnectDb, checkDbConnection } from './db.js';
import { assertValidShopDomain } from './validation.js';

type DbClient = ReturnType<typeof getDb>;

// ============================================
// TYPES
// ============================================

export type InspectionSection =
  | 'overview'
  | 'customers'
  | 'orders'
  | 'tiers'
  | 'billing'
  | 'points'
  | 'sessions'
  | 'webhooks'
  | 'credits';

/** Array of all supported inspection sections */
export const INSPECTION_SECTIONS: InspectionSection[] = [
  'overview',
  'customers',
  'orders',
  'tiers',
  'billing',
  'points',
  'sessions',
  'webhooks',
  'credits',
];

export interface ShopInspectorConfig {
  /** Data API Prisma client instance (alternative to default) */
  db?: DbClient;
  /** Enable verbose logging */
  verbose?: boolean;
}

export interface InspectionOptions {
  shop: string;
  sections?: InspectionSection[];
  customerId?: string;
  orderId?: string;
  verbose?: boolean;
  limit?: number;
}

export interface ShopInspectionResult {
  shop: string;
  inspectedAt: string;
  /** Alias for inspectedAt */
  timestamp: string;
  durationMs: number;
  sections: Record<string, unknown>;
  errors?: string[];
  // Flattened section results for easier CLI access
  overview?: {
    totalCustomers: number;
    totalOrders: number;
    totalTiers: number;
    hasSettings: boolean;
    hasPointsConfig: boolean;
  };
  customers?: {
    total: number;
    records: Array<{
      shopifyCustomerId: string;
      email?: string;
      totalPointsEarned?: number;
      storeCreditBalance?: number;
      currentTier?: string;
    }>;
  };
  orders?: {
    total: number;
    records: Array<{
      shopifyOrderId: string;
      orderNumber?: number;
      financialStatus?: string;
      totalPrice?: number;
      pointsEarned?: number;
    }>;
  };
  tiers?: {
    total: number;
    records: Array<{
      name: string;
      level?: number;
      pointsMultiplier?: number;
      subscriberCount?: number;
    }>;
  };
  points?: {
    totalEarned: number;
    totalRedeemed: number;
    totalExpired: number;
  };
  sessions?: {
    total: number;
    records: Array<{
      id: string;
      scope?: string;
      isOnline: boolean;
      expires?: string;
    }>;
  };
}

export interface InspectionSummary {
  shop: string;
  configured: boolean;
  health: 'healthy' | 'warning' | 'error';
  /** Alias for health === 'healthy' */
  healthy: boolean;
  issues: string[];
  stats: {
    customers: number;
    orders: number;
    tiers: number;
    monthlyOrders: number;
  };
  /** Alias for stats.customers */
  customerCount: number;
  /** Alias for stats.orders */
  orderCount: number;
  /** Active session count */
  activeSessionCount: number;
}

// ============================================
// SHOP INSPECTOR CLASS
// ============================================

export class ShopInspector {
  private db: DbClient;
  private verbose: boolean;
  private ownsConnection: boolean;

  constructor(configOrDb: ShopInspectorConfig | DbClient) {
    if (configOrDb && typeof configOrDb === 'object' && ('db' in configOrDb || 'verbose' in configOrDb)) {
      const config = configOrDb as ShopInspectorConfig;
      this.verbose = config.verbose || false;

      if (config.db) {
        this.db = config.db;
        this.ownsConnection = false;
      } else {
        this.db = getDb({ verbose: this.verbose });
        this.ownsConnection = true;
      }
    } else if (configOrDb && typeof configOrDb === 'object') {
      // Direct DbClient instance
      this.db = configOrDb as DbClient;
      this.verbose = false;
      this.ownsConnection = false;
    } else {
      throw new Error(
        '[ShopInspector] Invalid config: provide either a DbClient instance or a config object'
      );
    }
  }

  /**
   * Disconnect from database if we own the connection
   */
  async disconnect(): Promise<void> {
    if (this.ownsConnection) {
      await disconnectDb();
    }
  }

  /**
   * Check database connectivity
   */
  async checkConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
    return checkDbConnection(this.db);
  }

  /**
   * Comprehensive shop inspection
   */
  async inspect(options: InspectionOptions): Promise<ShopInspectionResult> {
    // Validate shop domain
    const shop = assertValidShopDomain(options.shop);

    const startTime = Date.now();
    const sections = options.sections || ['overview'];
    const result: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const section of sections) {
      try {
        result[section] = await this.inspectSection(section, options);
      } catch (error: any) {
        errors.push(`Failed to inspect ${section}: ${error.message}`);
        result[section] = { error: error.message };
      }
    }

    const now = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    // Build flattened result for CLI
    const flattened: Partial<ShopInspectionResult> = {};

    // Flatten overview
    if (result.overview && typeof result.overview === 'object') {
      const ov = result.overview as any;
      flattened.overview = {
        totalCustomers: ov.counts?.customers || 0,
        totalOrders: ov.counts?.orders || 0,
        totalTiers: ov.counts?.tiers || 0,
        hasSettings: ov.configured || false,
        hasPointsConfig: ov.pointsConfig?.enabled || false,
      };
    }

    // Flatten customers
    if (result.customers && typeof result.customers === 'object') {
      const cust = result.customers as any;
      flattened.customers = {
        total: cust.totalCustomers || 0,
        records: (cust.topCustomers || []).map((c: any) => ({
          shopifyCustomerId: c.shopifyId || c.id,
          email: c.email,
          totalPointsEarned: c.pointsBalance,
          storeCreditBalance: parseFloat(c.storeCredit) || 0,
          currentTier: c.tier,
        })),
      };
    }

    // Flatten orders
    if (result.orders && typeof result.orders === 'object') {
      const ord = result.orders as any;
      flattened.orders = {
        total: ord.totalOrders || 0,
        records: (ord.recentOrders || []).map((o: any) => ({
          shopifyOrderId: o.shopifyId || o.id,
          orderNumber: o.number,
          financialStatus: o.status,
          totalPrice: parseFloat(o.total) || 0,
          pointsEarned: 0, // Would need to look up from points ledger
        })),
      };
    }

    // Flatten tiers
    if (result.tiers && typeof result.tiers === 'object') {
      const tier = result.tiers as any;
      flattened.tiers = {
        total: tier.totalTiers || 0,
        records: (tier.tiers || []).map((t: any) => ({
          name: t.name,
          level: t.level,
          pointsMultiplier: parseFloat(t.pointsMultiplier) || 1,
          subscriberCount: t.customerCount || 0,
        })),
      };
    }

    // Flatten points
    if (result.points && typeof result.points === 'object') {
      const pts = result.points as any;
      flattened.points = {
        totalEarned: pts.stats?.totalPointsIssued || 0,
        totalRedeemed: 0, // Would need additional query
        totalExpired: 0, // Would need additional query
      };
    }

    // Flatten sessions
    if (result.sessions && typeof result.sessions === 'object') {
      const sess = result.sessions as any;
      flattened.sessions = {
        total: sess.totalSessions || 0,
        records: (sess.sessions || []).map((s: any) => ({
          id: s.id,
          scope: s.scope,
          isOnline: s.isOnline,
          expires: s.expires,
        })),
      };
    }

    return {
      shop: options.shop,
      inspectedAt: now,
      timestamp: now,
      durationMs,
      sections: result,
      errors: errors.length > 0 ? errors : undefined,
      ...flattened,
    };
  }

  /**
   * Quick health check for shop
   */
  async healthCheck(shopDomain: string): Promise<InspectionSummary> {
    // Validate shop domain
    const shop = assertValidShopDomain(shopDomain);

    const issues: string[] = [];

    // Get basic counts
    const [settings, customerCount, orderCount, tierCount, billing, monthlyUsage, activeSessions] = await Promise.all([
      this.db.shopSettings.findUnique({ where: { shop } }).catch(() => null),
      this.db.customer.count({ where: { shop } }).catch(() => 0),
      this.db.order.count({ where: { shop } }).catch(() => 0),
      this.db.tier.count({ where: { shop } }).catch(() => 0),
      this.db.billingSubscription.findUnique({ where: { shop } }).catch(() => null),
      this.getMonthlyOrderCount(shop),
      this.db.session.count({
        where: { shop, expires: { gt: new Date() } },
      }).catch(() => 0),
    ]);

    // Check for issues
    if (!settings) {
      issues.push('Shop settings not configured');
    }
    if (tierCount === 0) {
      issues.push('No tiers configured');
    }
    if (!billing || billing.subscriptionStatus !== 'ACTIVE') {
      issues.push('No active billing subscription');
    }

    // Determine health status
    let health: 'healthy' | 'warning' | 'error' = 'healthy';
    if (issues.length > 0 && issues.length < 2) {
      health = 'warning';
    } else if (issues.length >= 2) {
      health = 'error';
    }

    return {
      shop,
      configured: !!settings,
      health,
      healthy: health === 'healthy',
      issues,
      stats: {
        customers: customerCount,
        orders: orderCount,
        tiers: tierCount,
        monthlyOrders: monthlyUsage,
      },
      customerCount,
      orderCount,
      activeSessionCount: activeSessions,
    };
  }

  private async inspectSection(section: InspectionSection, options: InspectionOptions): Promise<unknown> {
    const { shop, customerId, orderId, verbose, limit = 20 } = options;

    switch (section) {
      case 'overview':
        return this.getOverview(shop);
      case 'customers':
        return customerId ? this.getCustomerDetail(shop, customerId) : this.getCustomers(shop, limit, verbose);
      case 'orders':
        return orderId ? this.getOrderDetail(shop, orderId) : this.getOrders(shop, limit, verbose);
      case 'tiers':
        return this.getTiers(shop);
      case 'billing':
        return this.getBilling(shop);
      case 'points':
        return this.getPoints(shop, customerId, limit);
      case 'credits':
        return this.getCredits(shop, customerId, limit);
      case 'sessions':
        return this.getSessions(shop);
      case 'webhooks':
        return this.getWebhooks(shop, limit);
      default:
        return { error: `Unknown section: ${section}` };
    }
  }

  // ============================================
  // SECTION INSPECTORS
  // ============================================

  /**
   * Quick overview of shop state
   */
  private async getOverview(shop: string) {
    const [settings, customerCount, orderCount, tierCount, billing, recentOrders, entitlements] =
      await Promise.all([
        this.db.shopSettings.findUnique({ where: { shop } }),
        this.db.customer.count({ where: { shop } }),
        this.db.order.count({ where: { shop } }),
        this.db.tier.count({ where: { shop } }),
        this.db.billingSubscription.findUnique({ where: { shop } }),
        this.db.order.findMany({
          where: { shop },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, shopifyOrderNumber: true, totalPrice: true, createdAt: true, financialStatus: true },
        }),
        this.db.shopEntitlements.findUnique({ where: { shop } }),
      ]);

    const monthlyOrders = await this.getMonthlyOrderCount(shop);

    return {
      configured: !!settings,
      storeCurrency: settings?.storeCurrency || 'Not set',
      currencyDisplayType: settings?.currencyDisplayType || 'Not set',
      counts: {
        customers: customerCount,
        orders: orderCount,
        tiers: tierCount,
        ordersThisMonth: monthlyOrders,
      },
      billing: billing
        ? {
            plan: billing.planType,
            status: billing.subscriptionStatus,
            currentPeriodEnd: billing.currentPeriodEnd,
          }
        : { status: 'Not subscribed' },
      entitlements: entitlements
        ? {
            maxTiers: entitlements.limitMaxTiers,
            maxOrders: entitlements.limitMaxOrders,
            effectivePlan: entitlements.effectivePlan,
          }
        : null,
      recentOrders: recentOrders.map((o: any) => ({
        id: o.id,
        number: o.shopifyOrderNumber,
        total: o.totalPrice,
        status: o.financialStatus,
        date: o.createdAt,
      })),
    };
  }

  /**
   * Customer list with summary
   */
  private async getCustomers(shop: string, limit: number, verbose?: boolean) {
    const customers = await this.db.customer.findMany({
      where: { shop },
      orderBy: { totalSpent: 'desc' },
      take: limit,
      include: {
        currentTier: { select: { id: true, name: true } },
      },
    });

    const tierDistribution = await this.db.customer.groupBy({
      by: ['currentTierId'],
      where: { shop },
      _count: true,
    });

    const totalCustomers = await this.db.customer.count({ where: { shop } });

    // Get tier names for distribution
    const tierIds = tierDistribution.map((t: any) => t.currentTierId).filter(Boolean);
    const tiers = tierIds.length
      ? await this.db.tier.findMany({
          where: { id: { in: tierIds } },
          select: { id: true, name: true },
        })
      : [];

    const tierMap = new Map(tiers.map((t: any) => [t.id, t.name]));

    return {
      totalCustomers,
      showing: customers.length,
      topCustomers: customers.map((c: any) => ({
        id: c.id,
        shopifyId: c.shopifyCustomerId,
        email: c.email,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'N/A',
        totalSpent: Number(c.totalSpent).toFixed(2),
        orderCount: c.orderCount,
        tier: c.currentTier?.name || 'None',
        storeCredit: Number(c.storeCredit || 0).toFixed(2),
        pointsBalance: c.pointsBalance || 0,
        ...(verbose && {
          createdAt: c.createdAt,
          lastOrderDate: c.lastOrderDate,
          metadata: c.metadata,
        }),
      })),
      tierDistribution: tierDistribution.map((t: any) => ({
        tier: t.currentTierId ? tierMap.get(t.currentTierId) || 'Unknown' : 'No Tier',
        count: t._count,
      })),
    };
  }

  /**
   * Single customer deep dive
   */
  private async getCustomerDetail(shop: string, customerId: string) {
    // Find by either internal ID or Shopify ID
    const customer = await this.db.customer.findFirst({
      where: {
        shop,
        OR: [{ id: customerId }, { shopifyCustomerId: customerId }, { shopifyCustomerId: `gid://shopify/Customer/${customerId}` }],
      },
      include: {
        currentTier: true,
      },
    });

    if (!customer) {
      return { error: 'Customer not found', searchedFor: customerId };
    }

    const [creditLedger, pointsLedger, tierHistory, orders] = await Promise.all([
      this.db.storeCreditLedger.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.db.pointsLedger.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.db.tierChangeLog.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          fromTierName: true,
          toTierName: true,
          changeType: true,
          triggerType: true,
          createdAt: true,
        },
      }),
      this.db.order.findMany({
        where: { customerId: customer.id, shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          shopifyOrderNumber: true,
          totalPrice: true,
          financialStatus: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      customer: {
        id: customer.id,
        shopifyId: customer.shopifyCustomerId,
        email: customer.email,
        name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
        totalSpent: Number(customer.totalSpent).toFixed(2),
        orderCount: customer.orderCount,
        storeCredit: Number(customer.storeCredit || 0).toFixed(2),
        pointsBalance: customer.pointsBalance || 0,
        currentTier: customer.currentTier?.name || 'None',
        createdAt: customer.createdAt,
        lastOrderDate: customer.lastOrderDate,
      },
      recentOrders: orders,
      recentCreditTransactions: creditLedger.map((l: any) => ({
        id: l.id,
        type: l.type,
        amount: Number(l.amount).toFixed(2),
        balance: Number(l.balanceAfter).toFixed(2),
        description: l.description,
        date: l.createdAt,
      })),
      recentPointsTransactions: pointsLedger.map((l: any) => ({
        id: l.id,
        type: l.type,
        amount: l.amount,
        balance: l.balance,
        description: l.description,
        date: l.createdAt,
        expiresAt: l.expiresAt,
      })),
      tierHistory: tierHistory.map((t: any) => ({
        from: t.fromTierName || 'None',
        to: t.toTierName || 'None',
        reason: t.changeType,
        trigger: t.triggerType,
        date: t.createdAt,
      })),
    };
  }

  /**
   * Order list with statistics
   */
  private async getOrders(shop: string, limit: number, verbose?: boolean) {
    const orders = await this.db.order.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { lineItems: true, refunds: true } },
      },
    });

    const stats = await this.db.order.aggregate({
      where: { shop },
      _count: true,
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
    });

    const monthlyOrders = await this.getMonthlyOrderCount(shop);

    return {
      totalOrders: stats._count,
      totalRevenue: Number(stats._sum?.totalPrice || 0).toFixed(2),
      averageOrderValue: Number(stats._avg?.totalPrice || 0).toFixed(2),
      ordersThisMonth: monthlyOrders,
      recentOrders: orders.map((o: any) => ({
        id: o.id,
        shopifyId: o.shopifyOrderId,
        number: o.orderNumber,
        total: Number(o.total).toFixed(2),
        status: o.status,
        lineItems: o._count.lineItems,
        refunds: o._count.refunds,
        date: o.createdAt,
        ...(verbose && {
          customerId: o.shopifyCustomerId,
          metadata: o.metadata,
        }),
      })),
    };
  }

  /**
   * Single order detail
   */
  private async getOrderDetail(shop: string, orderId: string) {
    const order = await this.db.order.findFirst({
      where: {
        shop,
        OR: [{ id: orderId }, { shopifyOrderId: orderId }, { shopifyOrderId: `gid://shopify/Order/${orderId}` }],
      },
      include: {
        lineItems: true,
        refunds: {
          include: {
            refundLineItems: true,
          },
        },
      },
    });

    if (!order) {
      return { error: 'Order not found', searchedFor: orderId };
    }

    // Get related credit/points transactions
    const [creditTransactions, pointsTransactions] = await Promise.all([
      this.db.storeCreditLedger.findMany({
        where: { orderId: order.id },
      }),
      this.db.pointsLedger.findMany({
        where: { orderId: order.id },
      }),
    ]);

    return {
      order: {
        id: order.id,
        shopifyId: order.shopifyOrderId,
        number: order.shopifyOrderNumber,
        total: Number(order.totalPrice).toFixed(2),
        status: order.financialStatus,
        customerId: order.customerId,
        createdAt: order.createdAt,
      },
      lineItems: order.lineItems.map((li: any) => ({
        id: li.id,
        title: li.title,
        quantity: li.quantity,
        price: Number(li.price).toFixed(2),
      })),
      refunds: order.refunds.map((r: any) => ({
        id: r.id,
        amount: Number(r.amount).toFixed(2),
        reason: r.reason,
        createdAt: r.createdAt,
        lineItems: r.refundLineItems.length,
      })),
      relatedTransactions: {
        credits: creditTransactions.map((t: any) => ({
          type: t.type,
          amount: Number(t.amount).toFixed(2),
        })),
        points: pointsTransactions.map((t: any) => ({
          type: t.type,
          amount: t.amount,
        })),
      },
    };
  }

  /**
   * Tier configuration
   */
  private async getTiers(shop: string) {
    const tiers = await this.db.tier.findMany({
      where: { shop },
      orderBy: { minSpend: 'asc' },
      include: {
        _count: { select: { customers: true, tierProducts: true } },
      },
    });

    return {
      totalTiers: tiers.length,
      tiers: tiers.map((t: any) => ({
        id: t.id,
        name: t.name,
        minSpend: Number(t.minSpend).toFixed(2),
        maxSpend: t.maxSpend ? Number(t.maxSpend).toFixed(2) : 'Unlimited',
        cashbackRate: `${Number(t.cashbackRate)}%`,
        pointsMultiplier: `${Number(t.pointsMultiplier)}x`,
        pointsLuckBonus: t.pointsLuckBonus ? `+${Number(t.pointsLuckBonus)}%` : 'None',
        customerCount: t._count.customers,
        productCount: t._count.tierProducts,
        isDefault: t.isDefault,
        color: t.color,
        evaluationPeriod: t.evaluationPeriod,
      })),
    };
  }

  /**
   * Billing status
   */
  private async getBilling(shop: string) {
    const [subscription, appSubscription, usageRecords, monthlyUsage, billingHistory] = await Promise.all([
      this.db.billingSubscription.findUnique({ where: { shop } }),
      this.db.appSubscription.findFirst({
        where: { shop },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.usageRecord.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.db.monthlyOrderUsage.findFirst({
        where: {
          shop,
          year: new Date().getFullYear(),
          month: new Date().getMonth() + 1,
        },
      }),
      this.db.billingHistory.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      subscription: subscription
        ? {
            plan: subscription.planType,
            status: subscription.subscriptionStatus,
            currentPeriodEnd: subscription.currentPeriodEnd,
            trialEndsAt: subscription.trialEndsAt,
          }
        : null,
      appSubscription: appSubscription
        ? {
            shopifyId: appSubscription.shopifySubscriptionId,
            status: appSubscription.status,
            createdAt: appSubscription.createdAt,
          }
        : null,
      currentMonthUsage: {
        orders: monthlyUsage?.orderCount || 0,
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
      },
      recentUsageRecords: usageRecords.map((r: any) => ({
        quantity: r.quantity,
        description: r.description,
        date: r.createdAt,
      })),
      billingHistory: billingHistory.map((h: any) => ({
        event: h.event,
        amount: h.amount ? Number(h.amount).toFixed(2) : null,
        date: h.createdAt,
      })),
    };
  }

  /**
   * Points system status
   */
  private async getPoints(shop: string, customerId?: string, limit: number = 20) {
    const config = await this.db.pointsConfig.findUnique({ where: { shop } });

    if (!config) {
      return { enabled: false, message: 'Points system not configured' };
    }

    const whereClause = customerId ? { shop, customerId } : { shop };

    const [stats, recentTransactions] = await Promise.all([
      this.db.pointsLedger.aggregate({
        where: { shop, amount: { gt: 0 } },
        _sum: { amount: true },
        _count: true,
      }),
      this.db.pointsLedger.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          customer: { select: { email: true } },
        },
      }),
    ]);

    // Get expiring points (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringPoints = config.pointsExpire
      ? await this.db.pointsLedger.aggregate({
          where: {
            shop,
            expiresAt: { lte: thirtyDaysFromNow, gt: new Date() },
            amount: { gt: 0 },
          },
          _sum: { amount: true },
        })
      : null;

    return {
      enabled: config.isEnabled,
      config: {
        pointsPerDollar: config.pointsPerDollar,
        pointsExpire: config.pointsExpire,
        expirationDays: config.expirationDays,
        currencyName: config.currencyName,
        currencyPlural: config.currencyNamePlural,
        currencyIcon: config.currencyIcon,
        roundingMode: config.roundingMode,
      },
      stats: {
        totalPointsIssued: stats._sum.amount || 0,
        totalTransactions: stats._count,
        pointsExpiringIn30Days: expiringPoints?._sum.amount || 0,
      },
      recentTransactions: recentTransactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balance: t.balance,
        description: t.description,
        customerEmail: t.customer?.email,
        date: t.createdAt,
        expiresAt: t.expiresAt,
      })),
    };
  }

  /**
   * Store credits status
   */
  private async getCredits(shop: string, customerId?: string, limit: number = 20) {
    const whereClause = customerId ? { shop, customerId } : { shop };

    const [stats, recentTransactions] = await Promise.all([
      this.db.storeCreditLedger.aggregate({
        where: { shop },
        _sum: { amount: true },
        _count: true,
      }),
      this.db.storeCreditLedger.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          customer: { select: { email: true } },
        },
      }),
    ]);

    // Get total outstanding credit
    const totalOutstanding = await this.db.customer.aggregate({
      where: { shop, storeCredit: { gt: 0 } },
      _sum: { storeCredit: true },
      _count: true,
    });

    return {
      stats: {
        totalTransactions: stats._count,
        netCreditIssued: Number(stats._sum.amount || 0).toFixed(2),
        totalOutstandingCredit: Number(totalOutstanding._sum.storeCredit || 0).toFixed(2),
        customersWithCredit: totalOutstanding._count,
      },
      recentTransactions: recentTransactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount).toFixed(2),
        balanceAfter: Number(t.balanceAfter).toFixed(2),
        description: t.description,
        customerEmail: t.customer?.email,
        date: t.createdAt,
      })),
    };
  }

  /**
   * Session status
   */
  private async getSessions(shop: string) {
    const sessions = await this.db.session.findMany({
      where: { shop },
      orderBy: { expires: 'desc' },
    });

    const now = new Date();
    const activeSessions = sessions.filter((s: any) => s.expires && new Date(s.expires) > now);

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      expiredSessions: sessions.length - activeSessions.length,
      sessions: sessions.slice(0, 10).map((s: any) => ({
        id: s.id,
        isOnline: s.isOnline,
        scope: s.scope,
        expires: s.expires,
        isActive: s.expires && new Date(s.expires) > now,
      })),
    };
  }

  /**
   * Webhook processing status
   */
  private async getWebhooks(shop: string, limit: number = 20) {
    const [processed, errors, deadLetter] = await Promise.all([
      this.db.webhookProcessed.findMany({
        where: { shop },
        orderBy: { processedAt: 'desc' },
        take: limit,
      }),
      this.db.webhookError.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.db.deadLetterQueue.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    // Get counts by topic
    const topicCounts = await (this.db.webhookProcessed.groupBy as any)({
      by: ['topic'],
      where: { shop },
      _count: true,
      orderBy: { _count: { topic: 'desc' } },
    });

    return {
      recentProcessed: processed.map((w: any) => ({
        topic: w.topic,
        webhookId: w.webhookId,
        processedAt: w.processedAt,
      })),
      topicDistribution: topicCounts.map((t: any) => ({
        topic: t.topic,
        count: t._count,
      })),
      recentErrors: errors.map((e: any) => ({
        topic: e.topic,
        error: e.error,
        webhookId: e.webhookId,
        createdAt: e.createdAt,
      })),
      deadLetterQueue: {
        count: deadLetter.length,
        items: deadLetter.map((d: any) => ({
          id: d.id,
          topic: d.topic,
          attempts: d.attempts,
          lastError: d.lastError,
          createdAt: d.createdAt,
        })),
      },
    };
  }

  // ============================================
  // HELPERS
  // ============================================

  private async getMonthlyOrderCount(shop: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return this.db.order.count({
      where: {
        shop,
        createdAt: { gte: startOfMonth },
      },
    });
  }
}

/**
 * Create inspector instance with database connection
 */
export function createInspector(db: DbClient): ShopInspector {
  return new ShopInspector(db);
}

/**
 * Factory function to create a ShopInspector instance
 * Alias for createInspector with config support
 */
export function createShopInspector(config: ShopInspectorConfig): ShopInspector {
  return new ShopInspector(config);
}

// Re-export db utilities for convenience
export { getDb, disconnectDb, checkDbConnection } from './db.js';
