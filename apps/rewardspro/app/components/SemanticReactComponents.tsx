/**
 * Semantic React Components for RewardsPro
 * Production-ready components implementing semantic design principles
 * Follows Shopify Polaris patterns with WCAG 2.1 compliance
 */

import React, { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useEffect,
  useRef,
  useMemo
} from 'react';
import {
  Badge,
  Button,
  Card,
  Icon,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  ProgressBar,
  Tooltip,
  Modal,
  TextField,
  FormLayout,
  SkeletonBodyText,
  SkeletonDisplayText,
} from '@shopify/polaris';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  InfoIcon,
  AlertTriangleIcon,
  PersonIcon,
  StarIcon,
  CashDollarIcon,
  CalendarIcon,
  ClockIcon,
  // TrophyIcon doesn't exist, using StarFilledIcon instead
  StarFilledIcon as TrophyIcon,
  StarFilledIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from '@shopify/polaris-icons';
import type { Currency } from '@prisma/client';

// ============================================
// 1. SEMANTIC CONTEXT PROVIDER
// ============================================

interface SemanticContextValue {
  locale: string;
  currency: Currency;
  isRTL: boolean;
  timezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  reducedMotion: boolean;
  highContrast: boolean;
}

const SemanticContext = createContext<SemanticContextValue>({
  locale: 'en-US',
  currency: 'USD' as Currency,
  isRTL: false,
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  reducedMotion: false,
  highContrast: false,
});

export const useSemanticContext = () => useContext(SemanticContext);

export const SemanticProvider: React.FC<{
  children: React.ReactNode;
  value: SemanticContextValue;
}> = ({ children, value }) => {
  useEffect(() => {
    // Apply RTL to document
    if (value.isRTL) {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
    }
    
    // Apply high contrast mode
    if (value.highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    }
  }, [value.isRTL, value.highContrast]);

  return (
    <SemanticContext.Provider value={value}>
      {children}
    </SemanticContext.Provider>
  );
};

// ============================================
// 2. SEMANTIC STATUS INDICATOR
// ============================================

interface StatusIndicatorProps {
  status: 'success' | 'warning' | 'critical' | 'info' | 'neutral';
  children: React.ReactNode;
  label?: string;
  pulse?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  children,
  label,
  pulse = false,
  size = 'medium',
}) => {
  const statusConfig = {
    success: {
      icon: CheckCircleIcon,
      tone: 'success' as const,
      ariaLabel: 'Success status',
      color: 'var(--p-color-text-success)',
    },
    warning: {
      icon: AlertTriangleIcon,
      tone: 'warning' as const,
      ariaLabel: 'Warning status',
      color: 'var(--p-color-text-warning)',
    },
    critical: {
      icon: AlertCircleIcon,
      tone: 'critical' as const,
      ariaLabel: 'Critical status',
      color: 'var(--p-color-text-critical)',
    },
    info: {
      icon: InfoIcon,
      tone: 'info' as const,
      ariaLabel: 'Information',
      color: 'var(--p-color-text-info)',
    },
    neutral: {
      icon: InfoIcon,
      tone: undefined,
      ariaLabel: 'Neutral status',
      color: 'var(--p-color-text-subdued)',
    },
  };

  const config = statusConfig[status];
  const sizeMap = {
    small: 12,
    medium: 16,
    large: 20,
  };

  return (
    <InlineStack gap="200" align="center">
      <Box
        role="status"
        aria-label={label || config.ariaLabel}
        style={{
          animation: pulse ? 'pulse 2s infinite' : undefined,
        }}
      >
        <Icon source={config.icon} tone={config.tone} />
      </Box>
      <Text as="span" tone={config.tone}>
        {children}
      </Text>
    </InlineStack>
  );
};

// ============================================
// 3. SEMANTIC TIER BADGE
// ============================================

