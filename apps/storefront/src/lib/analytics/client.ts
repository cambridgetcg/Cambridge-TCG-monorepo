export const ANALYTICS_CONSENT_COOKIE = "analytics-consent";

export type NavigationArea =
  | "global_logo"
  | "desktop_primary"
  | "desktop_more"
  | "desktop_utility"
  | "mobile_primary"
  | "mobile_more"
  | "mobile_utility";

export type CardSearchSurface = "card_finder" | "price_search";

export interface AnalyticsEventMap {
  nav_click: {
    nav_area: NavigationArea;
    link_text: string;
    link_url: string;
    source_path: string;
  };
  more_open: {
    source_path: string;
  };
  mobile_menu_open: {
    source_path: string;
  };
  card_search_submit: {
    search_surface: CardSearchSurface;
    game: string;
    query_length: number;
    language_filter: string;
  };
  card_search_result: {
    search_surface: CardSearchSurface;
    game: string;
    result_count: number;
    result_state: "matches" | "no_matches" | "error";
  };
  list_card_click: {
    nav_area: "desktop_utility" | "mobile_utility";
    source_path: string;
  };
}

type Gtag = (command: "event", eventName: string, parameters: object) => void;

type AnalyticsWindow = Window & {
  gtag?: Gtag;
};

/** Pure parser shared by the browser helper and its node-environment tests. */
export function analyticsConsentGranted(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name === ANALYTICS_CONSENT_COOKIE && value === "granted";
  });
}

/**
 * Sends one typed GA4 event only after explicit consent.
 *
 * Missing consent, a blocked/not-yet-loaded gtag script, SSR, and analytics
 * failures all return false rather than interrupting the visitor's action.
 */
export function trackAnalyticsEvent<EventName extends keyof AnalyticsEventMap>(
  eventName: EventName,
  parameters: AnalyticsEventMap[EventName],
): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!analyticsConsentGranted(document.cookie)) return false;

  const gtag = (window as AnalyticsWindow).gtag;
  if (typeof gtag !== "function") return false;

  try {
    gtag("event", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}
