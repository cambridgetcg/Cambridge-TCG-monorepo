import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";

/**
 * Members Section Layout
 *
 * Groups customer/member-related functionality:
 * - Customers (member list and management)
 * - Tiers (membership tier definitions)
 * - Tier Products (tier-exclusive products)
 *
 * Uses pathless layout pattern - this file renders the secondary nav
 * and an Outlet for child routes.
 */
export default function MembersLayout() {
  const navItems = [
    { label: "Customers", to: "/app/members" },
    { label: "Tiers", to: "/app/members/tiers" },
    { label: "Tier Products", to: "/app/members/products" },
  ];

  return (
    <>
      <SecondaryNav items={navItems} />
      <Outlet />
    </>
  );
}
