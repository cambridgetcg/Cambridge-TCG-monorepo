import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import { SECTION_NAVIGATION } from "~/navigation/registry";

/**
 * Members Section Layout
 *
 * Groups customer/member-related functionality:
 * - Customers (member list and management)
 * - Tiers (membership tier definitions)
 * - Tier Products (tier-exclusive products)
 * - Gift Cards (tier-integrated gift card configuration)
 *
 * Uses pathless layout pattern - this file renders the secondary nav
 * and an Outlet for child routes.
 */
export default function MembersLayout() {
  return (
    <>
      <SecondaryNav
        ariaLabel="Customers"
        items={SECTION_NAVIGATION.members}
      />
      <Outlet />
    </>
  );
}
