import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  SETTINGS_SECTIONS,
  isSettingsSectionOnlyNavigation,
  oauthSettingsErrorPath,
  oauthSettingsSuccessPath,
  parseSettingsSearch,
  parseSettingsSection,
  settingsPath,
} from "~/navigation/routes";
import { INSIGHT_RULES } from "~/services/analytics/insight-rules.server";
import { loader as legacyAutomationLoader } from "~/routes/app.settings.automation";
import { loader as legacyStoreMetricsLoader } from "~/routes/app.settings.store-metrics";
import { loader as legacyIntegrationsLoader } from "~/routes/app.settings.integrations";
import { loader as legacyProviderLoader } from "~/routes/app.settings.integrations.$provider";

describe("Settings URL state", () => {
  it.each([
    [0, "general"],
    [1, "data-sync"],
    [2, "automation"],
    [3, "store-metrics"],
    [4, "appearance"],
    [5, "integrations"],
    [6, "billing"],
  ] as const)("maps legacy tab %i to %s", (tab, section) => {
    expect(parseSettingsSearch(`?tab=${tab}`)).toEqual({
      section,
      isCanonical: false,
      usedLegacyTab: true,
    });
  });

  it("uses a valid named section and lets it win over a legacy tab", () => {
    expect(parseSettingsSearch("?section=integrations&tab=0")).toEqual({
      section: "integrations",
      isCanonical: false,
      usedLegacyTab: false,
    });
  });

  it("falls back safely for omitted, invalid, and out-of-range sections", () => {
    expect(parseSettingsSection("")).toBe("general");
    expect(parseSettingsSection("?section=unknown")).toBe("general");
    expect(parseSettingsSection("?tab=99")).toBe("general");
  });

  it("builds a named path while preserving contextual query parameters", () => {
    const extras = new URLSearchParams(
      "tab=5&error=scope_denied&provider=GORGIAS&scope=tickets&scope=users",
    );

    const path = settingsPath("integrations", extras);
    const url = new URL(path, "https://rewardspro.test");

    expect(url.pathname).toBe("/app/settings");
    expect(url.searchParams.get("section")).toBe("integrations");
    expect(url.searchParams.has("tab")).toBe(false);
    expect(url.searchParams.get("error")).toBe("scope_denied");
    expect(url.searchParams.get("provider")).toBe("GORGIAS");
    expect(url.searchParams.getAll("scope")).toEqual(["tickets", "users"]);
  });

  it("exposes exactly the stable Settings section IDs in tab order", () => {
    expect(SETTINGS_SECTIONS).toEqual([
      "general",
      "data-sync",
      "automation",
      "store-metrics",
      "appearance",
      "integrations",
      "billing",
    ]);
  });

  it("can switch named sections without reloading unchanged Settings data", () => {
    expect(
      isSettingsSectionOnlyNavigation(
        new URL(
          "https://rewardspro.test/app/settings?section=general&host=abc",
        ),
        new URL(
          "https://rewardspro.test/app/settings?section=appearance&host=abc",
        ),
      ),
    ).toBe(true);

    expect(
      isSettingsSectionOnlyNavigation(
        new URL(
          "https://rewardspro.test/app/settings?section=general&host=abc",
        ),
        new URL(
          "https://rewardspro.test/app/settings?section=appearance&host=changed",
        ),
      ),
    ).toBe(false);

    expect(
      isSettingsSectionOnlyNavigation(
        new URL(
          "https://rewardspro.test/app/settings?section=general",
        ),
        new URL("https://rewardspro.test/app/settings?tab=4"),
      ),
    ).toBe(false);
  });
});

