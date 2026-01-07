/**
 * Settings Section Components - Renaissance Admin
 *
 * Enhanced settings sections with Renaissance styling.
 * Designed to work alongside Polaris components.
 */

import React from 'react';

export interface SettingsSectionProps {
  /** Section title */
  title: string;
  /** Section description */
  description?: string;
  /** Icon for the section */
  icon?: React.ReactNode;
  /** Badge to show (e.g., "Pro", "New") */
  badge?: {
    text: string;
    tone: 'info' | 'success' | 'warning' | 'attention';
  };
  /** Collapsible state */
  collapsible?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Children content */
  children: React.ReactNode;
  /** Additional CSS class */
  className?: string;
}

export function SettingsSection({
  title,
  description,
  icon,
  badge,
  collapsible = false,
  defaultCollapsed = false,
  children,
  className = '',
}: SettingsSectionProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  const badgeTones: Record<string, { color: string; bg: string }> = {
    info: { color: 'var(--color-velvet-navy, #2c5282)', bg: 'rgba(44, 82, 130, 0.1)' },
    success: { color: 'var(--color-success, #276749)', bg: 'rgba(39, 103, 73, 0.1)' },
    warning: { color: 'var(--color-amber-flame, #ed8936)', bg: 'rgba(237, 137, 54, 0.1)' },
    attention: { color: 'var(--color-ducal-gold, #d69e2e)', bg: 'rgba(214, 158, 46, 0.1)' },
  };

  return (
    <section
      className={`renaissance-settings-section ${className}`}
      style={{
        background: 'var(--color-cream, #fefcf8)',
        border: '1px solid rgba(45, 55, 72, 0.08)',
        borderRadius: 'var(--radius-xl, 12px)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
        style={{
          padding: 'var(--space-lg, 21px)',
          cursor: collapsible ? 'pointer' : 'default',
          borderBottom: isCollapsed ? 'none' : '1px solid rgba(45, 55, 72, 0.06)',
          transition: 'background 150ms ease-out',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md, 13px)' }}>
            {icon && (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(214, 158, 46, 0.08)',
                  borderRadius: 'var(--radius-md, 6px)',
                  fontSize: '18px',
                }}
              >
                {icon}
              </div>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm, 8px)' }}>
                <h3 style={{
                  fontSize: 'var(--text-lg, 18px)',
                  fontWeight: 600,
                  color: 'var(--color-merchant-blue, #1a365d)',
                  margin: 0,
                }}>
                  {title}
                </h3>
                {badge && (
                  <span
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: badgeTones[badge.tone].color,
                      background: badgeTones[badge.tone].bg,
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {badge.text}
                  </span>
                )}
              </div>
              {description && (
                <p style={{
                  fontSize: 'var(--text-sm, 13px)',
                  color: 'var(--color-velvet-navy, #2c5282)',
                  opacity: 0.7,
                  margin: 'var(--space-xs, 5px) 0 0 0',
                }}>
                  {description}
                </p>
              )}
            </div>
          </div>

          {collapsible && (
            <span
              style={{
                fontSize: '20px',
                color: 'var(--color-velvet-navy, #2c5282)',
                opacity: 0.5,
                transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 250ms ease-out',
              }}
            >
              ▼
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div style={{ padding: 'var(--space-lg, 21px)' }}>
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * Settings field row component
 */
export function SettingsField({
  label,
  description,
  helpText,
  required = false,
  error,
  children,
}: {
  label: string;
  description?: string;
  helpText?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field" style={{ marginBottom: 'var(--space-lg, 21px)' }}>
      <label style={{ display: 'block', marginBottom: 'var(--space-xs, 5px)' }}>
        <span style={{
          fontSize: 'var(--text-sm, 13px)',
          fontWeight: 600,
          color: 'var(--color-merchant-blue, #1a365d)',
        }}>
          {label}
          {required && (
            <span style={{ color: 'var(--color-error, #c53030)', marginLeft: '4px' }}>*</span>
          )}
        </span>
      </label>

      {description && (
        <p style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.7,
          margin: '0 0 var(--space-sm, 8px) 0',
        }}>
          {description}
        </p>
      )}

      {children}

      {error && (
        <p style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-error, #c53030)',
          margin: 'var(--space-xs, 5px) 0 0 0',
        }}>
          {error}
        </p>
      )}

      {helpText && !error && (
        <p style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.6,
          margin: 'var(--space-xs, 5px) 0 0 0',
        }}>
          {helpText}
        </p>
      )}
    </div>
  );
}

/**
 * Settings divider with optional label
 */
export function SettingsDivider({ label }: { label?: string }) {
  if (label) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-md, 13px)',
          margin: 'var(--space-lg, 21px) 0',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: 'rgba(45, 55, 72, 0.08)' }} />
        <span style={{
          fontSize: 'var(--text-xs, 11px)',
          color: 'var(--color-velvet-navy, #2c5282)',
          opacity: 0.6,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(45, 55, 72, 0.08)' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '1px',
        background: 'rgba(45, 55, 72, 0.08)',
        margin: 'var(--space-lg, 21px) 0',
      }}
    />
  );
}

/**
 * Settings action bar (for save/cancel buttons)
 */
export function SettingsActionBar({
  children,
  sticky = false,
}: {
  children: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <div
      className="settings-action-bar"
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 'var(--space-sm, 8px)',
        padding: 'var(--space-md, 13px) var(--space-lg, 21px)',
        background: sticky ? 'var(--color-cream, #fefcf8)' : 'transparent',
        borderTop: '1px solid rgba(45, 55, 72, 0.08)',
        position: sticky ? 'sticky' : 'static',
        bottom: 0,
        zIndex: sticky ? 10 : 'auto',
        boxShadow: sticky ? '0 -4px 12px rgba(0, 0, 0, 0.05)' : 'none',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Settings info callout
 */
export function SettingsCallout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'tip';
  title?: string;
  children: React.ReactNode;
}) {
  const toneConfig = {
    info: {
      icon: 'ℹ️',
      bg: 'rgba(44, 82, 130, 0.05)',
      border: 'rgba(44, 82, 130, 0.15)',
      color: 'var(--color-velvet-navy, #2c5282)',
    },
    success: {
      icon: '✓',
      bg: 'rgba(39, 103, 73, 0.05)',
      border: 'rgba(39, 103, 73, 0.15)',
      color: 'var(--color-success, #276749)',
    },
    warning: {
      icon: '⚠️',
      bg: 'rgba(237, 137, 54, 0.05)',
      border: 'rgba(237, 137, 54, 0.15)',
      color: 'var(--color-amber-flame, #ed8936)',
    },
    tip: {
      icon: '💡',
      bg: 'rgba(214, 158, 46, 0.05)',
      border: 'rgba(214, 158, 46, 0.15)',
      color: 'var(--color-ducal-gold, #d69e2e)',
    },
  };

  const config = toneConfig[tone];

  return (
    <div
      style={{
        padding: 'var(--space-md, 13px)',
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 'var(--radius-md, 6px)',
        marginBottom: 'var(--space-md, 13px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm, 8px)' }}>
        <span style={{ fontSize: '16px' }}>{config.icon}</span>
        <div>
          {title && (
            <strong style={{
              display: 'block',
              fontSize: 'var(--text-sm, 13px)',
              color: config.color,
              marginBottom: 'var(--space-xs, 5px)',
            }}>
              {title}
            </strong>
          )}
          <div style={{
            fontSize: 'var(--text-sm, 13px)',
            color: 'var(--color-merchant-blue, #1a365d)',
            lineHeight: 1.5,
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
