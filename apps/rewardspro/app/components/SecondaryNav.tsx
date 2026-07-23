import { Link, useLocation } from "@remix-run/react";
import { Icon, Text } from "@shopify/polaris";

import {
  matchesNavigationItem,
  type NavigationItem,
} from "~/navigation/registry";

interface SecondaryNavProps {
  ariaLabel: string;
  items: readonly NavigationItem[];
}

/**
 * Secondary navigation component for section layouts.
 * Uses explicit route matches so hidden sibling screens do not falsely
 * highlight the section overview.
 */
export function SecondaryNav({ ariaLabel, items }: SecondaryNavProps) {
  const location = useLocation();

  return (
    <nav className="rp-secondary-nav-boundary" aria-label={ariaLabel}>
      <div className="rp-secondary-nav-viewport">
        <div className="rp-secondary-nav">
          {items.map((item) => {
            const active = matchesNavigationItem(location.pathname, item);

            return (
              <Link
                key={item.to}
                className="rp-secondary-nav__link"
                to={item.to}
                aria-current={active ? "page" : undefined}
              >
                {item.icon ? (
                  <span className="rp-secondary-nav__icon" aria-hidden="true">
                    <Icon source={item.icon} />
                  </span>
                ) : null}
                <Text
                  as="span"
                  variant="bodySm"
                  fontWeight={active ? "semibold" : "medium"}
                >
                  {item.label}
                </Text>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
