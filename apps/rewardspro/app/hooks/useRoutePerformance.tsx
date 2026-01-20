import { useNavigation, useLocation } from '@remix-run/react';
import { useEffect, useRef, useCallback } from 'react';
import { 
  PERFORMANCE_BUDGETS, 
  getPerformanceSeverity, 
  shouldMonitorRoute,
  getRouteBudget 
} from '~/config/performance-budgets';

interface RouteMetrics {
  path: string;
  duration: number;
  timestamp: number;
  severity: 'error' | 'warning' | 'info' | 'success';
}

interface PerformanceWarning {
  message: string;
  severity: 'error' | 'warning' | 'info';
  timestamp: number;
}

/**
 * Hook to monitor route transition performance
 * Tracks navigation timing and warns when budgets are exceeded
 */
export function useRoutePerformance() {
  const navigation = useNavigation();
  const location = useLocation();
  const metricsRef = useRef<RouteMetrics[]>([]);
  const startTimeRef = useRef<number>(0);
  const warningsRef = useRef<PerformanceWarning[]>([]);
  
  // Store metrics for analysis
  const storeMetric = useCallback((metric: RouteMetrics) => {
    // Keep last 10 metrics
    metricsRef.current = [...metricsRef.current.slice(-9), metric];
    
    // Calculate statistics
    const metrics = metricsRef.current;
    const durations = metrics.map(m => m.duration);
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const p75 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.75)] || avg;
    
    // Check if performance is degrading
    const budget = PERFORMANCE_BUDGETS.transitions.routeChange;
    if (avg > budget * 1.2) {
      const warning: PerformanceWarning = {
        message: `Average route transition time is ${avg.toFixed(0)}ms (20% over budget)`,
        severity: 'warning',
        timestamp: Date.now(),
      };
      warningsRef.current = [...warningsRef.current.slice(-4), warning];
      
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `📊 Route Performance Summary:\n` +
          `  Average: ${avg.toFixed(0)}ms\n` +
          `  P75: ${p75.toFixed(0)}ms\n` +
          `  Min: ${min.toFixed(0)}ms\n` +
          `  Max: ${max.toFixed(0)}ms\n` +
          `  Budget: ${budget}ms`
        );
      }
    }
    
    // Track with analytics if available
    if (typeof window !== 'undefined' && window.vercelAnalytics?.track) {
      window.vercelAnalytics.track('RouteTransition', {
        path: metric.path,
        duration: Math.round(metric.duration),
        severity: metric.severity,
        avgDuration: Math.round(avg),
        p75Duration: Math.round(p75),
      });
    }
  }, []);
  
  // Monitor navigation state changes
  // NOTE: Visual loading indicators are handled by PageAnimation/NavigationProgress
  // This hook only tracks performance metrics - no DOM manipulation
  useEffect(() => {
    // Skip monitoring for certain routes
    if (!shouldMonitorRoute(location.pathname)) {
      return;
    }

    if (navigation.state === 'loading') {
      startTimeRef.current = performance.now();
      performance.mark('route-navigation-start');
      return;
    }

    if (navigation.state === 'idle' && startTimeRef.current > 0) {
      const duration = performance.now() - startTimeRef.current;
      performance.mark('route-navigation-end');

      // Create performance measure
      const measureName = `route-${location.pathname.replace(/\//g, '-')}`;
      performance.measure(
        measureName,
        'route-navigation-start',
        'route-navigation-end'
      );
      
      // Get route-specific budget
      const budget = getRouteBudget(location.pathname);
      const severity = getPerformanceSeverity(duration, budget);
      
      const metric: RouteMetrics = {
        path: location.pathname,
        duration,
        timestamp: Date.now(),
        severity,
      };
      
      storeMetric(metric);
      
      // Log performance issues (console only - no visual UI to avoid conflicts)
      if (severity !== 'success' && process.env.NODE_ENV === 'development') {
        const icon = severity === 'error' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
        console[severity === 'error' ? 'error' : 'warn'](
          `${icon} Route Performance Issue\n` +
          `  Route: ${location.pathname}\n` +
          `  Duration: ${duration.toFixed(0)}ms\n` +
          `  Budget: ${budget}ms\n` +
          `  Exceeded by: ${(duration - budget).toFixed(0)}ms (${((duration / budget - 1) * 100).toFixed(0)}%)`
        );
        // Visual warnings removed - use PageAnimation/NavigationProgress instead
      }
      
      // Check for server timing headers
      checkServerTiming();
      
      startTimeRef.current = 0;
    }
  }, [navigation.state, location.pathname, storeMetric]);
  
  // Expose metrics for components
  const getMetrics = useCallback(() => {
    const metrics = metricsRef.current;
    if (metrics.length === 0) return null;
    
    const durations = metrics.map(m => m.duration);
    return {
      count: metrics.length,
      average: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p75: durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.75)] || 0,
      recent: metrics.slice(-5),
      warnings: warningsRef.current,
    };
  }, []);
  
  return {
    metrics: getMetrics(),
    currentRoute: location.pathname,
    isNavigating: navigation.state === 'loading',
  };
}

// NOTE: Visual loading indicators (showLoadingIndicator, hideLoadingIndicator, showPerformanceWarning)
// have been removed. All visual navigation feedback is now handled centrally by:
// - PageAnimation/NavigationProgress component (progress bar)
// - PageAnimation/PageTransition component (page enter/exit animations)
// This prevents duplicate/conflicting animations that caused the "double flash" issue.

/**
 * Check for Server-Timing headers
 */
function checkServerTiming() {
  if (process.env.NODE_ENV !== 'development') return;
  
  try {
    const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const navEntry = entries[0];
    
    if (navEntry?.serverTiming && navEntry.serverTiming.length > 0) {
      const slowOperations = navEntry.serverTiming.filter(
        timing => timing.duration && timing.duration > 100
      );
      
      if (slowOperations.length > 0) {
        console.group('⏱️ Server Timing');
        slowOperations.forEach(timing => {
          const severity = timing.duration! > 500 ? 'error' : 'warn';
          console[severity](
            `${timing.name}: ${timing.duration!.toFixed(0)}ms` +
            (timing.description ? ` (${timing.description})` : '')
          );
        });
        console.groupEnd();
      }
    }
  } catch (error) {
    // Ignore errors in server timing check
  }
}

// Type augmentation for window.vercelAnalytics
declare global {
  interface Window {
    vercelAnalytics?: {
      track: (event: string, properties?: Record<string, any>) => void;
    };
  }
}