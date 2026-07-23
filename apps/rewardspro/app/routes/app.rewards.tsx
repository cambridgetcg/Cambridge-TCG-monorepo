import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import { SECTION_NAVIGATION } from "~/navigation/registry";

/**
 * Rewards Section Layout
 *
 * Groups points and gamification functionality:
 * - Overview (points dashboard)
 * - Raffles (raffle management)
 * - Mystery Boxes (mystery box management)
 * - Missions (challenge/mission system)
 *
 * Uses pathless layout pattern - this file renders the secondary nav
 * and an Outlet for child routes.
 */
export default function RewardsLayout() {
  return (
    <>
      <SecondaryNav
        ariaLabel="Loyalty program"
        items={SECTION_NAVIGATION.rewards}
      />
      <Outlet />
    </>
  );
}
