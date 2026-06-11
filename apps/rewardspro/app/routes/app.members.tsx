import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import { PersonIcon, StarIcon, ProductIcon, GiftCardIcon } from "@shopify/polaris-icons";

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
  const navItems = [
    { label: "Customers", to: "/app/members", icon: PersonIcon },
    { label: "Tiers", to: "/app/members/tiers", icon: StarIcon },
    { label: "Tier Products", to: "/app/members/products", icon: ProductIcon },
    { label: "Gift Cards", to: "/app/members/gift-cards", icon: GiftCardIcon },
  ];

  return (
    <>
      <SecondaryNav items={navItems} />
      <Outlet />
    </>
  );
}
