import { describe, expect, it } from "vitest";

import {
  matchesNavigationItem,
  PRIMARY_NAVIGATION,
  SECTION_NAVIGATION,
} from "~/navigation/registry";

function activeLabels(
  pathname: string,
  items: readonly (typeof SECTION_NAVIGATION.rewards)[number][],
) {
  return items
    .filter((item) => matchesNavigationItem(pathname, item))
    .map((item) => item.label);
}

describe("navigation registry", () => {
  it("keeps the primary menu concise and destinations unique", () => {
    expect(PRIMARY_NAVIGATION.map((item) => item.label)).toEqual([
      "Customers",
      "Loyalty program",
      "Marketing",
      "Analytics",
      "Orders",
      "Settings",
    ]);
    expect(new Set(PRIMARY_NAVIGATION.map((item) => item.to)).size).toBe(
      PRIMARY_NAVIGATION.length,
    );
  });

  it("matches overview tabs exactly instead of claiming hidden siblings", () => {
    expect(activeLabels("/app/rewards", SECTION_NAVIGATION.rewards)).toEqual([
      "Overview",
    ]);
    expect(
      activeLabels("/app/rewards/config", SECTION_NAVIGATION.rewards),
    ).toEqual(["Points setup"]);
    expect(
      activeLabels("/app/rewards/unlisted-screen", SECTION_NAVIGATION.rewards),
    ).toEqual([]);
  });

  it("keeps nested details attached to their visible destination", () => {
    expect(
      activeLabels(
        "/app/rewards/missions/welcome-series",
        SECTION_NAVIGATION.rewards,
      ),
    ).toEqual(["Missions"]);
  });

  it("matches every marketing automation URL to Automations", () => {
    const automation = SECTION_NAVIGATION.marketing.find(
      (item) => item.label === "Automations",
    );

    expect(automation).toBeDefined();
    expect(
      matchesNavigationItem(
        "/app/marketing/automation/create",
        automation!,
      ),
    ).toBe(true);
    expect(
      matchesNavigationItem(
        "/app/marketing/automation/workflows/retention",
        automation!,
      ),
    ).toBe(true);
  });
});
