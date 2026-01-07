/**
 * Activity Feed Component - "The Chronicle"
 *
 * Displays a timeline of customer activities and events.
 * Features illuminated manuscript-style markers and flowing transitions.
 */

import React from 'react';
import type { TierLevel } from './TierBadge';

export interface ActivityItemData {
  /** Unique identifier */
  id: string;
  /** Activity type */
  type: 'purchase' | 'redemption' | 'tier_change' | 'reward' | 'signup' | 'referral';
  /** Activity title */
  title: string;
  /** Activity description */
  description?: string;
  /** Associated amount (if applicable) */
  amount?: number;
  /** Currency code */
  currency?: string;
  /** Timestamp */
  timestamp: Date | string;
  /** Associated tier (for tier changes) */
  tier?: TierLevel;
  /** Custom icon override */
  icon?: React.ReactNode;
}

export interface ActivityItemProps extends ActivityItemData {
  /** Whether this is the last item (hides connector line) */
  isLast?: boolean;
}

const activityIcons: Record<ActivityItemData['type'], string> = {
  purchase: '🛒',
  redemption: '🪙',
  tier_change: '⭐',
  reward: '🎁',
  signup: '👋',
  referral: '🤝',
};

const activityColors: Record<ActivityItemData['type'], string> = {
  purchase: 'var(--color-success, #276749)',
  redemption: 'var(--color-ducal-gold, #d69e2e)',
  tier_change: 'var(--tier-gold, #ecc94b)',
  reward: 'var(--color-amber-flame, #ed8936)',
  signup: 'var(--color-velvet-navy, #2c5282)',
  referral: 'var(--color-success, #276749)',
};

function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function ActivityItem({
  type,
  title,
  description,
  amount,
  currency = 'USD',
  timestamp,
  icon,
  isLast = false,
}: ActivityItemProps) {
  const color = activityColors[type];
  const displayIcon = icon || activityIcons[type];

  return (
    <div
      className="activity-item"
      style={{
        display: 'flex',
        gap: 'var(--space-md, 13px)',
        position: 'relative',
        paddingBottom: isLast ? 0 : 'var(--space-lg, 21px)',
      }}
    >
      {/* Timeline connector */}
      {!isLast && (
        <div
          style={{
            position: 'absolute',
            left: '15px',
            top: '32px',
            bottom: 0,
            width: '2px',
            background: 'rgba(45, 55, 72, 0.08)',
          }}
        />
      )}

      {/* Icon marker */}
      <div
        style={{
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color}15`,
          borderRadius: '50%',
          fontSize: '14px',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {displayIcon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-sm, 8px)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--text-sm, 13px)',
                fontWeight: 500,
                color: 'var(--color-merchant-blue, #1a365d)',
                lineHeight: 1.4,
              }}
            >
              {title}
            </div>
            {description && (
              <div
                style={{
                  fontSize: 'var(--text-xs, 11px)',
                  color: 'var(--color-velvet-navy, #2c5282)',
                  opacity: 0.7,
                  marginTop: '2px',
                }}
              >
                {description}
              </div>
            )}
          </div>

          {/* Amount or timestamp */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              flexShrink: 0,
            }}
          >
            {amount !== undefined && (
              <div
                style={{
                  fontSize: 'var(--text-sm, 13px)',
                  fontWeight: 600,
                  color: type === 'redemption'
                    ? 'var(--color-ducal-gold, #d69e2e)'
                    : type === 'purchase'
                      ? 'var(--color-success, #276749)'
                      : 'var(--color-merchant-blue, #1a365d)',
                }}
              >
                {type === 'purchase' ? '+' : type === 'redemption' ? '-' : ''}
                {formatCurrency(amount, currency)}
              </div>
            )}
            <div
              style={{
                fontSize: 'var(--text-xs, 11px)',
                color: 'rgba(44, 82, 130, 0.6)',
                marginTop: amount !== undefined ? '2px' : 0,
              }}
            >
              {formatTimestamp(timestamp)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ActivityFeedProps {
  /** Activity items to display */
  items: ActivityItemData[];
  /** Maximum items to show (0 = unlimited) */
  limit?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Show "View all" link */
  showViewAll?: boolean;
  /** Handler for "View all" click */
  onViewAll?: () => void;
  /** Additional CSS class */
  className?: string;
}

export function ActivityFeed({
  items,
  limit = 0,
  emptyMessage = 'No activity yet',
  showViewAll = false,
  onViewAll,
  className = '',
}: ActivityFeedProps) {
  const displayItems = limit > 0 ? items.slice(0, limit) : items;

  if (items.length === 0) {
    return (
      <div
        className={`activity-feed activity-feed--empty ${className}`}
        style={{
          padding: 'var(--space-xl, 34px)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: 'var(--space-sm, 8px)' }}>
          📜
        </div>
        <div
          style={{
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--color-velvet-navy, #2c5282)',
            opacity: 0.7,
          }}
        >
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={`activity-feed ${className}`}>
      {displayItems.map((item, index) => (
        <ActivityItem
          key={item.id}
          {...item}
          isLast={index === displayItems.length - 1 && !showViewAll}
        />
      ))}

      {showViewAll && items.length > limit && (
        <button
          onClick={onViewAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-xs, 5px)',
            width: '100%',
            padding: 'var(--space-sm, 8px)',
            marginTop: 'var(--space-sm, 8px)',
            background: 'transparent',
            border: '1px dashed rgba(45, 55, 72, 0.15)',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--color-velvet-navy, #2c5282)',
            cursor: 'pointer',
            transition: 'all 150ms ease-out',
            fontFamily: 'inherit',
          }}
        >
          View all {items.length} activities
          <span style={{ opacity: 0.5 }}>→</span>
        </button>
      )}
    </div>
  );
}

/**
 * Compact activity indicator for headers
 */
export function ActivityIndicator({
  count,
  hasNew = false,
}: {
  count: number;
  hasNew?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-xs, 5px)',
        padding: 'var(--space-xs, 5px) var(--space-sm, 8px)',
        background: hasNew
          ? 'rgba(214, 158, 46, 0.1)'
          : 'rgba(45, 55, 72, 0.05)',
        borderRadius: '9999px',
        fontSize: 'var(--text-xs, 11px)',
        color: hasNew
          ? 'var(--color-ducal-gold, #d69e2e)'
          : 'var(--color-velvet-navy, #2c5282)',
        fontWeight: 500,
      }}
    >
      <span>📜</span>
      <span>{count}</span>
      {hasNew && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--color-ducal-gold, #d69e2e)',
          }}
        />
      )}
    </div>
  );
}
