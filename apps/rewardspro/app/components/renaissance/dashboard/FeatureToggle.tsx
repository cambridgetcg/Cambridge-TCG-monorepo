/**
 * Feature Toggle Component - Renaissance Dashboard
 *
 * Styled feature toggle with plan gating support.
 * Part of "The Merchant's Constellation" design system.
 */

import React from 'react';

export interface FeatureToggleProps {
  /** Feature name displayed to user */
  name: string;
  /** Feature description */
  description: string;
  /** Icon for the feature */
  icon: React.ReactNode;
  /** Whether feature is enabled */
  enabled: boolean;
  /** Whether user can toggle (has entitlement) */
  canToggle: boolean;
  /** Required plan name if locked */
  requiredPlan?: string;
  /** Is feature currently active but user lost entitlement */
  isDowngraded?: boolean;
  /** Toggle callback */
  onToggle: (enabled: boolean) => void;
  /** Navigate to upgrade */
  onUpgrade?: () => void;
  /** Loading state */
  loading?: boolean;
}

export function FeatureToggle({
  name,
  description,
  icon,
  enabled,
  canToggle,
  requiredPlan,
  isDowngraded = false,
  onToggle,
  onUpgrade,
  loading = false,
}: FeatureToggleProps) {
  // Locked state - no entitlement and not enabled
  if (!canToggle && !enabled) {
    return (
      <div
        className="feature-toggle feature-toggle--locked"
        style={{
          padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
          background: 'rgba(45, 55, 72, 0.03)',
          borderRadius: 'var(--radius-lg, 8px)',
          border: '1px solid rgba(45, 55, 72, 0.08)',
          opacity: 0.85,
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
            {/* Locked icon container */}
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md, 6px)',
                background: 'rgba(45, 55, 72, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.5,
              }}
            >
              🔒
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 8px)' }}>
                <span style={{
                  fontSize: 'var(--text-base, 16px)',
                  fontWeight: 600,
                  color: 'var(--color-merchant-blue, #1a365d)',
                }}>
                  {name}
                </span>
                {requiredPlan && (
                  <span
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'var(--color-ducal-gold, #d69e2e)',
                      background: 'rgba(214, 158, 46, 0.1)',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {requiredPlan}
                  </span>
                )}
              </div>
              <span style={{
                fontSize: 'var(--text-sm, 13px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.7,
              }}>
                Upgrade to {requiredPlan} to unlock this feature
              </span>
            </div>
          </div>

          {/* Upgrade button */}
          {onUpgrade && (
            <button
              onClick={onUpgrade}
              style={{
                padding: '8px 16px',
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
              Upgrade
            </button>
          )}
        </div>
      </div>
    );
  }

  // Warning state - enabled but lost entitlement (downgraded)
  if (!canToggle && enabled) {
    return (
      <div
        className="feature-toggle feature-toggle--warning"
        style={{
          padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
          background: 'linear-gradient(135deg, rgba(237, 137, 54, 0.08) 0%, rgba(246, 173, 85, 0.05) 100%)',
          borderRadius: 'var(--radius-lg, 8px)',
          border: '1px solid rgba(237, 137, 54, 0.25)',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md, 6px)',
                background: 'rgba(237, 137, 54, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              {icon}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 8px)' }}>
                <span style={{
                  fontSize: 'var(--text-base, 16px)',
                  fontWeight: 600,
                  color: 'var(--color-merchant-blue, #1a365d)',
                }}>
                  {name}
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--color-amber-flame, #ed8936)',
                    background: 'rgba(237, 137, 54, 0.15)',
                    borderRadius: '9999px',
                    textTransform: 'uppercase',
                  }}
                >
                  Plan Required
                </span>
              </div>
              <span style={{
                fontSize: 'var(--text-sm, 13px)',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.8,
              }}>
                Active but your plan doesn't include this. Upgrade or disable.
              </span>
            </div>
          </div>

          {/* Toggle (can only disable) */}
          <Toggle
            enabled={enabled}
            onChange={() => onToggle(false)}
            disabled={loading}
          />
        </div>
      </div>
    );
  }

  // Normal state - has entitlement, full toggle capability
  return (
    <div
      className="feature-toggle"
      style={{
        padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
        background: enabled
          ? 'linear-gradient(135deg, rgba(39, 103, 73, 0.04) 0%, var(--color-cream, #fefcf8) 100%)'
          : 'var(--color-cream, #fefcf8)',
        borderRadius: 'var(--radius-lg, 8px)',
        border: `1px solid ${enabled ? 'rgba(39, 103, 73, 0.15)' : 'rgba(45, 55, 72, 0.08)'}`,
        transition: 'all 250ms ease-out',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md, 6px)',
              background: enabled
                ? 'rgba(39, 103, 73, 0.1)'
                : 'rgba(45, 55, 72, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              transition: 'background 250ms ease-out',
            }}
          >
            {icon}
          </div>

          <div>
            <span style={{
              fontSize: 'var(--text-base, 16px)',
              fontWeight: 600,
              color: 'var(--color-merchant-blue, #1a365d)',
              display: 'block',
            }}>
              {name}
            </span>
            <span style={{
              fontSize: 'var(--text-sm, 13px)',
              color: 'var(--color-velvet-navy, #2c5282)',
              opacity: 0.7,
            }}>
              {description}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
          {/* Status badge */}
          <span
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              color: enabled
                ? 'var(--color-success, #276749)'
                : 'var(--color-velvet-navy, #2c5282)',
              background: enabled
                ? 'rgba(39, 103, 73, 0.1)'
                : 'rgba(45, 55, 72, 0.08)',
              borderRadius: '9999px',
              textTransform: 'uppercase',
              transition: 'all 250ms ease-out',
            }}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>

          {/* Toggle */}
          <Toggle
            enabled={enabled}
            onChange={() => onToggle(!enabled)}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Styled toggle switch
 */
