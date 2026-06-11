/**
 * Consistent tier badge component used across all modules
 * Provides uniform visual representation of customer tiers
 */

import { Badge, InlineStack, Icon, Text, Box } from "@shopify/polaris";
import {
  getTierStyle,
  formatTierName,
  getTierIconId,
  type TierStyle
} from "~/utils/tier-styles";
import { getVectorIcon } from "~/utils/points-icon-library";
import type { ReactNode } from "react";

export interface TierBadgeProps {
  /** The tier name to display */
  tierName: string | null | undefined;
  /** Size variant of the badge */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show the icon */
  showIcon?: boolean;
  /** @deprecated Icons are always used now instead of emoji */
  showEmoji?: boolean;
  /** Whether to use gradient background */
  useGradient?: boolean;
  /** Custom CSS classes */
  className?: string;
  /** Whether the badge is clickable */
  onClick?: () => void;
  /** Whether to show as a card (larger format) */
  asCard?: boolean;
  /** Additional content to show (for card variant) */
  children?: ReactNode;
  /** Whether to show cashback percentage */
  cashbackPercent?: number;
  /** Whether to show minimum spend */
  minSpend?: number;
  /** Currency formatter function */
  formatCurrency?: (amount: number) => string;
}

export function TierBadge({
  tierName,
  size = 'medium',
  showIcon = true,
  showEmoji = false,
  useGradient = false,
  className = '',
  onClick,
  asCard = false,
  children,
  cashbackPercent,
  minSpend,
  formatCurrency = (amount) => `$${amount.toLocaleString()}`
}: TierBadgeProps) {
  const style = getTierStyle(tierName);
  const displayName = formatTierName(tierName);
  const tierIconId = getTierIconId(tierName);
  
  // Simple badge variant
  if (!asCard) {
    const badgeContent = (
      <InlineStack gap="100" blockAlign="center">
        {showIcon && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            color: style.color 
          }}>
            <Icon source={style.icon} />
          </div>
        )}
        {showEmoji && !showIcon && (
          <span style={{
            display: 'flex',
            alignItems: 'center',
            width: size === 'small' ? '14px' : '16px',
            height: size === 'small' ? '14px' : '16px',
          }}>
            <svg
              width={size === 'small' ? 14 : 16}
              height={size === 'small' ? 14 : 16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={style.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={getVectorIcon(tierIconId)?.path || ""} />
            </svg>
          </span>
        )}
        <span>{displayName}</span>
      </InlineStack>
    );
    
    if (onClick) {
      return (
        <button
          onClick={onClick}
          className={`tier-badge tier-badge--${size} ${className}`}
          style={{
            background: useGradient 
              ? `linear-gradient(135deg, ${style.gradientFrom}, ${style.gradientTo})`
              : style.backgroundColor,
            border: `1px solid ${style.borderColor}`,
            color: style.textColor,
            padding: size === 'small' ? '4px 8px' : size === 'large' ? '8px 16px' : '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            boxShadow: useGradient ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = useGradient ? '0 2px 4px rgba(0,0,0,0.1)' : 'none';
          }}
        >
          {badgeContent}
        </button>
      );
    }
    
    return (
      <Badge tone={style.badgeTone}>
        {badgeContent as unknown as string}
      </Badge>
    );
  }
  
  // Card variant for tier displays
  return (
    <div
      className={`tier-card ${className}`}
      onClick={onClick}
      style={{
        padding: 'var(--p-space-400)',
        background: 'var(--p-color-bg-surface)',
        borderColor: 'var(--p-color-border)',
        borderWidth: 'var(--p-border-width-025)',
        borderStyle: 'solid',
        borderRadius: 'var(--p-border-radius-200)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
      onMouseEnter={(e: any) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        }
      }}
      onMouseLeave={(e: any) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {/* Gradient background overlay */}
      {useGradient && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: `linear-gradient(90deg, ${style.gradientFrom}, ${style.gradientTo})`
          }}
        />
      )}
      
      <InlineStack gap="400" align="space-between">
        <InlineStack gap="200" blockAlign="center">
          {showIcon && (
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: style.backgroundColor,
              color: style.color
            }}>
              <Icon source={style.icon} />
            </div>
          )}
          
          <div>
            <Text as="h3" variant="headingMd" fontWeight="semibold">
              {displayName}
            </Text>
            
            {(cashbackPercent !== undefined || minSpend !== undefined) && (
              <InlineStack gap="300">
                {cashbackPercent !== undefined && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {cashbackPercent}% cashback
                  </Text>
                )}
                
                {minSpend !== undefined && minSpend > 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Min. {formatCurrency(minSpend)}
                  </Text>
                )}
              </InlineStack>
            )}
          </div>
        </InlineStack>
        
        {children && (
          <div>{children}</div>
        )}
      </InlineStack>
    </div>
  );
}

