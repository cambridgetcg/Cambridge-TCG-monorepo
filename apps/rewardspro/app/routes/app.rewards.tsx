import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";

/**
 * Rewards Section Layout
 *
 * Groups points and gamification functionality:
 * - Overview (points dashboard)
 * - Raffles (raffle management)
 * - Mystery Boxes (mystery box management)
 * - Challenges (challenge system)
 *
 * Uses pathless layout pattern - this file renders the secondary nav
 * and an Outlet for child routes.
 */
export default function RewardsLayout() {
  const navItems = [
    { label: "Overview", to: "/app/rewards" },
    { label: "Raffles", to: "/app/rewards/raffles" },
    { label: "Mystery Boxes", to: "/app/rewards/mystery-boxes" },
    { label: "Challenges", to: "/app/rewards/challenges" },
  ];

  return (
    <>
      <SecondaryNav items={navItems} />
      <Outlet />
    </>
  );
}
