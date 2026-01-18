import { Link, useLocation } from "@remix-run/react";
import { Box, InlineStack, Text } from "@shopify/polaris";

interface NavItem {
  label: string;
  to: string;
}

interface SecondaryNavProps {
  items: NavItem[];
}

/**
 * Secondary navigation component for section layouts.
 * Uses Polaris styling to match Shopify admin aesthetic.
 * Highlights the active route based on current location.
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
    <Box
      paddingBlockEnd="400"
      paddingBlockStart="200"
      borderBlockEndWidth="025"
      borderColor="border"
    >
      <InlineStack gap="400">
        {items.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                textDecoration: 'none',
                paddingBottom: '8px',
                borderBottom: active ? '2px solid var(--p-color-border-interactive)' : '2px solid transparent',
              }}
            >
              <Text
                as="span"
                variant="bodyMd"
                fontWeight={active ? 'semibold' : 'regular'}
                tone={active ? undefined : 'subdued'}
              >
                {item.label}
              </Text>
            </Link>
          );
        })}
      </InlineStack>
    </Box>
  );
}