interface TierBadgeProps {
  tierName: string;
  tierLevel: number;
  cashbackPercentage: number;
  isCurrentTier?: boolean;
  nextTierName?: string;
  progressToNext?: number;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tierName,
  tierLevel,
  cashbackPercentage,
  isCurrentTier = false,
  nextTierName,
  progressToNext,
}) => {
  const getTierTone = (level: number) => {
    if (level >= 4) return 'success';
    if (level >= 2) return 'info';
    return undefined;
  };

  return (
    <BlockStack gap="200">
      <InlineStack gap="200" align="center">
        <Icon source={TrophyIcon} tone={getTierTone(tierLevel)} />
        <Badge
          tone={getTierTone(tierLevel)}
          progress={isCurrentTier ? 'complete' : undefined}
        >
          {tierName}
        </Badge>
        <Text as="span" variant="bodySm" tone="subdued">
          {cashbackPercentage}% cashback
        </Text>
      </InlineStack>
      
      {isCurrentTier && nextTierName && progressToNext !== undefined && (
        <Box
          role="progressbar"
          aria-label={`Progress to ${nextTierName} tier`}
          aria-valuenow={progressToNext}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <ProgressBar 
            progress={progressToNext} 
            tone="emphasis"
            size="small"
          />
          <Text as="span" variant="bodySm" tone="subdued">
            {progressToNext}% to {nextTierName}
          </Text>
        </Box>
      )}
    </BlockStack>
  );
};

// ============================================
// 4. SEMANTIC MONEY DISPLAY
// ============================================

interface MoneyDisplayProps {
  amount: number;
  currency?: Currency;
  showSign?: boolean;
  tone?: 'positive' | 'negative' | 'neutral';
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

export const MoneyDisplay: React.FC<MoneyDisplayProps> = ({
  amount,
  currency = 'USD',
  showSign = false,
  tone = 'neutral',
  size = 'medium',
  label,
}) => {
  const { locale } = useSemanticContext();
  
  const formattedAmount = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return formatter.format(Math.abs(amount));
  }, [amount, currency, locale]);

  const getIcon = () => {
    if (tone === 'positive' || (showSign && amount > 0)) {
      return ArrowUpIcon;
    }
    if (tone === 'negative' || (showSign && amount < 0)) {
      return ArrowDownIcon;
    }
    return CashDollarIcon;
  };

  const getTone = () => {
    if (tone === 'positive' || amount > 0) return 'success';
    if (tone === 'negative' || amount < 0) return 'critical';
    return undefined;
  };

  const sizeVariant = {
    small: 'bodySm' as const,
    medium: 'bodyMd' as const,
    large: 'bodyLg' as const,
  };

  return (
    <InlineStack gap="100" align="center">
      {showSign && <Icon source={getIcon()} tone={getTone()} />}
      <Text
        as="span"
        variant={sizeVariant[size]}
        tone={getTone()}
        fontWeight="semibold"
      >
        <span aria-label={label || `Amount: ${formattedAmount}`}>
          {showSign && amount > 0 && '+'}
          {amount < 0 && '-'}
          {formattedAmount}
        </span>
      </Text>
    </InlineStack>
  );
};

// ============================================
// 5. SEMANTIC DATE DISPLAY
// ============================================

interface DateDisplayProps {
  date: Date | string;
  format?: 'short' | 'medium' | 'long' | 'relative';
  showTime?: boolean;
  showIcon?: boolean;
}

export const DateDisplay: React.FC<DateDisplayProps> = ({
  date,
  format = 'medium',
  showTime = false,
  showIcon = false,
}) => {
  const { locale, timezone, dateFormat } = useSemanticContext();
  
  const formattedDate = useMemo(() => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (format === 'relative') {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const diff = (dateObj.getTime() - Date.now()) / 1000;
      
      if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), 'second');
      if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
      if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
      if (Math.abs(diff) < 604800) return rtf.format(Math.round(diff / 86400), 'day');
      return rtf.format(Math.round(diff / 604800), 'week');
    }
    
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: format === 'short' ? '2-digit' : 'numeric',
      month: format === 'long' ? 'long' : format === 'short' ? 'numeric' : 'short',
      day: 'numeric',
      ...(showTime && {
        hour: 'numeric',
        minute: '2-digit',
        hour12: locale.startsWith('en'),
      }),
    };
    
    return new Intl.DateTimeFormat(locale, options).format(dateObj);
  }, [date, format, locale, timezone, showTime]);

  return (
    <InlineStack gap="100" align="center">
      {showIcon && (
        <Icon 
          source={showTime ? ClockIcon : CalendarIcon} 
          tone="subdued"
        />
      )}
      <Text as="span" variant="bodyMd">
        <time dateTime={typeof date === 'string' ? date : date.toISOString()}>
          {formattedDate}
        </time>
      </Text>
    </InlineStack>
  );
};