describe("OAuth Settings destinations", () => {
  it("sends successful connections to the named Integrations section", () => {
    const url = new URL(
      oauthSettingsSuccessPath("GORGIAS"),
      "https://rewardspro.test",
    );

    expect(url.pathname).toBe("/app/settings");
    expect(url.searchParams.get("section")).toBe("integrations");
    expect(url.searchParams.get("connected")).toBe("true");
    expect(url.searchParams.get("provider")).toBe("GORGIAS");
  });

  it("preserves provider error details", () => {
    const url = new URL(
      oauthSettingsErrorPath("access denied", {
        errorDescription: "The merchant declined access",
        provider: "ZENDESK",
      }),
      "https://rewardspro.test",
    );

    expect(url.searchParams.get("section")).toBe("integrations");
    expect(url.searchParams.get("error")).toBe("access denied");
    expect(url.searchParams.get("error_description")).toBe(
      "The merchant declined access",
    );
    expect(url.searchParams.get("provider")).toBe("ZENDESK");
  });
});

describe("legacy Settings route compatibility", () => {
  it.each([
    [
      legacyAutomationLoader,
      "https://rewardspro.test/app/settings/automation?source=bookmark",
      "automation",
    ],
    [
      legacyStoreMetricsLoader,
      "https://rewardspro.test/app/settings/store-metrics?source=bookmark",
      "store-metrics",
    ],
  ] as const)("redirects a legacy screen to its named section", async (
    loader,
    requestUrl,
    section,
  ) => {
    const response = await loader({
      request: new Request(requestUrl),
      params: {},
      context: {},
    });
    const destination = new URL(
      response.headers.get("Location")!,
      "https://rewardspro.test",
    );

    expect(response.status).toBe(302);
    expect(destination.searchParams.get("section")).toBe(section);
    expect(destination.searchParams.get("source")).toBe("bookmark");
  });

  it("retains a provider from a legacy provider-specific URL", async () => {
    const response = await legacyProviderLoader({
      request: new Request(
        "https://rewardspro.test/app/settings/integrations/gorgias?error=retry",
      ),
      params: { provider: "gorgias" },
      context: {},
    });
    const destination = new URL(
      response.headers.get("Location")!,
      "https://rewardspro.test",
    );

    expect(destination.searchParams.get("section")).toBe("integrations");
    expect(destination.searchParams.get("provider")).toBe("gorgias");
    expect(destination.searchParams.get("error")).toBe("retry");
  });

  it("redirects the legacy Integrations index and preserves OAuth details", async () => {
    const response = await legacyIntegrationsLoader({
      request: new Request(
        "https://rewardspro.test/app/settings/integrations?connected=true&provider=GORGIAS",
      ),
      params: {},
      context: {},
    });
    const destination = new URL(
      response!.headers.get("Location")!,
      "https://rewardspro.test",
    );

    expect(destination.searchParams.get("section")).toBe("integrations");
    expect(destination.searchParams.get("connected")).toBe("true");
    expect(destination.searchParams.get("provider")).toBe("GORGIAS");
  });
});

describe("canonical route catalog", () => {
  it("names the repaired navigation destinations", () => {
    expect(APP_ROUTES.DASHBOARD).toBe("/app");
    expect(APP_ROUTES.ORDERS).toBe("/app/orders");
    expect(APP_ROUTES.ANALYTICS).toBe("/app/analytics");
    expect(APP_ROUTES.MEMBERS.TIERS).toBe("/app/members/tiers");
    expect(APP_ROUTES.REWARDS.CONFIG).toBe("/app/rewards/config");
    expect(APP_ROUTES.MARKETING.CAMPAIGNS.CREATE).toBe(
      "/app/marketing/campaigns/create",
    );
    expect(APP_ROUTES.SETTINGS.BILLING).toBe(
      "/app/settings?section=billing",
    );
  });

  it("keeps analytics insight actions on real canonical routes", () => {
    const actionHrefs = INSIGHT_RULES.flatMap((rule) =>
      rule.action ? [rule.action.href] : [],
    );

    expect(actionHrefs).not.toContain("/app/settings/tiers");
    expect(actionHrefs).not.toContain("/app/settings/cashback");
    expect(actionHrefs.some((href) => href.includes("/campaigns/new"))).toBe(
      false,
    );
    expect(actionHrefs).toContain(APP_ROUTES.MEMBERS.TIERS);
    expect(actionHrefs).toContain(APP_ROUTES.REWARDS.CONFIG);
  });
});
