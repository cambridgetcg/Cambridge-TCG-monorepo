/**
 * PageAnimation - Standardized Page Loading and Navigation Animations
 *
 * This module provides consistent animations across the app for:
 * - Initial page loading states (skeletons)
 * - Page enter/exit transitions
 * - Navigation progress indicators
 * - Staggered content animations
 *
 * Usage:
 * 1. Wrap page content with <PageTransition> for enter/exit animations
 * 2. Use <PageLoader> to show consistent loading skeletons
 * 3. Use usePageAnimation() hook for navigation state
 * 4. Apply motionPresets for individual element animations
 */

import React, { useEffect, useState, useCallback, useMemo, createContext, useContext } from 'react';
import { useNavigation, useLocation } from '@remix-run/react';
import { motion, AnimatePresence, type Variants, type Transition } from 'framer-motion';
import {
  Card,
  Box,
  BlockStack,
  InlineStack,
  SkeletonBodyText,
  SkeletonDisplayText,
  SkeletonThumbnail,
} from '@shopify/polaris';

// ============================================
// REDUCED MOTION DETECTION
// ============================================

/**
 * Hook to detect user's reduced motion preference
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if we're on the client side
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// ============================================
// MOTION PRESETS - Standardized Animation Configs
// ============================================

/**
 * Duration scale following design tokens
 */
export const durations = {
  instant: 0.05,
  quick: 0.15,
  normal: 0.25,
  slow: 0.4,
  dramatic: 0.6,
} as const;

/**
 * Easing curves following design tokens
 */
export const easings = {
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  easeInOut: [0.4, 0, 0.2, 1],
  bounce: [0.68, -0.55, 0.265, 1.55],
  dramatic: [0.16, 1, 0.3, 1],
} as const;

/**
 * Standard transition presets
 */
export const transitions = {
  quick: { duration: durations.quick, ease: easings.easeOut },
  normal: { duration: durations.normal, ease: easings.easeOut },
  slow: { duration: durations.slow, ease: easings.easeOut },
  dramatic: { duration: durations.dramatic, ease: easings.dramatic },
  spring: { type: 'spring', stiffness: 300, damping: 30 },
  springGentle: { type: 'spring', stiffness: 200, damping: 25 },
} as const;

/**
 * Page transition variants - used for full page enter/exit
 *
 * IMPORTANT: Keep animations subtle and fast to prevent "double flash" effect.
 * The enter animation uses minimal y offset (4px) for smoothness.
 */
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 4,
  },
  enter: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
  },
};

/**
 * Reduced motion page variants
 */
export const pageVariantsReduced: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Fade variants - simple opacity transitions
 */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Slide up variants - content sliding up into view
 */
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 16 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

/**
 * Scale variants - subtle scale effect
 */
export const scaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  enter: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/**
 * Stagger container variants - for animating child elements
 */
