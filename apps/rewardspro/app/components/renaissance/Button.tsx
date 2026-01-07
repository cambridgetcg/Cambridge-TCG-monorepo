/**
 * Button Components - "The Merchant's Seal"
 *
 * Renaissance-styled buttons with metallic gradients and embossed effects.
 * Primary actions feature ducal gold, secondary uses velvet navy.
 */

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Icon to display before text */
  icon?: React.ReactNode;
  /** Icon to display after text */
  iconAfter?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Full width */
  fullWidth?: boolean;
  /** Children */
  children: React.ReactNode;
}

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #d69e2e 0%, #ed8936 100%)',
    color: 'white',
    border: 'none',
    boxShadow: '0 2px 4px rgba(214, 158, 46, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  },
  secondary: {
    background: 'var(--color-cream, #fefcf8)',
    color: 'var(--color-merchant-blue, #1a365d)',
    border: '1px solid rgba(45, 55, 72, 0.15)',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-velvet-navy, #2c5282)',
    border: '1px solid transparent',
    boxShadow: 'none',
  },
  danger: {
    background: 'linear-gradient(135deg, #c53030 0%, #e53e3e 100%)',
    color: 'white',
    border: 'none',
    boxShadow: '0 2px 4px rgba(197, 48, 48, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  },
  success: {
    background: 'linear-gradient(135deg, #276749 0%, #38a169 100%)',
    color: 'white',
    border: 'none',
    boxShadow: '0 2px 4px rgba(39, 103, 73, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: {
    padding: '6px 12px',
    fontSize: '12px',
    borderRadius: 'var(--radius-sm, 4px)',
  },
  md: {
    padding: '10px 18px',
    fontSize: '14px',
    borderRadius: 'var(--radius-md, 6px)',
  },
  lg: {
    padding: '14px 24px',
    fontSize: '16px',
    borderRadius: 'var(--radius-lg, 8px)',
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 150ms ease-out',
    opacity: isDisabled ? 0.6 : 1,
    width: fullWidth ? '100%' : 'auto',
    textDecoration: 'none',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      style={buttonStyle}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <span
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 600ms linear infinite',
          }}
        />
      ) : icon}
      <span>{children}</span>
      {!loading && iconAfter}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .btn:hover:not(:disabled) {
          filter: brightness(1.05);
          transform: translateY(-1px);
        }
        .btn:active:not(:disabled) {
          filter: brightness(0.95);
          transform: translateY(0);
        }
        .btn--ghost:hover:not(:disabled) {
          background: rgba(45, 55, 72, 0.05) !important;
          border-color: rgba(45, 55, 72, 0.1) !important;
        }
        .btn--secondary:hover:not(:disabled) {
          border-color: rgba(45, 55, 72, 0.25) !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
        }
      `}</style>
    </button>
  );
}

/**
 * Icon-only button variant
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  label,
  className = '',
  ...props
}: Omit<ButtonProps, 'children' | 'iconAfter'> & {
  icon: React.ReactNode;
  label: string;
}) {
  const sizeMap = { sm: '28px', md: '36px', lg: '44px' };
  const iconSizeMap = { sm: '14px', md: '18px', lg: '22px' };

  return (
    <button
      className={`icon-btn icon-btn--${variant} ${className}`}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizeMap[size],
        height: sizeMap[size],
        padding: 0,
        fontSize: iconSizeMap[size],
        borderRadius: 'var(--radius-md, 6px)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        transition: 'all 150ms ease-out',
        fontFamily: 'inherit',
        ...variantStyles[variant],
        opacity: props.disabled ? 0.6 : 1,
      }}
      {...props}
    >
      {icon}

      <style>{`
        .icon-btn:hover:not(:disabled) {
          filter: brightness(1.05);
        }
        .icon-btn--ghost:hover:not(:disabled) {
          background: rgba(45, 55, 72, 0.08) !important;
        }
      `}</style>
    </button>
  );
}

/**
 * Button Group for related actions
 */
export function ButtonGroup({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`btn-group ${className}`}
      role="group"
      style={{
        display: 'inline-flex',
      }}
    >
      {children}

      <style>{`
        .btn-group > .btn {
          border-radius: 0;
        }
        .btn-group > .btn:first-child {
          border-radius: var(--radius-md, 6px) 0 0 var(--radius-md, 6px);
        }
        .btn-group > .btn:last-child {
          border-radius: 0 var(--radius-md, 6px) var(--radius-md, 6px) 0;
        }
        .btn-group > .btn:not(:last-child) {
          border-right: 1px solid rgba(255, 255, 255, 0.2);
        }
        .btn-group > .btn--secondary:not(:last-child) {
          border-right-color: rgba(45, 55, 72, 0.15);
        }
      `}</style>
    </div>
  );
}

/**
 * Link styled as button
 */
export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  fullWidth = false,
  className = '',
  children,
  ...props
}: Omit<ButtonProps, 'loading' | 'onClick'> & {
  href: string;
}) {
  const linkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 150ms ease-out',
    width: fullWidth ? '100%' : 'auto',
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  return (
    <a
      href={href}
      className={`btn btn--${variant} btn--${size} ${className}`}
      style={linkStyle}
      {...props}
    >
      {icon}
      <span>{children}</span>
      {iconAfter}
    </a>
  );
}

/**
 * Text link with subtle styling
 */
export function TextLink({
  href,
  onClick,
  children,
  className = '',
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const Tag = href ? 'a' : 'button';

  return (
    <Tag
      href={href}
      onClick={onClick}
      className={`text-link ${className}`}
      style={{
        color: 'var(--color-ducal-gold, #d69e2e)',
        textDecoration: 'none',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'color 150ms ease-out',
        background: 'none',
        border: 'none',
        padding: 0,
        fontFamily: 'inherit',
        fontSize: 'inherit',
      }}
    >
      {children}

      <style>{`
        .text-link:hover {
          color: var(--color-amber-flame, #ed8936) !important;
          text-decoration: underline;
        }
      `}</style>
    </Tag>
  );
}
