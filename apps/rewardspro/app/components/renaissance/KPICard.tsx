/**
 * KPI Card Component - "Illuminated Metrics"
 *
 * Displays key performance indicators with Renaissance styling.
 * Features illuminated top border on hover and optional progress bar.
 */

import React from 'react';

export interface KPICardProps {
  /** Display value (e.g., "$12,450", "847", "23%") */
  value: string | number;
  /** Label describing the metric */
  label: string;
  /** Icon to display (emoji or component) */
  icon?: React.ReactNode;
  /** Trend indicator */
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
  };
  /** Progress percentage (0-100) */
  progress?: number;
  /** Whether the card is in an active/highlighted state */
  active?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

export function KPICard({
  value,
  label,
  icon,
  trend,
  progress,
  active = false,
  className = '',
  onClick,
}: KPICardProps) {
  const getTrendColor = () => {
    if (!trend) return {};
    switch (trend.direction) {
      case 'up':
        return {
          color: 'var(--color-success, #276749)',
          background: 'var(--color-success-bg, #f0fff4)',
        };
      case 'down':
        return {
          color: 'var(--color-error, #c53030)',
          background: 'var(--color-error-bg, #fff5f5)',
        };
      default:
        return {
          color: 'var(--color-velvet-navy, #2c5282)',
          background: 'rgba(44, 82, 130, 0.1)',
        };
    }
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    switch (trend.direction) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '→';
    }
  };

  return (
    <div
      className={`kpi-card ${active ? 'kpi-card--active' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        position: 'relative',
        padding: 'var(--space-lg, 21px)',
        background: 'var(--color-cream, #fefcf8)',
        border: '1px solid rgba(45, 55, 72, 0.08)',
        borderRadius: 'var(--radius-lg, 8px)',
        boxShadow: 'var(--shadow-1)',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 250ms ease-out',
      }}
    >
      {/* Illuminated top border */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, #d69e2e 0%, #ed8936 100%)',
          opacity: active ? 1 : 0,
          transition: 'opacity 250ms ease-out',
        }}
      />

      {/* Icon */}
      {icon && (
        <div
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(214, 158, 46, 0.1)',
            borderRadius: 'var(--radius-md, 6px)',
            marginBottom: 'var(--space-md, 13px)',
            fontSize: 'var(--text-xl, 21px)',
          }}
        >
          {icon}
        </div>
      )}

      {/* Value */}
      <div
        style={{
          fontSize: 'var(--text-3xl, 34px)',
          fontWeight: 700,
          color: 'var(--color-merchant-blue, #1a365d)',
          lineHeight: 1.25,
          marginBottom: 'var(--space-xs, 5px)',
        }}
      >
        {value}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 'var(--text-sm, 13px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          textTransform: 'uppercase',
          letterSpacing: '0.025em',
        }}
      >
        {label}
      </div>

      {/* Trend */}
      {trend && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-xs, 5px)',
            fontSize: 'var(--text-sm, 13px)',
            fontWeight: 500,
            marginTop: 'var(--space-sm, 8px)',
            padding: 'var(--space-xs, 5px) var(--space-sm, 8px)',
            borderRadius: '9999px',
            ...getTrendColor(),
          }}
        >
          <span>{getTrendIcon()}</span>
          <span>{trend.value}</span>
        </div>
      )}

      {/* Progress Bar */}
      {progress !== undefined && (
        <div
          style={{
            marginTop: 'var(--space-md, 13px)',
            height: '4px',
            background: 'rgba(45, 55, 72, 0.08)',
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, progress))}%`,
              background: 'linear-gradient(90deg, #d69e2e 0%, #ed8936 100%)',
              borderRadius: '9999px',
              transition: 'width 400ms ease-out',
            }}
          />
        </div>
      )}

      {/* Hover styles */}
      <style>{`
        .kpi-card:hover {
          box-shadow:
            0 2px 4px rgba(0, 0, 0, 0.04),
            0 4px 8px rgba(0, 0, 0, 0.08),
            0 1px 2px rgba(0, 0, 0, 0.04) !important;
        }
        .kpi-card:hover > div:first-child {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