// ============================================
// 6. SEMANTIC CUSTOMER AVATAR
// ============================================

interface CustomerAvatarProps {
  name: string;
  email?: string;
  size?: 'small' | 'medium' | 'large';
  showInitials?: boolean;
  status?: 'active' | 'inactive' | 'vip';
}

export const CustomerAvatar: React.FC<CustomerAvatarProps> = ({
  name,
  email,
  size = 'medium',
  showInitials = true,
  status = 'active',
}) => {
  const initials = useMemo(() => {
    if (!showInitials) return '';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [name, showInitials]);

  const sizeMap = {
    small: 32,
    medium: 40,
    large: 56,
  };

  const statusColor = {
    active: 'var(--p-color-bg-success-subdued)',
    inactive: 'var(--p-color-bg-subdued)',
    vip: 'var(--p-color-bg-warning-subdued)',
  };

  return (
    <InlineStack gap="200" align="center">
      <Box
        role="img"
        aria-label={`Avatar for ${name}`}
        style={{
          width: sizeMap[size],
          height: sizeMap[size],
          borderRadius: '50%',
          backgroundColor: statusColor[status],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {showInitials ? (
          <Text as="span" variant="bodySm" fontWeight="medium">
            {initials}
          </Text>
        ) : (
          <Icon source={PersonIcon} />
        )}
        
        {status === 'vip' && (
          <Box
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
            }}
          >
            <Icon source={StarIcon} tone="warning" />
          </Box>
        )}
      </Box>
      
      <BlockStack gap="0">
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {name}
        </Text>
        {email && (
          <Text as="span" variant="bodySm" tone="subdued">
            {email}
          </Text>
        )}
      </BlockStack>
    </InlineStack>
  );
};

// ============================================
// 7. SEMANTIC FORM FIELD
// ============================================

interface SemanticFieldProps {
  label: string;
  type: 'text' | 'email' | 'number' | 'currency' | 'percentage';
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const SemanticField: React.FC<SemanticFieldProps> = ({
  label,
  type,
  value,
  onChange,
  error,
  helpText,
  required = false,
  disabled = false,
  placeholder,
  min,
  max,
  step,
}) => {
  const { currency } = useSemanticContext();
  const inputRef = useRef<HTMLInputElement>(null);
  
  const getInputMode = () => {
    switch (type) {
      case 'number':
      case 'currency':
      case 'percentage':
        return 'decimal';
      case 'email':
        return 'email';
      default:
        return 'text';
    }
  };

  const getPrefix = () => {
    if (type === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).formatToParts(0).find(part => part.type === 'currency')?.value;
    }
    return undefined;
  };

  const getSuffix = () => {
    if (type === 'percentage') return '%';
    return undefined;
  };

  const validateInput = useCallback((val: string) => {
    if (type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        return 'Please enter a valid email address';
      }
    }
    
    if ((type === 'number' || type === 'currency' || type === 'percentage') && val) {
      const num = parseFloat(val);
      if (isNaN(num)) {
        return 'Please enter a valid number';
      }
      if (min !== undefined && num < min) {
        return `Value must be at least ${min}`;
      }
      if (max !== undefined && num > max) {
        return `Value must not exceed ${max}`;
      }
    }
    
    return undefined;
  }, [type, min, max]);

  const handleChange = useCallback((newValue: string) => {
    // Auto-format for percentage
    if (type === 'percentage' && newValue) {
      const num = parseFloat(newValue);
      if (!isNaN(num)) {
        newValue = Math.min(100, Math.max(0, num)).toString();
      }
    }
    
    onChange(newValue);
  }, [type, onChange]);

  return (
    <TextField
      label={label}
      value={value}
      onChange={handleChange}
      error={error || validateInput(value)}
      helpText={helpText}
      requiredIndicator={required}
      disabled={disabled}
      placeholder={placeholder}
      prefix={getPrefix()}
      suffix={getSuffix()}
      type={type === 'email' ? 'email' : 'text'}
      inputMode={getInputMode()}
      min={min}
      max={max}
      step={step}
      autoComplete={type === 'email' ? 'email' : undefined}
      aria-required={required}
      aria-invalid={!!error}
      aria-describedby={helpText ? `${label}-help` : undefined}
    />
  );
};

