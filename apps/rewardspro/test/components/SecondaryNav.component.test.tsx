import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SecondaryNav } from "~/components/SecondaryNav";
import { SECTION_NAVIGATION } from "~/navigation/registry";

function renderRewardsNavigation(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SecondaryNav
        ariaLabel="Loyalty program"
        items={SECTION_NAVIGATION.rewards}
      />
    </MemoryRouter>,
  );
}

describe("SecondaryNav", () => {
  it("exposes a labelled navigation landmark and current destination", () => {
    renderRewardsNavigation("/app/rewards/missions/welcome-series");

    expect(
      screen.getByRole("navigation", { name: "Loyalty program" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Missions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark Overview current for an unlisted sibling route", () => {
    renderRewardsNavigation("/app/rewards/internal-tool");

    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).not.toBeInTheDocument();
  });
});
