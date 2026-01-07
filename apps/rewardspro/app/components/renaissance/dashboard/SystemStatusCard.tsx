/**
 * System Status Card - Renaissance Dashboard Component
 *
 * Displays system component status with illuminated styling.
 * Part of "The Merchant's Constellation" design system.
 */

import React from 'react';

export type SystemStatus = 'operational' | 'degraded' | 'critical' | 'inactive' | 'needs_setup';

export interface SystemStatusCardProps {
  /** Component name */
  title: string;
  /** Current status */
  status: SystemStatus;
  /** Icon to display */
  icon: React.ReactNode;
  /** Status metrics */
  metrics: Array<{
    label: string;
    value: string | number;
  }>;
  /** Description text */
  description?: string;
  /** Click handler */
  onClick?: () => void;
}

const statusConfig: Record<SystemStatus, {
  color: string;
  bg: string;
  label: string;
  glow: string;
}> = {
  operational: {
    color: 'var(--color-success, #276749)',
    bg: 'var(--color-success-bg, #f0fff4)',
    label: 'Operational',
    glow: 'rgba(39, 103, 73, 0.15)',
  },
  degraded: {
    color: 'var(--color-amber-flame, #ed8936)',
    bg: 'rgba(237, 137, 54, 0.1)',
    label: 'Degraded',
    glow: 'rgba(237, 137, 54, 0.15)',
  },
  critical: {
    color: 'var(--color-error, #c53030)',
    bg: 'var(--color-error-bg, #fff5f5)',
    label: 'Critical',
    glow: 'rgba(197, 48, 48, 0.15)',
  },
  inactive: {
    color: 'var(--color-velvet-navy, #2c5282)',
    bg: 'rgba(44, 82, 130, 0.08)',
    label: 'Inactive',
    glow: 'transparent',
  },
  needs_setup: {
    color: 'var(--color-ducal-gold, #d69e2e)',
    bg: 'rgba(214, 158, 46, 0.1)',
    label: 'Needs Setup',
    glow: 'rgba(214, 158, 46, 0.15)',
  },
};

export function SystemStatusCard({
  title,
  status,
  icon,
  metrics,
  description,
  onClick,
}: SystemStatusCardProps) {
  const config = statusConfig[status];

  return (
    <div
      className="renaissance-status-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        background: 'var(--color-cream, #fefcf8)',
        border: '1px solid rgba(45, 55, 72, 0.08)',
        borderRadius: 'var(--radius-lg, 8px)',
        padding: 'var(--space-lg, 21px)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 250ms ease-out',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Status glow indicator */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: config.color,
          opacity: status === 'operational' ? 1 : 0.8,
        }}
      />

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-md, 13px)',
      }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: config.bg,
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: '18px',
          }}
        >
          {icon}
        </div>

        {/* Status badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            color: config.color,
            background: config.bg,
            borderRadius: '9999px',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Title */}
      <h3 style={{
        fontSize: 'var(--text-base, 16px)',
        fontWeight: 600,
        color: 'var(--color-merchant-blue, #1a365d)',
        margin: '0 0 var(--space-md, 13px) 0',
      }}>
        {title}
      </h3>

      {/* Metrics */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xs, 5px)',
        marginBottom: 'var(--space-md, 13px)',
      }}>
        {metrics.map((metric, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 'var(--text-sm, 13px)',
            }}
          >
            <span style={{ color: 'var(--color-velvet-navy, #2c5282)', opacity: 0.7 }}>
              {metric.label}:
            </span>
            <span style={{
              fontWeight: 500,
              color: 'var(--color-merchant-blue, #1a365d)',
            }}>
              {metric.value}
            </span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{
        height: '1px',
        background: 'rgba(45, 55, 72, 0.08)',
        margin: 'var(--space-sm, 8px) 0',
      }} />

      {/* Description */}
      {description && (
        <p style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.7,
          margin: 0,
          lineHeight: 1.5,
        }}>
          {description}
        </p>
      )}

      <style>{`
        .renaissance-status-card:hover {
          box-shadow:
            0 4px 12px rgba(0, 0, 0, 0.08),
            0 0 0 1px rgba(214, 158, 46, 0.1);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}

/**
 * Grid container for status cards
 */
export function SystemStatusGrid({
  children,
  columns = 3,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={`renaissance-status-grid renaissance-status-grid--${columns}col`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 'var(--space-md, 13px)',
      }}
    >
      {children}

      <style>{`
        @media (max-width: 900px) {
          .renaissance-status-grid--3col,
          .renaissance-status-grid--4col {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          .renaissance-status-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Overall status banner
 */
export function SystemHealthBanner({
  status,
  uptime,
  incidents,
}: {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: string;
  incidents: number;
}) {
  const statusMessages = {
    healthy: 'All Systems Operational',
    degraded: 'Some Systems Degraded',
    critical: 'System Issues Detected',
  };

  const statusColors = {
    healthy: {
      bg: 'linear-gradient(135deg, rgba(39, 103, 73, 0.08) 0%, rgba(72, 187, 120, 0.05) 100%)',
      border: 'rgba(39, 103, 73, 0.2)',
      text: 'var(--color-success, #276749)',
      icon: '✓',
    },
    degraded: {
      bg: 'linear-gradient(135deg, rgba(237, 137, 54, 0.08) 0%, rgba(246, 173, 85, 0.05) 100%)',
      border: 'rgba(237, 137, 54, 0.2)',
      text: 'var(--color-amber-flame, #ed8936)',
      icon: '⚠',
    },
    critical: {
      bg: 'linear-gradient(135deg, rgba(197, 48, 48, 0.08) 0%, rgba(252, 129, 129, 0.05) 100%)',
      border: 'rgba(197, 48, 48, 0.2)',
      text: 'var(--color-error, #c53030)',
      icon: '✕',
    },
  };

  const config = statusColors[status];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 'var(--radius-lg, 8px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
        <span
          style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: config.text,
            color: 'white',
            borderRadius: '50%',
            fontSize: '14px',
            fontWeight: 700,
          }}
        >
          {config.icon}
        </span>
        <span style={{
          fontSize: 'var(--text-base, 16px)',
          fontWeight: 600,
          color: config.text,
        }}>
          {statusMessages[status]}
        </span>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-lg, 21px)',
        fontSize: 'var(--text-sm, 13px)',
        color: 'var(--color-velvet-navy, #2c5282)',
      }}>
        <span>Uptime: <strong>{uptime}</strong></span>
        <span style={{ opacity: 0.3 }}>•</span>
        <span>{incidents} active incident{incidents !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