/**
 * Compact tier indicator for tables and lists
 */
export function TierIndicator({ 
  tierName,
  showLabel = true 
}: { 
  tierName: string | null | undefined;
  showLabel?: boolean;
}) {
  const style = getTierStyle(tierName);
  const displayName = formatTierName(tierName);
  
  return (
    <InlineStack gap="100" blockAlign="center">
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: style.color,
          flexShrink: 0
        }}
      />
      {showLabel && (
        <Text as="span" variant="bodySm" tone="subdued">
          {displayName}
        </Text>
      )}
    </InlineStack>
  );
}

/**
 * Tier progress bar component
 */
export function TierProgress({
  currentTier,
  nextTier,
  progress,
  currentSpend,
  nextTierThreshold,
  formatCurrency = (amount) => `$${amount.toLocaleString()}`
}: {
  currentTier?: string | null;
  nextTier?: string | null;
  progress: number;
  currentSpend?: number;
  nextTierThreshold?: number;
  formatCurrency?: (amount: number) => string;
}) {
  const currentStyle = getTierStyle(currentTier);
  const nextStyle = getTierStyle(nextTier);
  
  return (
    <Box>
      <InlineStack gap="200" align="space-between">
        <InlineStack gap="100" blockAlign="center">
          <Icon source={currentStyle.icon} />
          <Text as="span" variant="bodySm">
            {formatTierName(currentTier)}
          </Text>
        </InlineStack>
        
        {nextTier && (
          <InlineStack gap="100" blockAlign="center">
            <Text as="span" variant="bodySm" tone="subdued">
              Next:
            </Text>
            <Icon source={nextStyle.icon} />
            <Text as="span" variant="bodySm">
              {formatTierName(nextTier)}
            </Text>
          </InlineStack>
        )}
      </InlineStack>
      
      <Box paddingBlockStart="200">
        <div
          style={{
            width: '100%',
            height: '8px',
            background: 'rgba(0,0,0,0.08)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, progress)}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${currentStyle.gradientFrom}, ${nextStyle?.gradientFrom || currentStyle.gradientTo})`,
              borderRadius: '4px',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      </Box>
      
      {currentSpend !== undefined && nextTierThreshold !== undefined && (
        <Box paddingBlockStart="100">
          <InlineStack gap="100" align="space-between">
            <Text as="span" variant="bodySm" tone="subdued">
              {formatCurrency(currentSpend)} spent
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {formatCurrency(nextTierThreshold - currentSpend)} to go
            </Text>
          </InlineStack>
        </Box>
      )}
    </Box>
  );
}

/**
 * Tier comparison component for upgrade prompts
 */
export function TierComparison({
  currentTier,
  suggestedTier,
  currentBenefits,
  suggestedBenefits,
  onUpgrade
}: {
  currentTier: string | null;
  suggestedTier: string;
  currentBenefits: { cashback: number; perks: string[] };
  suggestedBenefits: { cashback: number; perks: string[] };
  onUpgrade?: () => void;
}) {
  const currentStyle = getTierStyle(currentTier);
  const suggestedStyle = getTierStyle(suggestedTier);
  
  return (
    <InlineStack gap="400">
      <Box width="50%">
        <TierBadge
          tierName={currentTier}
          asCard
          useGradient
          cashbackPercent={currentBenefits.cashback}
        >
          <Badge tone="enabled">Current</Badge>
        </TierBadge>
        
        <Box paddingBlockStart="200">
          {currentBenefits.perks.map((perk, index) => (
            <Text key={index} as="p" variant="bodySm">
              • {perk}
            </Text>
          ))}
        </Box>
      </Box>
      
      <Box width="50%">
        <TierBadge
          tierName={suggestedTier}
          asCard
          useGradient
          cashbackPercent={suggestedBenefits.cashback}
          onClick={onUpgrade}
        >
          <Badge tone="success">Upgrade</Badge>
        </TierBadge>
        
        <Box paddingBlockStart="200">
          {suggestedBenefits.perks.map((perk, index) => (
            <Text key={index} as="p" variant="bodySm" tone="success">
              • {perk}
            </Text>
          ))}
        </Box>
      </Box>
    </InlineStack>
  );
}