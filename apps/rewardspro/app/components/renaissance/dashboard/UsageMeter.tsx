/**
 * Usage Meter Component - Renaissance Dashboard
 *
 * Displays plan usage with progress indicator.
 * Part of "The Merchant's Constellation" design system.
 */

import React from 'react';

export interface UsageMeterProps {
  /** Current usage amount */
  used: number;
  /** Plan limit */
  limit: number;
  /** Label for the metric */
  label: string;
  /** Current plan name */
  planName: string;
  /** Days remaining in cycle */
  daysRemaining?: number;
  /** Projected usage by end of period */
  projected?: number;
  /** Currency formatting */
  formatAsCurrency?: boolean;
  /** Currency code */
  currencyCode?: string;
  /** Click handler for upgrade */
  onUpgrade?: () => void;
}

export function UsageMeter({
  used,
  limit,
  label,
  planName,
  daysRemaining,
  projected,
  formatAsCurrency = false,
  currencyCode = 'USD',
  onUpgrade,
}: UsageMeterProps) {
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = percentage >= 80;
  const isOverLimit = percentage >= 100;
  const willExceed = projected && projected > limit;

  const formatValue = (value: number) => {
    if (formatAsCurrency) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 0,
      }).format(value);
    }
    return value.toLocaleString();
  };

  // Determine color based on usage
  const getProgressColor = () => {
    if (isOverLimit) return 'var(--color-error, #c53030)';
    if (isNearLimit) return 'var(--color-amber-flame, #ed8936)';
    return 'linear-gradient(90deg, var(--color-ducal-gold, #d69e2e) 0%, var(--color-amber-flame, #ed8936) 100%)';
  };

  const getStatusColor = () => {
    if (isOverLimit) return { text: 'var(--color-error, #c53030)', bg: 'rgba(197, 48, 48, 0.1)' };
    if (isNearLimit) return { text: 'var(--color-amber-flame, #ed8936)', bg: 'rgba(237, 137, 54, 0.1)' };
    return { text: 'var(--color-success, #276749)', bg: 'rgba(39, 103, 73, 0.1)' };
  };

  const statusColors = getStatusColor();

  return (
    <div
      className="usage-meter"
      style={{
        background: 'var(--color-cream, #fefcf8)',
        border: '1px solid rgba(45, 55, 72, 0.08)',
        borderRadius: 'var(--radius-xl, 12px)',
        padding: 'var(--space-lg, 21px)',
        boxShadow: 'var(--shadow-1)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-lg, 21px)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 8px)' }}>
            <span style={{ fontSize: '20px' }}>💳</span>
            <h3 style={{
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 600,
              color: 'var(--color-merchant-blue, #1a365d)',
              margin: 0,
            }}>
              {planName.replace('RewardsPro', 'Rewards')}
            </h3>
          </div>
          {daysRemaining !== undefined && (
            <span style={{
              fontSize: 'var(--text-sm, 13px)',
              color: 'var(--color-velvet-navy, #2c5282)',
              opacity: 0.7,
            }}>
              {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining in billing cycle
            </span>
          )}
        </div>

        <span
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 600,
            color: statusColors.text,
            background: statusColors.bg,
            borderRadius: '9999px',
            textTransform: 'uppercase',
          }}
        >
          {isOverLimit ? 'Over Limit' : isNearLimit ? 'Near Limit' : 'Active'}
        </span>
      </div>

      {/* Usage display */}
      <div style={{ marginBottom: 'var(--space-md, 13px)' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 'var(--space-xs, 5px)',
        }}>
          <span style={{
            fontSize: 'var(--text-3xl, 34px)',
            fontWeight: 700,
            color: 'var(--color-merchant-blue, #1a365d)',
          }}>
            {formatValue(used)}
          </span>
          <span style={{
            fontSize: 'var(--text-base, 16px)',
            color: 'var(--color-velvet-navy, #2c5282)',
            opacity: 0.7,
          }}>
            of {formatValue(limit)} {label}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: '10px',
            background: 'rgba(45, 55, 72, 0.08)',
            borderRadius: '9999px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percentage}%`,
              background: getProgressColor(),
              borderRadius: '9999px',
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {/* Projected marker */}
          {projected && projected !== used && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: `${Math.min(100, Math.round((projected / limit) * 100))}%`,
                width: '2px',
                height: '100%',
                background: willExceed
                  ? 'var(--color-error, #c53030)'
                  : 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.5,
              }}
            />
          )}
        </div>

        {/* Usage percentage */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'var(--space-xs, 5px)',
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.7,
        }}>
          <span>{percentage}% used</span>
          <span>{formatValue(limit - used)} remaining</span>
        </div>
      </div>

      {/* Projected usage warning */}
      {willExceed && (
        <div
          style={{
            padding: 'var(--space-sm, 8px) var(--space-md, 13px)',
            background: 'rgba(237, 137, 54, 0.08)',
            border: '1px solid rgba(237, 137, 54, 0.2)',
            borderRadius: 'var(--radius-md, 6px)',
            marginBottom: 'var(--space-md, 13px)',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-sm, 8px)',
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--color-amber-flame, #ed8936)',
          }}>
            <span>⚠️</span>
            <span>
              <strong>Projected: {formatValue(projected)}</strong> — You may exceed your limit this month
            </span>
          </div>
        </div>
      )}

      {/* Upgrade CTA */}
      {(isNearLimit || willExceed) && onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            width: '100%',
            padding: 'var(--space-sm, 8px) var(--space-md, 13px)',
            background: 'linear-gradient(135deg, #d69e2e 0%, #ed8936 100%)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 'var(--text-sm, 13px)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms ease-out',
            boxShadow: '0 2px 4px rgba(214, 158, 46, 0.3)',
          }}
        >
          Upgrade Plan for More {label}
        </button>
      )}
    </div>
  );
}

/**
 * Compact usage indicator for headers
 */
export function UsageIndicator({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const isNearLimit = percentage >= 80;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm, 8px)',
        padding: 'var(--space-xs, 5px) var(--space-sm, 8px)',
        background: isNearLimit
          ? 'rgba(237, 137, 54, 0.1)'
          : 'rgba(45, 55, 72, 0.05)',
        borderRadius: 'var(--radius-md, 6px)',
      }}
    >
      <span style={{
        fontSize: 'var(--text-sm, 13px)',
        fontWeight: 500,
        color: isNearLimit
          ? 'var(--color-amber-flame, #ed8936)'
          : 'var(--color-merchant-blue, #1a365d)',
      }}>
        {used.toLocaleString()} / {limit.toLocaleString()}
      </span>
      <span style={{
        fontSize: 'var(--text-xs, 11px)',
        color: 'var(--color-velvet-navy, #2c5282)',
        opacity: 0.7,
      }}>
        {label}
      </span>
    </div>
  );
}
