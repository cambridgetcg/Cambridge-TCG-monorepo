/**
 * Card Components - "The Merchant's Ledger"
 *
 * Renaissance-styled card variants for content containment.
 * Based on Dutch Golden Age painting frames and parchment.
 */

import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Card header content */
  header?: React.ReactNode;
  /** Card title text */
  title?: string;
  /** Card subtitle text */
  subtitle?: string;
  /** Card footer content */
  footer?: React.ReactNode;
  /** Hover lift effect */
  hoverable?: boolean;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Base Card component with subtle shadow and parchment background
 */
export function Card({
  children,
  className = '',
  header,
  title,
  subtitle,
  footer,
  hoverable = false,
  onClick,
}: CardProps) {
  const baseStyles: React.CSSProperties = {
    background: 'var(--color-cream, #fefcf8)',
    border: '1px solid rgba(45, 55, 72, 0.08)',
    borderRadius: 'var(--radius-lg, 8px)',
    padding: 'var(--space-lg, 21px)',
    boxShadow: 'var(--shadow-1)',
    transition: 'box-shadow 250ms ease-out, transform 250ms ease-out',
    cursor: onClick ? 'pointer' : 'default',
  };

  const hoverableStyles: React.CSSProperties = hoverable ? {
    cursor: 'pointer',
  } : {};

  return (
    <div
      className={`card ${hoverable ? 'card--elevated' : ''} ${className}`}
      style={{ ...baseStyles, ...hoverableStyles }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(header || title) && (
        <div className="card__header" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-md, 13px)',
          paddingBottom: 'var(--space-md, 13px)',
          borderBottom: '1px solid rgba(45, 55, 72, 0.06)',
        }}>
          <div>
            {title && (
              <h3 className="card__title" style={{
                fontSize: 'var(--text-lg, 18px)',
                fontWeight: 600,
                color: 'var(--color-merchant-blue, #1a365d)',
                margin: 0,
              }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="card__subtitle" style={{
                fontSize: 'var(--text-sm, 13px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.7,
                margin: 'var(--space-xs, 5px) 0 0',
              }}>
                {subtitle}
              </p>
            )}
          </div>
          {header}
        </div>
      )}

      <div className="card__content">
        {children}
      </div>

      {footer && (
        <div className="card__footer" style={{
          marginTop: 'var(--space-lg, 21px)',
          paddingTop: 'var(--space-md, 13px)',
          borderTop: '1px solid rgba(45, 55, 72, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 'var(--space-sm, 8px)',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Gilded Card - For achievements and highlights
 * Features subtle gold tint and gilded border
 */
export function CardGilded({ children, className = '', ...props }: CardProps) {
  return (
    <Card
      className={`card--gilded ${className}`}
      {...props}
    >
      <style>{`
        .card--gilded {
          border: 1px solid rgba(214, 158, 46, 0.2) !important;
          background: linear-gradient(
            180deg,
            var(--color-cream, #fefcf8) 0%,
            rgba(214, 158, 46, 0.03) 100%
          ) !important;
          position: relative;
        }
        .card--gilded::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
          pointer-events: none;
        }
      `}</style>
      {children}
    </Card>
  );
}

/**
 * Spotlight Card - Maximum attention
 * Features glowing gold shadow with pulse animation
 */
export function CardSpotlight({ children, className = '', ...props }: CardProps) {
  return (
    <Card
      className={`card--spotlight ${className}`}
      {...props}
    >
      <style>{`
        .card--spotlight {
          border-color: rgba(214, 158, 46, 0.3) !important;
          box-shadow:
            0 0 0 1px rgba(214, 158, 46, 0.1),
            0 4px 16px rgba(214, 158, 46, 0.15),
            0 8px 32px rgba(214, 158, 46, 0.10) !important;
          animation: pulse-glow 2s ease-in-out infinite;
        }
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(214, 158, 46, 0.1),
              0 4px 16px rgba(214, 158, 46, 0.10);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(214, 158, 46, 0.2),
              0 4px 24px rgba(214, 158, 46, 0.20);
          }
        }
      `}</style>
      {children}
    </Card>
  );
}

/**
 * Parchment Card - Subtle texture
 * Features paper-like texture overlay
 */
export function CardParchment({ children, className = '', ...props }: CardProps) {
  return (
    <Card
      className={`card--parchment ${className}`}
      {...props}
    >
      <style>{`
        .card--parchment {
          background:
            linear-gradient(180deg, var(--color-cream, #fefcf8) 0%, var(--color-candlelight, #faf5eb) 100%) !important;
        }
      `}</style>
      {children}
    </Card>
  );
}
