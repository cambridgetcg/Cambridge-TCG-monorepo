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
  useEffect(() => {
    // Skip monitoring for certain routes
    if (!shouldMonitorRoute(location.pathname)) {
      return;
    }
    
    if (navigation.state === 'loading') {
      startTimeRef.current = performance.now();
      performance.mark('route-navigation-start');
      
      // Show loading indicator after 100ms
      const timer = setTimeout(() => {
        if (navigation.state === 'loading') {
          showLoadingIndicator();
        }
      }, 100);
      
      return () => clearTimeout(timer);
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
      
      hideLoadingIndicator();
      
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
      
      // Log performance issues
      if (severity !== 'success' && process.env.NODE_ENV === 'development') {
        const icon = severity === 'error' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';
        console[severity === 'error' ? 'error' : 'warn'](
          `${icon} Route Performance Issue\n` +
          `  Route: ${location.pathname}\n` +
          `  Duration: ${duration.toFixed(0)}ms\n` +
          `  Budget: ${budget}ms\n` +
          `  Exceeded by: ${(duration - budget).toFixed(0)}ms (${((duration / budget - 1) * 100).toFixed(0)}%)`
        );
        
        // Show visual warning in development
        if (severity === 'error' || severity === 'warning') {
          showPerformanceWarning(location.pathname, duration, budget, severity);
        }
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

/**
 * Show loading indicator during navigation
 */
function showLoadingIndicator() {
  if (document.getElementById('route-loading-indicator')) return;
  
  const indicator = document.createElement('div');
  indicator.id = 'route-loading-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #005bd3 0%, #0073e6 50%, #005bd3 100%);
    background-size: 200% 100%;
    animation: routeLoadingShimmer 1.5s infinite;
    z-index: 10001;
  `;
  
  // Add animation keyframes if not already present
  if (!document.getElementById('route-loading-styles')) {
    const style = document.createElement('style');
    style.id = 'route-loading-styles';
    style.textContent = `
      @keyframes routeLoadingShimmer {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
      
      @keyframes performanceWarningSlide {
        0% { transform: translateX(100%); opacity: 0; }
        10% { transform: translateX(0); opacity: 1; }
        90% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(indicator);
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
  const indicator = document.getElementById('route-loading-indicator');
  if (indicator) {
    indicator.style.opacity = '0';
    indicator.style.transition = 'opacity 200ms ease-out';
    setTimeout(() => indicator.remove(), 200);
  }
}

/**
 * Show performance warning toast
 */
function showPerformanceWarning(
  route: string,
  duration: number,
  budget: number,
  severity: 'error' | 'warning' | 'info'
) {
  const warning = document.createElement('div');
  warning.className = 'performance-warning';
  warning.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${severity === 'error' ? '#ff4444' : severity === 'warning' ? '#ffaa00' : '#0066cc'};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    max-width: 320px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: performanceWarningSlide 3s ease-out forwards;
    cursor: pointer;
  `;
  
  warning.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 4px;">
      ${severity === 'error' ? '⚠️ Slow' : '⏱️ Moderate'} Route Transition
    </div>
    <div style="opacity: 0.95;">
      ${route} took ${duration.toFixed(0)}ms (budget: ${budget}ms)
    </div>
  `;
  
  warning.onclick = () => warning.remove();
  document.body.appendChild(warning);
  
  // Auto-remove after animation
  setTimeout(() => warning.remove(), 3000);
}

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