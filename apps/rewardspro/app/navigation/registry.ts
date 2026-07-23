import type { IconSource } from "@shopify/polaris";
import {
  AutomationIcon,
  ChartVerticalIcon,
  EmailIcon,
  GiftCardIcon,
  PackageIcon,
  PersonIcon,
  ProductIcon,
  StarIcon,
  TargetIcon,
  ThemeTemplateIcon,
} from "@shopify/polaris-icons";

import { APP_ROUTES } from "./routes";

export type NavigationMatch = {
  path: string;
  end?: boolean;
};

export type NavigationItem = {
  label: string;
  to: string;
  icon?: IconSource;
  matches: readonly NavigationMatch[];
};

function item(
  label: string,
  to: string,
  options: {
    icon?: IconSource;
    matches?: readonly NavigationMatch[];
    end?: boolean;
  } = {},
): NavigationItem {
  return {
    label,
    to,
    icon: options.icon,
    matches: options.matches ?? [{ path: to, end: options.end }],
  };
}

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

/**
 * Match one navigation item without guessing that an unmatched child belongs
 * to the first tab. Hidden sibling routes intentionally leave every tab idle.
 */
export function matchesNavigationItem(
  pathname: string,
  navigationItem: NavigationItem,
): boolean {
  const currentPath = normalizePathname(pathname);

  return navigationItem.matches.some((match) => {
    const targetPath = normalizePathname(match.path);

    if (match.end) {
      return currentPath === targetPath;
    }

    return (
      currentPath === targetPath ||
      currentPath.startsWith(`${targetPath}/`)
    );
  });
}

export const HOME_NAVIGATION = item("Home", APP_ROUTES.DASHBOARD, {
  end: true,
});

export const PRIMARY_NAVIGATION = [
  item("Customers", APP_ROUTES.MEMBERS.ROOT),
  item("Loyalty program", APP_ROUTES.REWARDS.ROOT),
  item("Marketing", APP_ROUTES.MARKETING.ROOT),
  item("Analytics", APP_ROUTES.ANALYTICS),
  item("Orders", APP_ROUTES.ORDERS),
  item("Settings", APP_ROUTES.SETTINGS.ROOT),
] as const satisfies readonly NavigationItem[];

export const SECTION_NAVIGATION = {
  members: [
    item("All customers", APP_ROUTES.MEMBERS.ROOT, {
      icon: PersonIcon,
      end: true,
    }),
    item("Tiers", APP_ROUTES.MEMBERS.TIERS, { icon: StarIcon }),
    item("Tier benefits", APP_ROUTES.MEMBERS.PRODUCTS, {
      icon: ProductIcon,
    }),
    item("Gift cards", APP_ROUTES.MEMBERS.GIFT_CARDS, {
      icon: GiftCardIcon,
    }),
  ],
  rewards: [
    item("Overview", APP_ROUTES.REWARDS.ROOT, {
      icon: ChartVerticalIcon,
      end: true,
    }),
    item("Points setup", APP_ROUTES.REWARDS.CONFIG, {
      icon: StarIcon,
    }),
    item("Missions", APP_ROUTES.REWARDS.MISSIONS, {
      icon: TargetIcon,
    }),
    item("Raffles", APP_ROUTES.REWARDS.RAFFLES, {
      icon: GiftCardIcon,
    }),
    item("Mystery boxes", APP_ROUTES.REWARDS.MYSTERY_BOXES, {
      icon: PackageIcon,
    }),
  ],
  marketing: [
    item("Overview", APP_ROUTES.MARKETING.ROOT, {
      icon: ChartVerticalIcon,
      end: true,
    }),
    item("Campaigns", APP_ROUTES.MARKETING.CAMPAIGNS.ROOT, {
      icon: EmailIcon,
    }),
    item("Automations", APP_ROUTES.MARKETING.AUTOMATION.ROOT, {
      icon: AutomationIcon,
      matches: [{ path: "/app/marketing/automation" }],
    }),
    item("Templates", APP_ROUTES.MARKETING.TEMPLATES.ROOT, {
      icon: ThemeTemplateIcon,
    }),
  ],
} as const satisfies Record<
  "members" | "rewards" | "marketing",
  readonly NavigationItem[]
>;
