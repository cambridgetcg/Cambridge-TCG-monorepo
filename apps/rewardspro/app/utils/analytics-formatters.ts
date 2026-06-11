/**
 * Analytics Formatting Utilities
 * Shared functions for both client and server
 */

/**
 * Format percentage change for display
 */
export function formatPercentageChange(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Get badge tone based on metric type and change value
 */
export function getBadgeTone(
  metricType: 'revenue' | 'orders' | 'customers' | 'other',
  change: number
): 'success' | 'critical' | 'warning' | 'info' {
  // For revenue, orders, customers: positive change is good
  if (metricType === 'revenue' || metricType === 'orders' || metricType === 'customers') {
    if (change > 5) return 'success';
    if (change < -5) return 'critical';
    if (change < 0) return 'warning';
    return 'info';
  }

  // For other metrics: just indicate change direction
  if (Math.abs(change) < 2) return 'info';
  return change > 0 ? 'success' : 'warning';
}
