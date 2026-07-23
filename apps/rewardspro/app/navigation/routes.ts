/**
 * Canonical in-app destinations.
 *
 * Keep this module free of React, Polaris, and server-only imports so routes,
 * loaders, services, and tests can all share the same URL truth.
 */

export const SETTINGS_SECTIONS = [
  "general",
  "data-sync",
  "automation",
  "store-metrics",
  "appearance",
  "integrations",
  "billing",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const LEGACY_SETTINGS_TAB_SECTIONS: readonly SettingsSection[] =
  SETTINGS_SECTIONS;

type SettingsParamPrimitive = string | number | boolean;
type SettingsParamValue =
  | SettingsParamPrimitive
  | null
  | undefined
  | readonly (SettingsParamPrimitive | null | undefined)[];

export type SettingsExtraParams =
  | URLSearchParams
  | Record<string, SettingsParamValue>;

export type ParsedSettingsSearch = {
  section: SettingsSection;
  /**
   * True when the URL already has one valid named section and no legacy tab.
   */
  isCanonical: boolean;
  /**
   * True when a valid legacy numeric tab supplied the resolved section.
   */
  usedLegacyTab: boolean;
};

function toSearchParams(
  input: URLSearchParams | string,
): URLSearchParams {
  if (input instanceof URLSearchParams) {
    return input;
  }

  const queryStart = input.indexOf("?");
  return new URLSearchParams(
    queryStart >= 0 ? input.slice(queryStart + 1) : input,
  );
}

export function isSettingsSection(
  value: string | null | undefined,
): value is SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection);
}

/**
 * Resolve named Settings URLs and the old `?tab=N` format.
 *
 * Named sections always win if both formats are present. Invalid or omitted
 * values safely resolve to General and are marked non-canonical.
 */
export function parseSettingsSearch(
  input: URLSearchParams | string,
): ParsedSettingsSearch {
  const searchParams = toSearchParams(input);
  const namedSection = searchParams.get("section");

  if (isSettingsSection(namedSection)) {
    return {
      section: namedSection,
      isCanonical: !searchParams.has("tab"),
      usedLegacyTab: false,
    };
  }

  const legacyTab = searchParams.get("tab");
  if (legacyTab !== null && /^\d+$/.test(legacyTab)) {
    const legacySection = LEGACY_SETTINGS_TAB_SECTIONS[Number(legacyTab)];
    if (legacySection) {
      return {
        section: legacySection,
        isCanonical: false,
        usedLegacyTab: true,
      };
    }
  }

  return {
    section: "general",
    isCanonical: false,
    usedLegacyTab: false,
  };
}

export function parseSettingsSection(
  input: URLSearchParams | string,
): SettingsSection {
  return parseSettingsSearch(input).section;
}

/**
 * True when an in-app Settings navigation changes only the canonical section.
 * This lets the route keep its already-loaded Settings data while the URL and
 * rendered tab continue to participate in browser history.
 */