export const staggerContainerVariants: Variants = {
  initial: {},
  enter: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

/**
 * Stagger item variants - for children of stagger container
 */
export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

/**
 * Card hover variants - for interactive cards
 */
export const cardHoverVariants: Variants = {
  initial: { scale: 1, y: 0 },
  hover: { scale: 1.01, y: -2 },
  tap: { scale: 0.99 },
};

// ============================================
// PAGE ANIMATION CONTEXT
// ============================================

interface PageAnimationContextValue {
  isNavigating: boolean;
  isInitialLoad: boolean;
  reducedMotion: boolean;
  navigationProgress: number;
}

const PageAnimationContext = createContext<PageAnimationContextValue>({
  isNavigating: false,
  isInitialLoad: true,
  reducedMotion: false,
  navigationProgress: 0,
});

export function usePageAnimationContext() {
  return useContext(PageAnimationContext);
}

// ============================================
// PAGE ANIMATION HOOK
// ============================================

export interface PageAnimationState {
  /** True when navigating between pages */
  isNavigating: boolean;
  /** True on first render before data loads */
  isInitialLoad: boolean;
  /** Navigation state from Remix */
  navigationState: 'idle' | 'loading' | 'submitting';
  /** True if user prefers reduced motion */
  reducedMotion: boolean;
  /** Simulated progress (0-100) for navigation indicator */
  navigationProgress: number;
  /** Get variants based on reduced motion preference */
  getVariants: (variants: Variants, reducedVariants?: Variants) => Variants;
  /** Get transition based on reduced motion preference */
  getTransition: (transition: Transition) => Transition;
}

/**
 * Hook for standardized page animation state and helpers
 */
export function usePageAnimation(): PageAnimationState {
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [navigationProgress, setNavigationProgress] = useState(0);

  const isNavigating = navigation.state === 'loading';
  const navigationState = navigation.state;

  // Mark initial load complete after first render
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);

  // Simulate navigation progress
  useEffect(() => {
    if (isNavigating) {
      setNavigationProgress(0);

      // Quick jump to 30%
      const timer1 = setTimeout(() => setNavigationProgress(30), 50);
      // Slower progress to 60%
      const timer2 = setTimeout(() => setNavigationProgress(60), 200);
      // Even slower to 80%
      const timer3 = setTimeout(() => setNavigationProgress(80), 500);
      // Creep to 90%
      const timer4 = setTimeout(() => setNavigationProgress(90), 1000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
      };
    } else {
      // Complete the progress bar then reset
      setNavigationProgress(100);
      const timer = setTimeout(() => setNavigationProgress(0), 200);
      return () => clearTimeout(timer);
    }
  }, [isNavigating]);

  // Helper to get appropriate variants
  const getVariants = useCallback(
    (variants: Variants, reducedVariants?: Variants): Variants => {
      if (reducedMotion) {
        return reducedVariants || fadeVariants;
      }
      return variants;
    },
    [reducedMotion]
  );

  // Helper to get appropriate transition
  const getTransition = useCallback(
    (transition: Transition): Transition => {
      if (reducedMotion) {
        return { duration: 0.1 };
      }
      return transition;
    },
    [reducedMotion]
  );

  return {
    isNavigating,
    isInitialLoad,
    navigationState,
    reducedMotion,
    navigationProgress,
    getVariants,
    getTransition,
  };
}

// ============================================
// PAGE ANIMATION PROVIDER
// ============================================

interface PageAnimationProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that wraps the app and provides animation context
 */
export function PageAnimationProvider({ children }: PageAnimationProviderProps) {
  const { isNavigating, isInitialLoad, reducedMotion, navigationProgress } = usePageAnimation();

  const contextValue = useMemo(
    () => ({
      isNavigating,
      isInitialLoad,
      reducedMotion,
      navigationProgress,
    }),
    [isNavigating, isInitialLoad, reducedMotion, navigationProgress]
  );

  return (
    <PageAnimationContext.Provider value={contextValue}>
      {children}
    </PageAnimationContext.Provider>
  );
}

// ============================================
// NAVIGATION PROGRESS BAR
// ============================================

interface NavigationProgressProps {
  /** Custom color for the progress bar */
  color?: string;
  /** Height of the progress bar in pixels */
  height?: number;
}

/**
 * Slim progress bar at the top of the page during navigation
 */
export function NavigationProgress({
  color = 'var(--rp-color-accent-gold, #d69e2e)',
  height = 3
}: NavigationProgressProps) {
  const { isNavigating, navigationProgress, reducedMotion } = usePageAnimationContext();

  if (!isNavigating && navigationProgress === 0) {
    return null;
  }

  return (
    <motion.div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: isNavigating ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.15 }}
    >
      <motion.div
        style={{
          height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
          boxShadow: `0 0 10px ${color}66`,
          borderRadius: '0 2px 2px 0',
        }}
        initial={{ width: '0%' }}
        animate={{ width: `${navigationProgress}%` }}
        transition={{
          duration: reducedMotion ? 0 : 0.3,
          ease: easings.easeOut,
        }}
      />
    </motion.div>
  );
}

// ============================================
// PAGE TRANSITION COMPONENT
// ============================================

