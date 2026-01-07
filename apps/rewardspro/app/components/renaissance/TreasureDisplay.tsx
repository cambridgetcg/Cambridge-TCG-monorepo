/**
 * Treasure Display Component - "The Treasure Chest"
 *
 * Displays store credit balance with rich visual treatment.
 * Features glowing gold accents and ambient animation.
 */

import React from 'react';

export interface TreasureDisplayProps {
  /** Store credit balance */
  balance: number;
  /** Currency symbol */
  currency?: string;
  /** Currency code for formatting */
  currencyCode?: string;
  /** Amount earned (all time) */
  earned?: number;
  /** Amount redeemed (all time) */
  redeemed?: number;
  /** Amount pending */
  pending?: number;
  /** Compact display mode */
  compact?: boolean;
  /** Additional CSS class */
  className?: string;
}

export function TreasureDisplay({
  balance,
  currency = '$',
  currencyCode = 'USD',
  earned,
  redeemed,
  pending,
  compact = false,
  className = '',
}: TreasureDisplayProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  if (compact) {
    return (
      <div
        className={`treasure-display treasure-display--compact ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-sm, 8px)',
          padding: 'var(--space-sm, 8px) var(--space-md, 13px)',
          background: 'rgba(214, 158, 46, 0.08)',
          borderRadius: 'var(--radius-md, 6px)',
          border: '1px solid rgba(214, 158, 46, 0.15)',
        }}
      >
        <span style={{ fontSize: '18px' }}>🪙</span>
        <span style={{
          fontWeight: 600,
          color: 'var(--color-merchant-blue, #1a365d)',
        }}>
          {formatCurrency(balance)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`treasure-display ${className}`}
      style={{
        position: 'relative',
        padding: 'var(--space-xl, 34px)',
        background: `linear-gradient(
          135deg,
          rgba(214, 158, 46, 0.05) 0%,
          rgba(237, 137, 54, 0.03) 100%
        )`,
        border: '1px solid rgba(214, 158, 46, 0.2)',
        borderRadius: 'var(--radius-xl, 12px)',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Ambient glow animation */}
      <div
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `radial-gradient(
            circle at center,
            rgba(214, 158, 46, 0.08) 0%,
            transparent 50%
          )`,
          animation: 'rotate 20s linear infinite',
          pointerEvents: 'none',
        }}
      />

      {/* Icon */}
      <div style={{
        position: 'relative',
        fontSize: '48px',
        marginBottom: 'var(--space-md, 13px)',
      }}>
        🪙
      </div>

      {/* Balance */}
      <div style={{
        position: 'relative',
        fontSize: 'var(--text-4xl, 42px)',
        fontWeight: 700,
        color: 'var(--color-merchant-blue, #1a365d)',
        lineHeight: 1.2,
      }}>
        {formatCurrency(balance)}
      </div>

      {/* Label */}
      <div style={{
        position: 'relative',
        fontSize: 'var(--text-sm, 13px)',
        color: 'var(--color-velvet-navy, #2c5282)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginTop: 'var(--space-xs, 5px)',
      }}>
        Available Credit
      </div>

      {/* Stats */}
      {(earned !== undefined || redeemed !== undefined || pending !== undefined) && (
        <div style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          gap: 'var(--space-xl, 34px)',
          marginTop: 'var(--space-lg, 21px)',
          paddingTop: 'var(--space-lg, 21px)',
          borderTop: '1px dashed rgba(214, 158, 46, 0.3)',
        }}>
          {earned !== undefined && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 'var(--text-lg, 18px)',
                fontWeight: 600,
                color: 'var(--color-success, #276749)',
              }}>
                +{formatCurrency(earned)}
              </div>
              <div style={{
                fontSize: 'var(--text-xs, 11px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.8,
              }}>
                Earned
              </div>
            </div>
          )}

          {redeemed !== undefined && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 'var(--text-lg, 18px)',
                fontWeight: 600,
                color: 'var(--color-merchant-blue, #1a365d)',
              }}>
                -{formatCurrency(redeemed)}
              </div>
              <div style={{
                fontSize: 'var(--text-xs, 11px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.8,
              }}>
                Redeemed
              </div>
            </div>
          )}

          {pending !== undefined && pending > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 'var(--text-lg, 18px)',
                fontWeight: 600,
                color: 'var(--color-amber-flame, #ed8936)',
              }}>
                {formatCurrency(pending)}
              </div>
              <div style={{
                fontSize: 'var(--text-xs, 11px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.8,
              }}>
                Pending
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * Inline treasure indicator for headers/nav
 */
export function TreasureInline({
  balance,
  currency = '$',
  onClick,
}: {
  balance: number;
  currency?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        background: 'linear-gradient(135deg, rgba(214, 158, 46, 0.1) 0%, rgba(237, 137, 54, 0.05) 100%)',
        border: '1px solid rgba(214, 158, 46, 0.2)',
        borderRadius: '9999px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 150ms ease-out',
        fontFamily: 'inherit',
      }}
    >
      <span>🪙</span>
      <span style={{
        fontWeight: 600,
        color: 'var(--color-merchant-blue, #1a365d)',
        fontSize: '14px',
      }}>
        {currency}{balance.toFixed(2)}
      </span>
    </button>
  );
}

/**
 * Cashback preview (shows what user will earn)
 */
export function CashbackPreview({
  amount,
  percentage,
  orderTotal,
  currency = '$',
}: {
  amount: number;
  percentage: number;
  orderTotal: number;
  currency?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-md, 13px)',
      background: 'var(--color-success-bg, #f0fff4)',
      border: '1px solid rgba(39, 103, 73, 0.2)',
      borderRadius: 'var(--radius-md, 6px)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-sm, 8px)',
      }}>
        <span style={{ fontSize: '20px' }}>✨</span>
        <div>
          <div style={{
            fontSize: 'var(--text-sm, 13px)',
            fontWeight: 500,
            color: 'var(--color-success, #276749)',
          }}>
            You'll earn {currency}{amount.toFixed(2)} cashback
          </div>
          <div style={{
            fontSize: 'var(--text-xs, 11px)',
            color: 'var(--color-velvet-navy, #2c5282)',
          }}>
            {percentage}% of {currency}{orderTotal.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