export function isSettingsSectionOnlyNavigation(
  currentUrl: URL,
  nextUrl: URL,
): boolean {
  if (
    currentUrl.pathname !== "/app/settings" ||
    nextUrl.pathname !== "/app/settings"
  ) {
    return false;
  }

  const currentSettings = parseSettingsSearch(currentUrl.searchParams);
  const nextSettings = parseSettingsSearch(nextUrl.searchParams);

  if (
    !currentSettings.isCanonical ||
    !nextSettings.isCanonical ||
    currentSettings.section === nextSettings.section
  ) {
    return false;
  }

  const contextualEntries = (url: URL) =>
    Array.from(url.searchParams.entries())
      .filter(([key]) => key !== "section" && key !== "tab")
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}\u0000${leftValue}`.localeCompare(
          `${rightKey}\u0000${rightValue}`,
        ),
      );

  return (
    JSON.stringify(contextualEntries(currentUrl)) ===
    JSON.stringify(contextualEntries(nextUrl))
  );
}

/**
 * Build a named Settings URL while retaining arbitrary contextual parameters.
 *
 * `section` and the legacy `tab` parameter are controlled by this helper.
 * Repeated values in URLSearchParams are preserved.
 */
export function settingsPath(
  section: SettingsSection,
  extraParams?: SettingsExtraParams,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set("section", section);

  if (extraParams instanceof URLSearchParams) {
    for (const [key, value] of extraParams) {
      if (key !== "section" && key !== "tab") {
        searchParams.append(key, value);
      }
    }
  } else if (extraParams) {
    for (const [key, rawValue] of Object.entries(extraParams)) {
      if (key === "section" || key === "tab" || rawValue == null) {
        continue;
      }

      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      for (const value of values) {
        if (value != null) {
          searchParams.append(key, String(value));
        }
      }
    }
  }

  return `/app/settings?${searchParams.toString()}`;
}

export function oauthSettingsSuccessPath(provider: string): string {
  return settingsPath("integrations", {
    connected: true,
    provider,
  });
}

export function oauthSettingsErrorPath(
  error: string,
  details: {
    errorDescription?: string | null;
    provider?: string | null;
  } = {},
): string {
  return settingsPath("integrations", {
    error,
    error_description: details.errorDescription,
    provider: details.provider,
  });
}

export const APP_ROUTES = {
  DASHBOARD: "/app",
  ANALYTICS: "/app/analytics",
  BILLING: "/app/billing",
  ORDERS: "/app/orders",
  MEMBERS: {
    ROOT: "/app/members",
    TIERS: "/app/members/tiers",
    PRODUCTS: "/app/members/products",
    GIFT_CARDS: "/app/members/gift-cards",
    SYNC: "/app/members/sync",
  },
  REWARDS: {
    ROOT: "/app/rewards",
    CONFIG: "/app/rewards/config",
    MISSIONS: "/app/rewards/missions",
    MISSION: (missionId: string) =>
      `/app/rewards/missions/${encodeURIComponent(missionId)}`,
    RAFFLES: "/app/rewards/raffles",
    RAFFLE: (raffleId: string) =>
      `/app/rewards/raffles/${encodeURIComponent(raffleId)}`,
    MYSTERY_BOXES: "/app/rewards/mystery-boxes",
    MYSTERY_BOX: (boxId: string) =>
      `/app/rewards/mystery-boxes/${encodeURIComponent(boxId)}`,
  },
  MARKETING: {
    ROOT: "/app/marketing",
    ANALYTICS: "/app/marketing/analytics",
    RECOMMENDATIONS: "/app/marketing/recommendations",
    SETTINGS: "/app/marketing/settings",
    CAMPAIGNS: {
      ROOT: "/app/marketing/campaigns",
      CREATE: "/app/marketing/campaigns/create",
      DETAIL: (campaignId: string) =>
        `/app/marketing/campaigns/${encodeURIComponent(campaignId)}`,
      SEND: (campaignId: string) =>
        `/app/marketing/campaigns/${encodeURIComponent(campaignId)}/send`,
    },
    TEMPLATES: {
      ROOT: "/app/marketing/templates",
      CREATE: "/app/marketing/templates/new",
      DETAIL: (templateId: string) =>
        `/app/marketing/templates/${encodeURIComponent(templateId)}`,
    },
    AUTOMATION: {
      ROOT: "/app/marketing/automation/workflows",
      CREATE: "/app/marketing/automation/create",
      DETAIL: (automationId: string) =>
        `/app/marketing/automation/${encodeURIComponent(automationId)}`,
    },
    KLAVIYO: "/app/marketing/klaviyo",
  },
  SETTINGS: {
    ROOT: "/app/settings",
    SECTION: settingsPath,
    GENERAL: settingsPath("general"),
    DATA_SYNC: settingsPath("data-sync"),
    AUTOMATION: settingsPath("automation"),
    STORE_METRICS: settingsPath("store-metrics"),
    APPEARANCE: settingsPath("appearance"),
    INTEGRATIONS: settingsPath("integrations"),
    BILLING: settingsPath("billing"),
  },
} as const;
