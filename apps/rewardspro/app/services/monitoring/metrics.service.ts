import { db } from '~/db.server';
import { DatadogService } from './datadog.service';
import { Logger } from '../logger.service';

export class MetricsService {
  /**
   * Calculate and report daily business metrics
   * This should be called by a cron job or scheduled function
   */
  static async reportDailyMetrics(shop: string) {
    const startTime = Date.now();

    try {
      // Get all metrics in parallel
      const [
        customerMetrics,
        tierDistribution,
        cashbackMetrics,
        subscriptionMetrics,
        ledgerConsistency,
      ] = await Promise.all([
        this.getCustomerMetrics(shop),
        this.getTierDistribution(shop),
        this.getCashbackMetrics(shop),
        this.getSubscriptionMetrics(shop),
        this.checkLedgerConsistency(shop),
      ]);

      // Report customer metrics
      DatadogService.metrics.gauge('customers.total', customerMetrics.total);
      DatadogService.metrics.gauge('customers.active_30d', customerMetrics.active30Days);
      DatadogService.metrics.gauge('customers.new_today', customerMetrics.newToday);

      // Report tier distribution
      for (const [tierName, count] of Object.entries(tierDistribution)) {
        DatadogService.metrics.gauge(`customers.tier.${tierName.toLowerCase()}`, count);
      }

      // Report cashback metrics
      DatadogService.metrics.gauge('cashback.total_distributed', cashbackMetrics.totalDistributed);
      DatadogService.metrics.gauge('cashback.distributed_today', cashbackMetrics.distributedToday);
      DatadogService.metrics.gauge('cashback.average_amount', cashbackMetrics.averageAmount);

      // Report subscription metrics
      DatadogService.metrics.gauge('subscription.mrr', subscriptionMetrics.mrr);
      DatadogService.metrics.gauge('subscription.active_count', subscriptionMetrics.activeCount);
      DatadogService.metrics.gauge('subscription.churn_rate', subscriptionMetrics.churnRate);

      // Report ledger consistency
      DatadogService.metrics.trackLedgerConsistency(ledgerConsistency.discrepancyCount);

      Logger.info('Daily metrics reported successfully', {
        shop,
        duration: Date.now() - startTime,
        metricsReported: {
          customers: customerMetrics,
          tiers: tierDistribution,
          cashback: cashbackMetrics,
          subscriptions: subscriptionMetrics,
          ledgerDiscrepancies: ledgerConsistency.discrepancyCount,
        },
      });

      return {
        success: true,
        metrics: {
          customerMetrics,
          tierDistribution,
          cashbackMetrics,
          subscriptionMetrics,
          ledgerConsistency,
        },
      };
    } catch (error) {
      Logger.error('Failed to report daily metrics', error as Error, {
        shop,
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Get customer metrics
   */
  private static async getCustomerMetrics(shop: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [total, active30Days, newToday] = await Promise.all([
      // Total customers
      db.customer.count({
        where: { shop },
      }),

      // Active in last 30 days
      db.customer.count({
        where: {
          shop,
          lastActiveAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),

      // New customers today
      db.customer.count({
        where: {
          shop,
          createdAt: {
            gte: todayStart,
          },
        },
      }),
    ]);

    return {
      total,
      active30Days,
      newToday,
    };
  }

  /**
   * Get tier distribution
   */
  private static async getTierDistribution(shop: string) {
    const tiers = await db.tier.findMany({
      where: { shop },
      include: {
        customers: {
          select: { id: true },
        },
      },
    });

    const distribution: Record<string, number> = {};

    for (const tier of tiers) {
      distribution[tier.name] = tier.customers.length;
    }

    // Also count customers without a tier
    const unassignedCount = await db.customer.count({
      where: {
        shop,
        tierId: null,
      },
    });

    if (unassignedCount > 0) {
      distribution['unassigned'] = unassignedCount;
    }

    return distribution;
  }

  /**
   * Get cashback metrics
   */
  private static async getCashbackMetrics(shop: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get all cashback entries
    const cashbackEntries = await db.storeCreditLedger.findMany({
      where: {
        shop,
        entryType: 'CASHBACK_EARNED',
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Calculate metrics
    const totalDistributed = cashbackEntries.reduce((sum, entry) => sum + entry.amount, 0);

    const todayEntries = cashbackEntries.filter(
      (entry) => entry.createdAt >= todayStart
    );

    const distributedToday = todayEntries.reduce((sum, entry) => sum + entry.amount, 0);

    const averageAmount =
      cashbackEntries.length > 0 ? totalDistributed / cashbackEntries.length : 0;

    return {
      totalDistributed,
      distributedToday,
      averageAmount,
      totalTransactions: cashbackEntries.length,
      transactionsToday: todayEntries.length,
    };
  }

  /**
   * Get subscription metrics
   */
  private static async getSubscriptionMetrics(shop: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all subscription records
    const subscriptions = await db.subscription.findMany({
      where: { shop },
      select: {
        status: true,
        monthlyPrice: true,
        cancelledAt: true,
        createdAt: true,
      },
    });

    // Calculate MRR (Monthly Recurring Revenue)
    const activeSubscriptions = subscriptions.filter(sub => sub.status === 'ACTIVE');
    const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.monthlyPrice, 0);

    // Calculate churn rate (subscriptions cancelled this month / active at month start)
    const cancelledThisMonth = subscriptions.filter(
      sub => sub.cancelledAt && sub.cancelledAt >= monthStart
    ).length;

    const activeAtMonthStart = subscriptions.filter(
      sub => sub.createdAt < monthStart && (!sub.cancelledAt || sub.cancelledAt >= monthStart)
    ).length;

    const churnRate = activeAtMonthStart > 0
      ? (cancelledThisMonth / activeAtMonthStart) * 100
      : 0;

    return {
      mrr,
      activeCount: activeSubscriptions.length,
      churnRate,
      cancelledThisMonth,
      totalLifetimeValue: subscriptions.reduce((sum, sub) => sum + sub.monthlyPrice, 0),
    };
  }

  /**
   * Check ledger consistency
   */
  private static async checkLedgerConsistency(shop: string, sampleSize = 100) {
    // Get a sample of customers to check
    const customers = await db.customer.findMany({
      where: { shop },
      take: sampleSize,
      orderBy: { updatedAt: 'desc' }, // Check recently updated customers
      select: {
        id: true,
        storeCreditBalance: true,
      },
    });

    let discrepancyCount = 0;
    const discrepancies: Array<{
      customerId: string;
      expectedBalance: number;
      actualBalance: number;
    }> = [];

    // Check each customer's balance
    for (const customer of customers) {
      // Calculate balance from ledger
      const ledgerEntries = await db.storeCreditLedger.findMany({
        where: { customerId: customer.id },
        select: {
          amount: true,
          entryType: true,
        },
      });

      const calculatedBalance = ledgerEntries.reduce((balance, entry) => {
        // Credits increase balance
        if (['CASHBACK_EARNED', 'REFUND_CREDIT', 'MANUAL_CREDIT'].includes(entry.entryType)) {
          return balance + entry.amount;
        }
        // Debits decrease balance
        if (['ORDER_PAYMENT', 'MANUAL_DEBIT', 'EXPIRED'].includes(entry.entryType)) {
          return balance - entry.amount;
        }
        return balance;
      }, 0);

      // Check for discrepancy (allowing for small floating point differences)
      if (Math.abs(calculatedBalance - customer.storeCreditBalance) > 0.01) {
        discrepancyCount++;
        discrepancies.push({
          customerId: customer.id,
          expectedBalance: calculatedBalance,
          actualBalance: customer.storeCreditBalance,
        });

        // Log each discrepancy
        Logger.business.ledgerDiscrepancy(
          customer.id,
          calculatedBalance,
          customer.storeCreditBalance
        );
      }
    }

    return {
      discrepancyCount,
      discrepancies,
      checkedCount: customers.length,
      discrepancyRate: customers.length > 0
        ? (discrepancyCount / customers.length) * 100
        : 0,
    };
  }

  /**
   * Real-time metric tracking for critical events
   */
  static trackRealTimeEvent(event: string, data: Record<string, any>) {
    // Track the event immediately
    DatadogService.metrics.increment(`realtime.${event}`);

    // Log for audit trail
    Logger.info(`Real-time event: ${event}`, {
      event: `realtime_${event}`,
      ...data,
    });

    // Handle specific event types
    switch (event) {
      case 'high_value_transaction':
        if (data.amount > 1000) {
          DatadogService.metrics.increment('realtime.high_value_transactions');
          Logger.warn('High value transaction detected', {
            ...data,
            alert: true,
          });
        }
        break;

      case 'fraud_detection':
        DatadogService.metrics.increment('security.fraud_attempts');
        Logger.security.suspiciousActivity('Potential fraud detected', data);
        break;

      case 'system_error':
        DatadogService.metrics.increment('system.critical_errors');
        Logger.error('System error occurred', new Error(data.message), {
          ...data,
          critical: true,
        });
        break;
    }
  }

  /**
   * Performance metrics collection
   */
  static async collectPerformanceMetrics() {
    // Get database connection pool stats (if available)
    // Note: Aurora Data API doesn't have connection pools, but we can track query performance

    // Get recent query performance
    const recentQueries = await db.$queryRaw<Array<{ query: string; duration: number }>>`
      SELECT
        query,
        total_time as duration
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY mean_time DESC
      LIMIT 10
    `.catch(() => []); // May not have access to pg_stat_statements

    // Report slow queries
    for (const query of recentQueries) {
      if (query.duration > 100) {
        Logger.performance.slowQuery(query.query, query.duration, 'unknown');
      }
    }

    // Get memory usage
    const memoryUsage = process.memoryUsage();
    DatadogService.metrics.gauge('system.memory.heap_used', memoryUsage.heapUsed);
    DatadogService.metrics.gauge('system.memory.heap_total', memoryUsage.heapTotal);
    DatadogService.metrics.gauge('system.memory.rss', memoryUsage.rss);
    DatadogService.metrics.gauge('system.memory.external', memoryUsage.external);

    return {
      memory: memoryUsage,
      slowQueries: recentQueries,
    };
  }
}

// Export a singleton instance
export const metrics = MetricsService;