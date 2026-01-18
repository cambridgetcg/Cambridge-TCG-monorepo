/**
 * Performance Budgets Configuration
 * Based on Core Web Vitals and Shopify app guidelines
 */

export const PERFORMANCE_BUDGETS = {
  // Core Web Vitals (Good thresholds)
  coreWebVitals: {
    LCP: 2500,     // Largest Contentful Paint ≤ 2.5s
    FCP: 2000,     // First Contentful Paint ≤ 2.0s
    INP: 200,      // Interaction to Next Paint ≤ 200ms
    CLS: 0.1,      // Cumulative Layout Shift < 0.1
    TTFB: 800,     // Time to First Byte < 800ms
  },
  
  // Route transitions (SPA navigation)
  transitions: {
    routeChange: 1000,        // 1s for route transitions
    modalOpen: 300,           // 300ms for modal opens
    dataTableSort: 500,       // 500ms for table operations
    formSubmit: 500,          // 500ms for form feedback
    searchResults: 300,       // 300ms for search results
  },
  
  // Asset sizes (following Shopify guidelines)
  assetSizes: {
    entryJS: 10240,          // 10 KB entry JavaScript
    totalJS: 204800,         // 200 KB total JavaScript
    css: 51200,              // 50 KB CSS
    images: 102400,          // 100 KB per image
    apiResponse: 512000,     // 500 KB API responses
    chunkSize: 102400,       // 100 KB per lazy chunk
  },
  
  // Custom metrics for RewardsPro
  customMetrics: {
    dashboardLoad: 2000,      // 2s for dashboard initial load
    customerListLoad: 1500,   // 1.5s to load customer list
    tierCalculation: 500,     // 500ms for tier calculations
    creditSync: 3000,         // 3s for Shopify credit sync
    analyticsRender: 2000,    // 2s for analytics dashboard
    reportGeneration: 5000,   // 5s for report generation
    bulkOperation: 10000,     // 10s for bulk operations
  },
  
  // Performance scores (0-100)
  scores: {
    excellent: 90,
    good: 75,
    needsImprovement: 50,
    poor: 0,
  },
  
  // Severity levels for violations
  severity: {
    error: 1.5,     // 50% over budget = error
    warning: 1.2,   // 20% over budget = warning
    info: 1.0,      // At budget = info
  },
};

/**
 * Get the severity level for a performance metric
 */
export function getPerformanceSeverity(
  actual: number,
  budget: number
): 'error' | 'warning' | 'info' | 'success' {
  const ratio = actual / budget;
  
  if (ratio >= PERFORMANCE_BUDGETS.severity.error) return 'error';
  if (ratio >= PERFORMANCE_BUDGETS.severity.warning) return 'warning';
  if (ratio >= PERFORMANCE_BUDGETS.severity.info) return 'info';
  return 'success';
}

/**
 * Format a performance metric for display
 */
export function formatMetric(value: number, metric: string): string {
  if (metric === 'CLS') {
    return value.toFixed(3);
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
}

/**
 * Get performance score based on metric value and budget
 */
export function getPerformanceScore(actual: number, budget: number): number {
  if (actual <= budget) {
    // Excellent to good range (75-100)
    return 75 + (25 * (1 - actual / budget));
  } else if (actual <= budget * 1.5) {
    // Needs improvement range (50-75)
    return 50 + (25 * (1 - (actual - budget) / (budget * 0.5)));
  } else if (actual <= budget * 2) {
    // Poor range (25-50)
    return 25 + (25 * (1 - (actual - budget * 1.5) / (budget * 0.5)));
  } else {
    // Very poor (0-25)
    return Math.max(0, 25 * (1 - (actual - budget * 2) / budget));
  }
}

/**
 * Check if a route should be monitored
 */
export function shouldMonitorRoute(pathname: string): boolean {
  // Skip monitoring for development-only routes
  const skipRoutes = [
    '/app/webhook-test',
    '/app/performance-monitor',
    '/auth',
  ];
  
  return !skipRoutes.some(route => pathname.startsWith(route));
}

/**
 * Get budget for specific route
 */
export function getRouteBudget(pathname: string): number {
  const routeBudgets: Record<string, number> = {
    '/app': PERFORMANCE_BUDGETS.customMetrics.dashboardLoad,
    '/app/customers': PERFORMANCE_BUDGETS.customMetrics.customerListLoad,
    '/app/analytics': PERFORMANCE_BUDGETS.customMetrics.analyticsRender,
    '/app/credit-management': PERFORMANCE_BUDGETS.transitions.routeChange,
    '/app/settings': PERFORMANCE_BUDGETS.transitions.routeChange,
  };
  
  return routeBudgets[pathname] || PERFORMANCE_BUDGETS.transitions.routeChange;
}