function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: '52px',
        height: '28px',
        borderRadius: '14px',
        background: enabled
          ? 'linear-gradient(135deg, var(--color-success, #276749) 0%, #38a169 100%)'
          : 'rgba(45, 55, 72, 0.25)',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 150ms ease-out',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '26px' : '2px',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          transition: 'left 150ms ease-out',
        }}
      />
    </button>
  );
}

/**
 * Feature Manager section wrapper
 */
export function FeatureManagerSection({
  title,
  description,
  activeCount,
  totalCount,
  children,
}: {
  title: string;
  description: string;
  activeCount: number;
  totalCount: number;
  children: React.ReactNode;
}) {
  const allActive = activeCount === totalCount;
  const mostActive = activeCount >= Math.ceil(totalCount / 2);

  return (
    <div
      className="feature-manager-section"
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
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-sm, 8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 8px)' }}>
          <span style={{ fontSize: '20px' }}>⚙️</span>
          <h2 style={{
            fontSize: 'var(--text-lg, 18px)',
            fontWeight: 600,
            color: 'var(--color-merchant-blue, #1a365d)',
            margin: 0,
          }}>
            {title}
          </h2>
        </div>

        {/* Active count badge */}
        <span
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            color: allActive
              ? 'var(--color-success, #276749)'
              : mostActive
                ? 'var(--color-velvet-navy, #2c5282)'
                : 'var(--color-amber-flame, #ed8936)',
            background: allActive
              ? 'rgba(39, 103, 73, 0.1)'
              : mostActive
                ? 'rgba(44, 82, 130, 0.1)'
                : 'rgba(237, 137, 54, 0.1)',
            borderRadius: '9999px',
          }}
        >
          {activeCount}/{totalCount} Active
        </span>
      </div>

      {/* Description */}
      <p style={{
        fontSize: 'var(--text-sm, 13px)',
        color: 'var(--color-velvet-navy, #2c5282)',
        opacity: 0.7,
        margin: '0 0 var(--space-lg, 21px) 0',
      }}>
        {description}
      </p>

      {/* Divider */}
      <div style={{
        height: '1px',
        background: 'rgba(45, 55, 72, 0.08)',
        marginBottom: 'var(--space-md, 13px)',
      }} />

      {/* Features */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm, 8px)',
      }}>
        {children}
      </div>
    </div>
  );
}
