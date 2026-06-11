import { useState, useEffect, useRef, useCallback } from "react";
import { useMatches } from "@remix-run/react";

/**
 * Custom hook for responsive behavior with performance optimizations
 * Following the guide's patterns for smooth resizing
 */

// Polaris breakpoints
export const BREAKPOINTS = {
  xs: 0,
  sm: 490,
  md: 768,
  lg: 1040,
  xl: 1440,
} as const;

// Device detection from server
export function useDeviceType() {
  const matches = useMatches();
  const rootData = matches[0]?.data as { deviceType?: string } | undefined;
  return rootData?.deviceType || "desktop";
}

// Optimized resize observer hook
export function useResizeObserver<T extends HTMLElement>() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const ref = useRef<T>(null);
  const rafId = useRef<number>();

  useEffect(() => {
    if (!ref.current) return;

    const observer = new ResizeObserver((entries) => {
      // Cancel previous frame
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }

      // Schedule update for next frame
      rafId.current = requestAnimationFrame(() => {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      });
    });

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return { ref, dimensions };
}

// Optimized window dimensions hook
export function useWindowDimensions() {
  const [dimensions, setDimensions] = useState(() => {
    if (typeof window === "undefined") {
      return { width: 1024, height: 768 }; // SSR defaults
    }
    return { width: window.innerWidth, height: window.innerHeight };
  });

  useEffect(() => {
    let rafId: number;
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      // Cancel any pending updates
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);

      // Debounce with requestAnimationFrame
      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(() => {
          setDimensions({
            width: window.innerWidth,
            height: window.innerHeight,
          });
        });
      }, 150); // 150ms debounce
    };

    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return dimensions;
}

// Media query hook with SSR support
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => {
      requestAnimationFrame(() => {
        setMatches(e.matches);
      });
    };

    // Modern API
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
    
    // Legacy API fallback
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }, [query]);

  // Return false during SSR to prevent hydration mismatch
  return isHydrated ? matches : false;
}

// Breakpoint detection
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  
  const breakpoint = useCallback(() => {
    if (width >= BREAKPOINTS.xl) return "xl";
    if (width >= BREAKPOINTS.lg) return "lg";
    if (width >= BREAKPOINTS.md) return "md";
    if (width >= BREAKPOINTS.sm) return "sm";
    return "xs";
  }, [width]);

  return {
    current: breakpoint(),
    isXs: width < BREAKPOINTS.sm,
    isSm: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
    isMd: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
    isLg: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
    isXl: width >= BREAKPOINTS.xl,
    // Cumulative breakpoints
    smUp: width >= BREAKPOINTS.sm,
    mdUp: width >= BREAKPOINTS.md,
    lgUp: width >= BREAKPOINTS.lg,
    xlUp: width >= BREAKPOINTS.xl,
  };
}

// Container query support detection
export function useContainerQuerySupport() {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(CSS.supports("container-type", "inline-size"));
  }, []);

  return supported;
}

// Intersection observer for lazy loading
export function useIntersectionObserver<T extends HTMLElement>(
  options?: IntersectionObserverInit
) {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      requestAnimationFrame(() => {
        setIsIntersecting(entry.isIntersecting);
      });
    }, options);

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [options]);

  return { ref, isIntersecting };
}

// Hydration status
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  
  useEffect(() => {
    setHydrated(true);
  }, []);
  
  return hydrated;
}

// Viewport-based data loading
export function useResponsiveData<T>(
  mobileData: T,
  desktopData: T,
  breakpoint: number = BREAKPOINTS.md
) {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  
  if (!hydrated) {
    // Return mobile data during SSR to prevent layout shift
    return mobileData;
  }
  
  return width < breakpoint ? mobileData : desktopData;
}