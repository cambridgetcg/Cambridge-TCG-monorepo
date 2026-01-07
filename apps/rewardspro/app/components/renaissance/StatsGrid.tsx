/**
 * Stats Grid Component - "The Merchant's Ledger"
 *
 * Grid-based stat display for dashboards and summaries.
 * Features responsive layout with Renaissance styling.
 */

import React from 'react';

export interface StatItemData {
  /** Unique key */
  key: string;
  /** Display value */
  value: string | number;
  /** Label describing the stat */
  label: string;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Color accent */
  color?: 'default' | 'gold' | 'success' | 'warning' | 'danger';
  /** Format as currency */
  asCurrency?: boolean;
  /** Currency code for formatting */
  currencyCode?: string;
  /** Optional subtext */
  subtext?: string;
  /** Optional trend */
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
}

export interface StatItemProps extends StatItemData {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const colorMap: Record<string, { accent: string; bg: string }> = {
  default: {
    accent: 'var(--color-merchant-blue, #1a365d)',
    bg: 'rgba(45, 55, 72, 0.05)',
  },
  gold: {
    accent: 'var(--color-ducal-gold, #d69e2e)',
    bg: 'rgba(214, 158, 46, 0.08)',
  },
  success: {
    accent: 'var(--color-success, #276749)',
    bg: 'var(--color-success-bg, #f0fff4)',
  },
  warning: {
    accent: 'var(--color-amber-flame, #ed8936)',
    bg: 'rgba(237, 137, 54, 0.08)',
  },
  danger: {
    accent: 'var(--color-error, #c53030)',
    bg: 'var(--color-error-bg, #fff5f5)',
  },
};

const sizeStyles: Record<string, { value: string; label: string; padding: string }> = {
  sm: {
    value: 'var(--text-xl, 21px)',
    label: 'var(--text-xs, 11px)',
    padding: 'var(--space-sm, 8px) var(--space-md, 13px)',
  },
  md: {
    value: 'var(--text-2xl, 26px)',
    label: 'var(--text-sm, 13px)',
    padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
  },
  lg: {
    value: 'var(--text-3xl, 34px)',
    label: 'var(--text-base, 16px)',
    padding: 'var(--space-lg, 21px) var(--space-xl, 34px)',
  },
};

function formatValue(
  value: string | number,
  asCurrency?: boolean,
  currencyCode: string = 'USD'
): string {
  if (typeof value === 'string') return value;

  if (asCurrency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  return value.toLocaleString();
}

export function StatItem({
  value,
  label,
  icon,
  color = 'default',
  asCurrency = false,
  currencyCode = 'USD',
  subtext,
  trend,
  size = 'md',
}: StatItemProps) {
  const colors = colorMap[color];
  const sizes = sizeStyles[size];

  return (
    <div
      className="stat-item"
      style={{
        padding: sizes.padding,
        background: 'var(--color-cream, #fefcf8)',
        border: '1px solid rgba(45, 55, 72, 0.08)',
        borderRadius: 'var(--radius-lg, 8px)',
      }}
    >
      {/* Header with icon */}
      {icon && (
        <div
          style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bg,
            borderRadius: 'var(--radius-md, 6px)',
            marginBottom: 'var(--space-sm, 8px)',
            fontSize: '18px',
          }}
        >
          {icon}
        </div>
      )}

      {/* Value */}
      <div
        style={{
          fontSize: sizes.value,
          fontWeight: 700,
          color: colors.accent,
          lineHeight: 1.2,
        }}
      >
        {formatValue(value, asCurrency, currencyCode)}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: sizes.label,
          color: 'var(--color-velvet-navy, #2c5282)',
          marginTop: 'var(--space-xs, 5px)',
        }}
      >
        {label}
      </div>

      {/* Subtext or Trend */}
      {(subtext || trend) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-xs, 5px)',
            marginTop: 'var(--space-xs, 5px)',
            fontSize: 'var(--text-xs, 11px)',
          }}
        >
          {trend && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px 6px',
                borderRadius: '9999px',
                fontWeight: 500,
                color: trend.direction === 'up'
                  ? 'var(--color-success, #276749)'
                  : trend.direction === 'down'
                    ? 'var(--color-error, #c53030)'
                    : 'var(--color-velvet-navy, #2c5282)',
                background: trend.direction === 'up'
                  ? 'var(--color-success-bg, #f0fff4)'
                  : trend.direction === 'down'
                    ? 'var(--color-error-bg, #fff5f5)'
                    : 'rgba(45, 55, 72, 0.05)',
              }}
            >
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
              {trend.value}
            </span>
          )}
          {subtext && (
            <span style={{ color: 'rgba(44, 82, 130, 0.6)' }}>
              {subtext}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export interface StatsGridProps {
  /** Stats to display */
  stats: StatItemData[];
  /** Number of columns */
  columns?: 2 | 3 | 4;
  /** Size variant for all items */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS class */
  className?: string;
}

export function StatsGrid({
  stats,
  columns = 3,
  size = 'md',
  className = '',
}: StatsGridProps) {
  return (
    <div
      className={`stats-grid stats-grid--${columns}col ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 'var(--space-md, 13px)',
      }}
    >
      {stats.map((stat) => (
        <StatItem key={stat.key} {...stat} size={size} />
      ))}

      <style>{`
        @media (max-width: 768px) {
          .stats-grid--3col,
          .stats-grid--4col {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Inline stat display for compact areas
 */
export function StatInline({
  value,
  label,
  icon,
  color = 'default',
  asCurrency = false,
  currencyCode = 'USD',
}: Omit<StatItemData, 'key' | 'subtext' | 'trend'>) {
  const colors = colorMap[color];

  return (
    <div
      className="stat-inline"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm, 8px)',
      }}
    >
      {icon && (
        <span
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.bg,
            borderRadius: 'var(--radius-sm, 4px)',
            fontSize: '14px',
          }}
        >
          {icon}
        </span>
      )}
      <div>
        <div
          style={{
            fontSize: 'var(--text-lg, 18px)',
            fontWeight: 600,
            color: colors.accent,
            lineHeight: 1.2,
          }}
        >
          {formatValue(value, asCurrency, currencyCode)}
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--color-velvet-navy, #2c5282)',
            opacity: 0.7,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

/**
 * Summary row for totals
 */
export function StatsSummary({
  items,
  className = '',
}: {
  items: Array<{ label: string; value: string | number; highlight?: boolean }>;
  className?: string;
}) {
  return (
    <div
      className={`stats-summary ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
        background: 'rgba(45, 55, 72, 0.03)',
        borderRadius: 'var(--radius-md, 6px)',
        gap: 'var(--space-lg, 21px)',
      }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            textAlign: index === items.length - 1 ? 'right' : 'left',
            flex: index === items.length - 1 ? 'none' : 1,
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              color: 'var(--color-velvet-navy, #2c5282)',
              opacity: 0.7,
              marginBottom: '2px',
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontSize: item.highlight ? 'var(--text-xl, 21px)' : 'var(--text-base, 16px)',
              fontWeight: item.highlight ? 700 : 600,
              color: item.highlight
                ? 'var(--color-ducal-gold, #d69e2e)'
                : 'var(--color-merchant-blue, #1a365d)',
            }}
          >
            {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
