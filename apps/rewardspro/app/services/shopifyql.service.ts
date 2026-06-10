/**
 * ShopifyQL Service
 *
 * Uses Shopify's native shopifyqlQuery API to fetch order/sales data directly from Shopify,
 * reducing load on our Aurora database.
 *
 * Benefits:
 * - Offloads heavy aggregations (order counts, revenue) to Shopify's infrastructure
 * - Reduces Aurora DB queries
 * - Faster response times for native Shopify data
 *
 * Limitations:
 * - Requires `read_reports` scope (Level 2 customer data approval)
 * - Eventually consistent (updated hourly)
 * - Caps at 10K rows per query
 * - No JOIN to custom tables (RewardsPro data still from Aurora)
 * - Subject to 2 calls/sec GraphQL throttle
 *
 * @see https://shopify.dev/docs/api/admin-graphql/latest/queries/shopifyqlquery
 */

type AdminClient = { graphql: (...args: any[]) => Promise<any> };

// ============================================
// CUSTOM ERRORS
// ============================================

/**
 * Thrown when ShopifyQL is not available for this shop
 * (requires Shopify Plus, beta access, or specific API scopes)
 */
export class ShopifyQLUnavailableError extends Error {
  constructor(message: string = "ShopifyQL is not available for this shop") {
    super(message);
    this.name = "ShopifyQLUnavailableError";
  }
}

// ============================================
// TYPES
// ============================================

export interface ShopifyQLColumn {
  name: string;
  dataType: string;
  displayName: string;
}

export interface ShopifyQLTableData {
  columns: ShopifyQLColumn[];
  rows: Record<string, any>[];
}

export interface ShopifyQLResponse {
  tableData: ShopifyQLTableData | null;
  parseErrors: string[];
}

export interface OrderCountResult {
  count: number;
  source: 'shopifyql' | 'cache';
  cachedAt?: Date;
}

export interface RevenueResult {
  totalRevenue: number;
  averageOrderValue: number;
  orderCount: number;
  source: 'shopifyql' | 'cache';
  cachedAt?: Date;
}

export interface MonthlyTrendData {
  month: string;
  orderCount: number;
  totalRevenue: number;
  source: 'shopifyql' | 'cache';
}

// ============================================
// IN-MEMORY CACHE
// ============================================

interface CacheEntry<T> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
}

class ShopifyQLCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  set<T>(key: string, data: T, ttlMinutes: number = 10): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt,
    });

    console.log(`[ShopifyQL] Cached ${key} (TTL: ${ttlMinutes}m)`);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      console.log(`[ShopifyQL] Cache expired for ${key}`);
      this.cache.delete(key);
      return null;
    }

    console.log(`[ShopifyQL] Cache hit for ${key}`);
    return entry.data as T;
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
      console.log(`[ShopifyQL] Cleared cache for ${key}`);
    } else {
      this.cache.clear();
      console.log(`[ShopifyQL] Cleared all cache`);
    }
  }

  getCachedAt(key: string): Date | null {
    const entry = this.cache.get(key);
    return entry?.cachedAt || null;
  }
}

// Singleton cache instance
const cache = new ShopifyQLCache();

// ============================================
// CORE QUERY FUNCTION
// ============================================

/**
 * Execute a raw ShopifyQL query
 */
