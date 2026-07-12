export const ANALYTICS_CONSENT_COOKIE = "analytics-consent";

export type AnalyticsConsent = "granted" | "denied";

/** Read the exact first-party consent cookie without matching lookalike names. */
export function readAnalyticsConsent(cookieString: string): AnalyticsConsent | null {
  for (const part of cookieString.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== ANALYTICS_CONSENT_COOKIE) continue;

    const value = rawValue.join("=");
    return value === "granted" || value === "denied" ? value : null;
  }

  return null;
}

/** Names of Google Analytics cookies that this page is allowed to remove. */
export function accessibleGoogleAnalyticsCookieNames(cookieString: string): string[] {
  const names = cookieString
    .split(";")
    .map((part) => part.trim().split("=", 1)[0])
    .filter((name) => /^_ga(?:_|$)/.test(name));

  return [...new Set(names)];
}

function candidateCookieDomains(hostname: string): string[] {
  const normalised = hostname.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!normalised.includes(".") || /^[\d.:]+$/.test(normalised)) return [];

  const labels = normalised.split(".");
  const domains: string[] = [];
  for (let index = 0; index < labels.length - 1; index += 1) {
    const domain = labels.slice(index).join(".");
    if (domain.includes(".")) domains.push(domain);
  }
  return domains;
}

/**
 * Build deletion writes for every visible `_ga` cookie. Google normally uses
 * path `/` and may use either the current host or a parent domain, so both are
 * expired. Browsers harmlessly ignore domain candidates that are not valid.
 */
export function googleAnalyticsCookieDeletionWrites(
  cookieString: string,
  hostname: string,
): string[] {
  const names = accessibleGoogleAnalyticsCookieNames(cookieString);
  const domains = candidateCookieDomains(hostname);
  const expiry = "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax";

  return names.flatMap((name) => [
    `${name}=; ${expiry}`,
    ...domains.map((domain) => `${name}=; ${expiry}; Domain=.${domain}`),
  ]);
}
