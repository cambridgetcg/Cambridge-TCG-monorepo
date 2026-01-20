import { Link, useLocation } from "@remix-run/react";
import { Box, InlineStack, Text, Icon } from "@shopify/polaris";
import type { IconSource } from "@shopify/polaris";

interface NavItem {
  label: string;
  to: string;
  icon?: IconSource;
}

interface SecondaryNavProps {
  items: NavItem[];
}

/**
 * Secondary navigation component for section layouts.
 * Modern pill/segmented control style that matches contemporary UI patterns.
 * Highlights the active route with a distinct background.
 */
export function SecondaryNav({ items }: SecondaryNavProps) {
  const location = useLocation();

  // Determine active item - exact match or starts with (for nested routes)
  const isActive = (to: string) => {
    // Exact match for index routes
    if (location.pathname === to) return true;
    // For non-index routes, check if current path starts with the nav item path
    // but only if it's not the index (to avoid /app/members matching /app/members/tiers)
    if (to !== items[0]?.to && location.pathname.startsWith(to + '/')) return true;
    // Special case: if we're on a nested route and no other item matches, highlight the parent
    if (to === items[0]?.to) {
      const otherItemMatches = items.slice(1).some(item =>
        location.pathname === item.to || location.pathname.startsWith(item.to + '/')
      );
      if (!otherItemMatches && location.pathname.startsWith(to)) return true;
    }
    return false;
  };

  return (
    <Box paddingBlockEnd="400" paddingBlockStart="200">
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          backgroundColor: 'var(--p-color-bg-surface-secondary)',
          borderRadius: '10px',
        }}
      >
        {items.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: active ? 'var(--p-color-bg-surface)' : 'transparent',
                boxShadow: active ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)' : 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'var(--p-color-bg-surface-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {item.icon && (
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: active ? 'var(--p-color-icon-emphasis)' : 'var(--p-color-icon-secondary)'
                }}>
                  <Icon source={item.icon} />
                </span>
              )}
              <Text
                as="span"
                variant="bodySm"
                fontWeight={active ? 'semibold' : 'medium'}
                tone={active ? undefined : 'subdued'}
              >
                {item.label}
              </Text>
            </Link>
          );
        })}
      </div>
    </Box>
  );
}