export async function executeShopifyQLQuery(
  admin: AdminClient,
  query: string
): Promise<ShopifyQLResponse> {
  try {
    console.log(`[ShopifyQL] Executing query: ${query}`);

    const response = await admin.graphql(`#graphql
      query {
        shopifyqlQuery(query: "${query.replace(/"/g, '\\"')}") {
          tableData {
            columns {
              name
              dataType
              displayName
            }
            rows
          }
          parseErrors
        }
      }
    `);

    const result = await response.json();

    if (result.errors) {
      // Check if this is a "field doesn't exist" error (ShopifyQL not available)
      const fieldError = result.errors.find((err: any) =>
        err.message?.includes("Field 'shopifyqlQuery' doesn't exist") ||
        err.message?.includes("shopifyqlQuery") && err.message?.includes("doesn't exist")
      );

      if (fieldError) {
        // ShopifyQL is not available for this shop (needs Plus/beta/scope)
        // Throw specific error so calling code can handle gracefully
        throw new ShopifyQLUnavailableError(
          "ShopifyQL API is not available (requires Shopify Plus, beta access, or read_shopifyql_api scope)"
        );
      }

      console.error('[ShopifyQL] GraphQL errors:', result.errors);
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    const shopifyqlData = result.data?.shopifyqlQuery;

    if (!shopifyqlData) {
      throw new Error('No shopifyqlQuery data in response');
    }

    if (shopifyqlData.parseErrors && shopifyqlData.parseErrors.length > 0) {
      console.error('[ShopifyQL] Parse errors:', shopifyqlData.parseErrors);
      throw new Error(`ShopifyQL parse errors: ${shopifyqlData.parseErrors.join(', ')}`);
    }

    console.log(`[ShopifyQL] Query successful, rows: ${shopifyqlData.tableData?.rows?.length || 0}`);

    return shopifyqlData;

  } catch (error) {
    console.error('[ShopifyQL] Query failed:', error);
    throw error;
  }
}

// ============================================
// ORDER COUNT QUERIES
// ============================================

/**
 * Get order count for current month using ShopifyQL
 *
 * @param admin - Shopify admin API context
 * @param useCacheIfAvailable - Use cached result if fresh (default: true)
 * @param cacheTTL - Cache time-to-live in minutes (default: 10)
 */
export async function getMonthlyOrderCount(
  admin: AdminClient,
  useCacheIfAvailable: boolean = true,
  cacheTTL: number = 10
): Promise<OrderCountResult> {
  const cacheKey = 'monthly_order_count';

  // Check cache first
  if (useCacheIfAvailable) {
    const cached = cache.get<OrderCountResult>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Query ShopifyQL for current month orders
    const query = 'FROM orders SHOW count() SINCE -1m';
    const result = await executeShopifyQLQuery(admin, query);

    if (!result.tableData || !result.tableData.rows || result.tableData.rows.length === 0) {
      throw new Error('No data returned from ShopifyQL');
    }

    // Parse count from first row
    const firstRow = result.tableData.rows[0];
    const count = parseInt(firstRow.count || firstRow['count()'] || '0', 10);

    const orderCountResult: OrderCountResult = {
      count,
      source: 'shopifyql',
      cachedAt: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, orderCountResult, cacheTTL);

    console.log(`[ShopifyQL] Monthly order count: ${count}`);

    return orderCountResult;

  } catch (error) {
    console.error('[ShopifyQL] Failed to get monthly order count:', error);
    throw error;
  }
}

/**
 * Get order count for a specific date range
 */
export async function getOrderCountForPeriod(
  admin: AdminClient,
  sinceClause: string, // e.g., "-7d", "-1m", "-3m"
  useCacheIfAvailable: boolean = true,
  cacheTTL: number = 15
): Promise<OrderCountResult> {
  const cacheKey = `order_count_${sinceClause}`;

  // Check cache first
  if (useCacheIfAvailable) {
    const cached = cache.get<OrderCountResult>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const query = `FROM orders SHOW count() SINCE ${sinceClause}`;
    const result = await executeShopifyQLQuery(admin, query);

    if (!result.tableData || !result.tableData.rows || result.tableData.rows.length === 0) {
      throw new Error('No data returned from ShopifyQL');
    }

    const firstRow = result.tableData.rows[0];
    const count = parseInt(firstRow.count || firstRow['count()'] || '0', 10);

    const orderCountResult: OrderCountResult = {
      count,
      source: 'shopifyql',
      cachedAt: new Date(),
    };

    cache.set(cacheKey, orderCountResult, cacheTTL);

    return orderCountResult;

  } catch (error) {
    console.error(`[ShopifyQL] Failed to get order count for ${sinceClause}:`, error);
    throw error;
  }
}

// ============================================
// REVENUE QUERIES
// ============================================

/**
 * Get revenue metrics for current month
 */
export async function getMonthlyRevenue(
  admin: AdminClient,
  useCacheIfAvailable: boolean = true,
  cacheTTL: number = 10
): Promise<RevenueResult> {
  const cacheKey = 'monthly_revenue';

  // Check cache first
  if (useCacheIfAvailable) {
    const cached = cache.get<RevenueResult>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Query for total sales and order count
    const query = 'FROM sales SHOW total_sales, count() SINCE -1m';
    const result = await executeShopifyQLQuery(admin, query);

    if (!result.tableData || !result.tableData.rows || result.tableData.rows.length === 0) {
      throw new Error('No data returned from ShopifyQL');
    }

    const firstRow = result.tableData.rows[0];
    const totalRevenue = parseFloat(firstRow.total_sales || '0');
    const orderCount = parseInt(firstRow.count || firstRow['count()'] || '0', 10);
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    const revenueResult: RevenueResult = {
      totalRevenue,
      averageOrderValue,
      orderCount,
      source: 'shopifyql',
      cachedAt: new Date(),
    };

    cache.set(cacheKey, revenueResult, cacheTTL);

    console.log(`[ShopifyQL] Monthly revenue: $${totalRevenue.toFixed(2)}, AOV: $${averageOrderValue.toFixed(2)}`);

    return revenueResult;

  } catch (error) {
    console.error('[ShopifyQL] Failed to get monthly revenue:', error);
    throw error;
  }
}

// ============================================
// TREND QUERIES
// ============================================

/**
 * Get monthly order and revenue trends
 */
export async function getMonthlyTrends(
  admin: AdminClient,
  months: number = 3,
  useCacheIfAvailable: boolean = true,
  cacheTTL: number = 30
): Promise<MonthlyTrendData[]> {
  const cacheKey = `monthly_trends_${months}m`;

  // Check cache first
  if (useCacheIfAvailable) {
    const cached = cache.get<MonthlyTrendData[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Query for monthly breakdown
    const query = `FROM sales SHOW month, count(), total_sales GROUP BY month SINCE -${months}m ORDER BY month`;
    const result = await executeShopifyQLQuery(admin, query);

    if (!result.tableData || !result.tableData.rows || result.tableData.rows.length === 0) {
      console.warn('[ShopifyQL] No trend data returned');
      return [];
    }

    const trends: MonthlyTrendData[] = result.tableData.rows.map(row => ({
      month: row.month,
      orderCount: parseInt(row.count || row['count()'] || '0', 10),
      totalRevenue: parseFloat(row.total_sales || '0'),
      source: 'shopifyql' as const,
    }));

    cache.set(cacheKey, trends, cacheTTL);

    console.log(`[ShopifyQL] Retrieved ${trends.length} months of trend data`);

    return trends;

  } catch (error) {
    console.error('[ShopifyQL] Failed to get monthly trends:', error);
    throw error;
  }
}

// ============================================
// DASHBOARD METRICS QUERIES
// ============================================

export interface DashboardMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  conversionRate: number; // orders per customer
  source: 'shopifyql' | 'cache';
  cachedAt?: Date;
}

/**
 * Get comprehensive dashboard metrics in one query
 * Combines revenue, orders, and customer data for dashboard cards
 */
export async function getDashboardMetrics(
  admin: AdminClient,
  sinceClause: string = '-1m',
  useCacheIfAvailable: boolean = true,
  cacheTTL: number = 10
): Promise<DashboardMetrics> {
  const cacheKey = `dashboard_metrics_${sinceClause}`;

  // Check cache first
  if (useCacheIfAvailable) {
    const cached = cache.get<DashboardMetrics>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Query for sales metrics (revenue, order count, AOV)
    const salesQuery = `FROM sales SHOW total_sales, count() SINCE ${sinceClause}`;
    const salesResult = await executeShopifyQLQuery(admin, salesQuery);

    if (!salesResult.tableData || !salesResult.tableData.rows || salesResult.tableData.rows.length === 0) {
      throw new Error('No sales data returned from ShopifyQL');
    }

    const salesRow = salesResult.tableData.rows[0];
    const totalRevenue = parseFloat(salesRow.total_sales || '0');
    const totalOrders = parseInt(salesRow.count || salesRow['count()'] || '0', 10);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Query for customer count
    const customersQuery = `FROM customers SHOW count() SINCE ${sinceClause}`;
    const customersResult = await executeShopifyQLQuery(admin, customersQuery);

    if (!customersResult.tableData || !customersResult.tableData.rows || customersResult.tableData.rows.length === 0) {
      throw new Error('No customer data returned from ShopifyQL');
    }

    const customersRow = customersResult.tableData.rows[0];
    const totalCustomers = parseInt(customersRow.count || customersRow['count()'] || '0', 10);

    // Calculate conversion rate (orders per customer)
    const conversionRate = totalCustomers > 0 ? (totalOrders / totalCustomers) * 100 : 0;

    const metrics: DashboardMetrics = {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      totalCustomers,
      conversionRate,
      source: 'shopifyql',
      cachedAt: new Date(),
    };

    // Cache the result
    cache.set(cacheKey, metrics, cacheTTL);

    console.log(`[ShopifyQL] Dashboard metrics:`, {
      totalRevenue: `$${totalRevenue.toFixed(2)}`,
      totalOrders,
      averageOrderValue: `$${averageOrderValue.toFixed(2)}`,
      totalCustomers,
      conversionRate: `${conversionRate.toFixed(2)}%`,
    });

    return metrics;

  } catch (error) {
    console.error('[ShopifyQL] Failed to get dashboard metrics:', error);
    throw error;
  }
}

// ============================================
// CACHE UTILITIES
// ============================================

/**
 * Clear all ShopifyQL cache or specific key
 */
export function clearCache(key?: string): void {
  cache.clear(key);
}

/**
 * Get when a cache key was last updated
 */
export function getCacheAge(key: string): number | null {
  const cachedAt = cache.getCachedAt(key);
  if (!cachedAt) {
    return null;
  }
  return Date.now() - cachedAt.getTime();
}

// ============================================
// ERROR HANDLING & FALLBACK
// ============================================

/**
 * Helper to try ShopifyQL and fallback to Aurora
 */
export async function withAuroraFallback<T>(
  shopifyqlFn: () => Promise<T>,
  auroraFallbackFn: () => Promise<T>,
  operation: string
): Promise<T> {
  try {
    console.log(`[ShopifyQL] Attempting ${operation} via ShopifyQL`);
    return await shopifyqlFn();
  } catch (error) {
    console.warn(`[ShopifyQL] ${operation} failed, falling back to Aurora:`, error);
    return await auroraFallbackFn();
  }
}
