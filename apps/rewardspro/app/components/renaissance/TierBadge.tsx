/**
 * Tier Badge Component - "The Gemstone Staircase"
 *
 * Displays customer tier level with metallic gradient styling.
 * Each tier has its own gemstone-inspired color scheme.
 */

import React from 'react';

export type TierLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface TierBadgeProps {
  /** Tier level */
  tier: TierLevel;
  /** Custom tier name to display */
  name?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show shimmer animation */
  animated?: boolean;
  /** Additional CSS class */
  className?: string;
}

const tierConfig: Record<TierLevel, {
  icon: string;
  label: string;
  colors: {
    text: string;
    light: string;
    main: string;
    dark: string;
    shadow: string;
  };
}> = {
  bronze: {
    icon: '●',
    label: 'Bronze',
    colors: {
      text: '#7d5a42',
      light: '#c4a484',
      main: '#a0785d',
      dark: '#7d5a42',
      shadow: 'rgba(160, 120, 93, 0.3)',
    },
  },
  silver: {
    icon: '○',
    label: 'Silver',
    colors: {
      text: '#718096',
      light: '#cbd5e0',
      main: '#a0aec0',
      dark: '#718096',
      shadow: 'rgba(160, 174, 192, 0.3)',
    },
  },
  gold: {
    icon: '★',
    label: 'Gold',
    colors: {
      text: '#b7791f',
      light: '#f6e05e',
      main: '#ecc94b',
      dark: '#d69e2e',
      shadow: 'rgba(236, 201, 75, 0.4)',
    },
  },
  platinum: {
    icon: '◆',
    label: 'Platinum',
    colors: {
      text: '#1a365d',
      light: '#f7fafc',
      main: '#e2e8f0',
      dark: '#a0aec0',
      shadow: 'rgba(226, 232, 240, 0.4)',
    },
  },
  diamond: {
    icon: '◇',
    label: 'Diamond',
    colors: {
      text: '#ffffff',
      light: '#b794f4',
      main: '#9f7aea',
      dark: '#805ad5',
      shadow: 'rgba(159, 122, 234, 0.4)',
    },
  },
};

const sizeConfig = {
  sm: {
    padding: '2px 8px',
    fontSize: '11px',
    iconSize: '12px',
  },
  md: {
    padding: '5px 13px',
    fontSize: '13px',
    iconSize: '14px',
  },
  lg: {
    padding: '8px 21px',
    fontSize: '16px',
    iconSize: '18px',
  },
};

export function TierBadge({
  tier,
  name,
  size = 'md',
  animated = false,
  className = '',
}: TierBadgeProps) {
  const config = tierConfig[tier];
  const sizeStyles = sizeConfig[size];

  // High-value tiers (gold+) get animation by default
  const shouldAnimate = animated || ['gold', 'platinum', 'diamond'].includes(tier);

  return (
    <span
      className={`tier-badge tier-badge--${tier} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        fontWeight: 600,
        borderRadius: '9999px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: config.colors.text,
        background: `linear-gradient(
          135deg,
          ${config.colors.light} 0%,
          ${config.colors.main} 50%,
          ${config.colors.light} 100%
        )`,
        backgroundSize: '200% 200%',
        boxShadow: `0 2px 8px ${config.colors.shadow}`,
        animation: shouldAnimate ? 'shimmer 3s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{ fontSize: sizeStyles.iconSize }}>
        {config.icon}
      </span>
      <span>{name || config.label}</span>

      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Extra glow for platinum and diamond */}
      {(tier === 'platinum' || tier === 'diamond') && (
        <style>{`
          .tier-badge--platinum,
          .tier-badge--diamond {
            box-shadow:
              0 2px 8px ${config.colors.shadow},
              inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
          }
          .tier-badge--diamond {
            box-shadow:
              0 2px 8px ${config.colors.shadow},
              0 0 20px rgba(159, 122, 234, 0.2) !important;
          }
        `}</style>
      )}
    </span>
  );
}

/**
 * Tier Badge with customer name
 */
export function TierBadgeWithName({
  tier,
  customerName,
  size = 'md',
}: {
  tier: TierLevel;
  customerName: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-sm, 8px)',
    }}>
      <TierBadge tier={tier} size={size} />
      <span style={{
        fontWeight: 500,
        color: 'var(--color-merchant-blue, #1a365d)',
      }}>
        {customerName}
      </span>
    </div>
  );
}

/**
 * Mini tier indicator (icon only)
 */
export function TierIndicator({ tier }: { tier: TierLevel }) {
  const config = tierConfig[tier];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        fontSize: '14px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${config.colors.light} 0%, ${config.colors.main} 100%)`,
        boxShadow: `0 2px 4px ${config.colors.shadow}`,
      }}
      title={config.label}
    >
      {config.icon}
    </span>
  );
}
