import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import { SECTION_NAVIGATION } from "~/navigation/registry";

/**
 * Marketing Section Layout
 *
 * Groups marketing-related functionality:
 * - Overview (dashboard with metrics and quick actions)
 * - Campaigns (email campaigns)
 * - Templates (email templates)
 * - Automations (triggered email workflows)
 *
 * Uses pathless layout pattern - this file renders the secondary nav
 * and an Outlet for child routes.
 */
export default function MarketingLayout() {
  return (
    <>
      <SecondaryNav
        ariaLabel="Marketing"
        items={SECTION_NAVIGATION.marketing}
      />
      <Outlet />
    </>
  );
}