interface PageTransitionProps {
  children: React.ReactNode;
  /** Unique key for AnimatePresence (defaults to location pathname) */
  pageKey?: string;
  /** Variant type to use */
  variant?: 'fade' | 'slide' | 'scale' | 'page';
  /** Custom variants */
  customVariants?: Variants;
  /** Whether to show exit animation */
  exitAnimation?: boolean;
  /** Callback when animation completes */
  onAnimationComplete?: () => void;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Wrapper component that applies consistent enter/exit animations to page content
 *
 * ⚠️  WARNING: DO NOT USE THIS WITH REMIX <Outlet />!
 * ================================================
 * AnimatePresence + Remix Outlet causes a "double display" bug because:
 * 1. User navigates → AnimatePresence sees key change
 * 2. Remix has ALREADY swapped the Outlet content imperatively
 * 3. AnimatePresence tries to animate content that's already new
 * 4. Result: New content appears → then animates in → DOUBLE DISPLAY
 *
 * CORRECT USAGE:
 * - Use CSS transitions for page-level opacity changes (see app.tsx)
 * - Use this component only for NON-Outlet content (modals, cards, etc.)
 * - Keep NavigationProgress for visual loading feedback
 *
 * DESIGN DECISIONS:
 * - Fast transition (0.15s): Quick enough to feel responsive
 * - Minimal exit animation: Exit fades quickly to avoid interference
 */
export function PageTransition({
  children,
  pageKey,
  variant = 'page',
  customVariants,
  exitAnimation = false, // Default to false - exit animations cause flash
  onAnimationComplete,
  className,
  style,
}: PageTransitionProps) {
  const location = useLocation();
  const { reducedMotion } = usePageAnimationContext();
  const key = pageKey || location.pathname;

  // Select variants based on type
  const getVariantSet = () => {
    if (customVariants) return customVariants;
    if (reducedMotion) return fadeVariants;

    switch (variant) {
      case 'fade':
        return fadeVariants;
      case 'slide':
        return slideUpVariants;
      case 'scale':
        return scaleVariants;
      case 'page':
      default:
        return pageVariants;
    }
  };

  const variants = getVariantSet();
  // Use faster transition to prevent perception of "double display"
  const transition = reducedMotion
    ? { duration: 0.05 }
    : { duration: durations.quick, ease: easings.easeOut };

  return (
    <AnimatePresence mode={exitAnimation ? 'wait' : 'sync'}>
      <motion.div
        key={key}
        variants={variants}
        initial="initial"
        animate="enter"
        exit={exitAnimation ? 'exit' : undefined}
        transition={transition}
        onAnimationComplete={onAnimationComplete}
        className={className}
        style={style}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// STAGGER CHILDREN COMPONENT
// ============================================

interface StaggerChildrenProps {
  children: React.ReactNode;
  /** Delay between each child animation in seconds */
  staggerDelay?: number;
  /** Initial delay before first child animates */
  initialDelay?: number;
  /** Custom variants for children */
  childVariants?: Variants;
  /** Additional className */
  className?: string;
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Container that staggers the animation of its children
 */
export function StaggerChildren({
  children,
  staggerDelay = 0.05,
  initialDelay = 0.1,
  childVariants,
  className,
  style,
}: StaggerChildrenProps) {
  const { reducedMotion } = usePageAnimationContext();

  const containerVariants: Variants = {
    initial: {},
    enter: {
      transition: {
        staggerChildren: reducedMotion ? 0 : staggerDelay,
        delayChildren: reducedMotion ? 0 : initialDelay,
      },
    },
  };

  const itemVariants = childVariants || (reducedMotion ? fadeVariants : staggerItemVariants);

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate="enter"
      className={className}
      style={style}
    >
      {React.Children.map(children, (child) => (
        <motion.div
          variants={itemVariants}
          transition={reducedMotion ? { duration: 0.1 } : transitions.normal}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ============================================
// PAGE LOADER COMPONENT
// ============================================

export type PageLoaderVariant =
  | 'dashboard'    // Cards with metrics
  | 'list'         // Table/list view
  | 'detail'       // Single item detail
  | 'form'         // Form fields
  | 'cards'        // Card grid
  | 'minimal';     // Just a spinner/skeleton

interface PageLoaderProps {
  /** Type of page skeleton to show */
  variant?: PageLoaderVariant;
  /** Number of items for list/cards variant */
  itemCount?: number;
  /** Show the loader */
  loading?: boolean;
  /** Custom loading content */
  children?: React.ReactNode;
}

/**
 * Standardized page loading skeleton component
 */
export function PageLoader({
  variant = 'dashboard',
  itemCount = 3,
  loading = true,
  children,
}: PageLoaderProps) {
  const { reducedMotion } = usePageAnimationContext();

  if (!loading) {
    return <>{children}</>;
  }

  // Animation wrapper for skeleton pulse
  const SkeletonWrapper = ({ children: content }: { children: React.ReactNode }) => (
    <motion.div
      initial={{ opacity: 0.6 }}
      animate={{ opacity: [0.6, 1, 0.6] }}
      transition={{
        duration: reducedMotion ? 0 : 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {content}
    </motion.div>
  );

  switch (variant) {
    case 'dashboard':
      return (
        <SkeletonWrapper>
          <BlockStack gap="400">
            {/* Metrics row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <SkeletonDisplayText size="small" />
                      <SkeletonBodyText lines={1} />
                    </BlockStack>
                  </Box>
                </Card>
              ))}
            </div>
            {/* Main content area */}
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <SkeletonDisplayText size="medium" />
                  <SkeletonBodyText lines={5} />
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </SkeletonWrapper>
      );

    case 'list':
      return (
        <SkeletonWrapper>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <SkeletonDisplayText size="small" />
                  <div style={{ width: 100 }}>
                    <SkeletonBodyText lines={1} />
                  </div>
                </InlineStack>
                <BlockStack gap="300">
                  {Array.from({ length: itemCount }).map((_, i) => (
                    <Box key={i} padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack gap="400" blockAlign="center">
                        <SkeletonThumbnail size="small" />
                        <div style={{ flex: 1 }}>
                          <SkeletonBodyText lines={2} />
                        </div>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </BlockStack>
            </Box>
          </Card>
        </SkeletonWrapper>
      );

    case 'detail':
      return (
        <SkeletonWrapper>
          <BlockStack gap="400">
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <InlineStack gap="400" blockAlign="start">
                    <SkeletonThumbnail size="large" />
                    <BlockStack gap="300">
                      <SkeletonDisplayText size="medium" />
                      <SkeletonBodyText lines={2} />
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <SkeletonDisplayText size="small" />
                  <SkeletonBodyText lines={4} />
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </SkeletonWrapper>
      );

    case 'form':
      return (
        <SkeletonWrapper>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <SkeletonDisplayText size="small" />
                {Array.from({ length: itemCount }).map((_, i) => (
                  <BlockStack key={i} gap="200">
                    <div style={{ width: 80 }}>
                      <SkeletonBodyText lines={1} />
                    </div>
                    <div style={{ height: 36, background: 'var(--p-color-bg-surface-secondary)', borderRadius: 8 }} />
                  </BlockStack>
                ))}
                <div style={{ width: 100 }}>
                  <SkeletonBodyText lines={1} />
                </div>
              </BlockStack>
            </Box>
          </Card>
        </SkeletonWrapper>
      );

    case 'cards':
      return (
        <SkeletonWrapper>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {Array.from({ length: itemCount }).map((_, i) => (
              <Card key={i}>
                <Box padding="400">
                  <BlockStack gap="300">
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={3} />
                  </BlockStack>
                </Box>
              </Card>
            ))}
          </div>
        </SkeletonWrapper>
      );

    case 'minimal':
    default:
      return (
        <SkeletonWrapper>
          <Box padding="800">
            <BlockStack gap="400" align="center">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  border: '3px solid var(--p-color-border-secondary)',
                  borderTopColor: 'var(--rp-color-accent-gold, #d69e2e)',
                  animation: reducedMotion ? 'none' : 'spin 1s linear infinite',
                }}
              />
              <SkeletonBodyText lines={1} />
            </BlockStack>
          </Box>
        </SkeletonWrapper>
      );
  }
}

// ============================================
// ANIMATED CARD COMPONENT
// ============================================

interface AnimatedCardProps {
  children: React.ReactNode;
  /** Delay before animation starts */
  delay?: number;
  /** Enable hover animation */
  hoverEffect?: boolean;
  /** Additional className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Card component with standardized enter animation and optional hover effects
 */
export function AnimatedCard({
  children,
  delay = 0,
  hoverEffect = false,
  className,
  onClick,
}: AnimatedCardProps) {
  const { reducedMotion } = usePageAnimationContext();

  const variants: Variants = reducedMotion
    ? fadeVariants
    : {
        initial: { opacity: 0, y: 12 },
        enter: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
      };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
      transition={{
        duration: reducedMotion ? 0.1 : durations.normal,
        delay: reducedMotion ? 0 : delay,
        ease: easings.easeOut,
      }}
      whileHover={hoverEffect && !reducedMotion ? { y: -2, scale: 1.01 } : undefined}
      whileTap={hoverEffect && !reducedMotion ? { scale: 0.99 } : undefined}
      className={className}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <Card>{children}</Card>
    </motion.div>
  );
}

// ============================================
// CSS KEYFRAMES (injected once)
// ============================================

// Inject keyframes for spinner animation
if (typeof document !== 'undefined') {
  const styleId = 'page-animation-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ============================================
// RE-EXPORTS FOR TYPE-ONLY USAGE
// ============================================

// Note: Types are exported inline above with their definitions