// ============================================
// 8. SEMANTIC LOADING SKELETON
// ============================================

interface LoadingSkeletonProps {
  type: 'card' | 'list' | 'form' | 'dashboard';
  lines?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  type,
  lines = 3,
}) => {
  const { reducedMotion } = useSemanticContext();
  
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <Card>
            <BlockStack gap="300">
              <SkeletonDisplayText size="small" />
              <SkeletonBodyText lines={lines} />
            </BlockStack>
          </Card>
        );
      
      case 'list':
        return (
          <BlockStack gap="200">
            {Array.from({ length: lines }).map((_, i) => (
              <Card key={i}>
                <InlineStack gap="200" align="center">
                  <Box style={{ width: 40, height: 40 }}>
                    <SkeletonDisplayText size="small" />
                  </Box>
                  <Box style={{ flex: 1 }}>
                    <SkeletonBodyText lines={1} />
                  </Box>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        );
      
      case 'form':
        return (
          <FormLayout>
            {Array.from({ length: lines }).map((_, i) => (
              <BlockStack key={i} gap="100">
                <SkeletonDisplayText size="small" />
                <Box style={{ height: 36 }}>
                  <SkeletonBodyText lines={1} />
                </Box>
              </BlockStack>
            ))}
          </FormLayout>
        );
      
      case 'dashboard':
        return (
          <BlockStack gap="400">
            <InlineStack gap="400">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <BlockStack gap="200">
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={2} />
                  </BlockStack>
                </Card>
              ))}
            </InlineStack>
            <Card>
              <SkeletonBodyText lines={lines} />
            </Card>
          </BlockStack>
        );
      
      default:
        return <SkeletonBodyText lines={lines} />;
    }
  };
  
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading content"
      style={{
        animation: reducedMotion ? 'none' : undefined,
      }}
    >
      {renderSkeleton()}
      <span className="visually-hidden">Loading...</span>
    </div>
  );
};

// ============================================
// 9. SEMANTIC EMPTY STATE
// ============================================

interface EmptyStateProps {
  heading: string;
  message: string;
  action?: {
    content: string;
    onAction: () => void;
  };
  illustration?: 'customers' | 'orders' | 'products' | 'analytics';
}

export const SemanticEmptyState: React.FC<EmptyStateProps> = ({
  heading,
  message,
  action,
  illustration = 'customers',
}) => {
  const illustrationIcons = {
    customers: PersonIcon,
    orders: CashDollarIcon,
    products: StarIcon,
    analytics: ChevronUpIcon,
  };
  
  return (
    <Card>
      <BlockStack gap="400" inlineAlign="center">
        <Box style={{ opacity: 0.5 }}>
          <Icon 
            source={illustrationIcons[illustration]} 
            tone="subdued"
          />
        </Box>
        
        <BlockStack gap="200" inlineAlign="center">
          <Text as="h2" variant="headingMd">
            {heading}
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
            {message}
          </Text>
        </BlockStack>
        
        {action && (
          <Button onClick={action.onAction} variant="primary">
            {action.content}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
};

// ============================================
// 10. SEMANTIC ANNOUNCEMENT
// ============================================

interface AnnouncementProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  persistent?: boolean;
}

export const SemanticAnnouncement: React.FC<AnnouncementProps> = ({
  message,
  type,
  persistent = false,
}) => {
  const [isVisible, setIsVisible] = useState(true);
  
  useEffect(() => {
    if (!persistent) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [persistent]);
  
  if (!isVisible) return null;
  
  const toneMap = {
    success: 'success' as const,
    error: 'critical' as const,
    info: 'info' as const,
    warning: 'warning' as const,
  };
  
  return (
    <div
      role="alert"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <Banner
        tone={toneMap[type]}
        onDismiss={persistent ? () => setIsVisible(false) : undefined}
      >
        {message}
      </Banner>
    </div>
  );
};

// All components are already exported individually above