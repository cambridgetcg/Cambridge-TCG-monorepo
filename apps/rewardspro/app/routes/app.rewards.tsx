import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import { ChartVerticalIcon, GiftCardIcon, PackageIcon, TargetIcon } from "@shopify/polaris-icons";

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
    { label: "Overview", to: "/app/rewards", icon: ChartVerticalIcon },
    { label: "Raffles", to: "/app/rewards/raffles", icon: GiftCardIcon },
    { label: "Mystery Boxes", to: "/app/rewards/mystery-boxes", icon: PackageIcon },
    { label: "Challenges", to: "/app/rewards/challenges", icon: TargetIcon },
  ];

  return (
    <>
      <SecondaryNav items={navItems} />
      <Outlet />
    </>
  );
}
