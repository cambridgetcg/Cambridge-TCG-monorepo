import { Outlet } from "@remix-run/react";
import { SecondaryNav } from "~/components/SecondaryNav";
import {
  ChartVerticalIcon,
  EmailIcon,
  ThemeTemplateIcon,
  AutomationIcon,
} from "@shopify/polaris-icons";

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
  const navItems = [
    { label: "Overview", to: "/app/marketing", icon: ChartVerticalIcon },
    { label: "Campaigns", to: "/app/marketing/campaigns", icon: EmailIcon },
    { label: "Templates", to: "/app/marketing/templates", icon: ThemeTemplateIcon },
    { label: "Automations", to: "/app/marketing/automation/workflows", icon: AutomationIcon },
  ];

  return (
    <>
      <SecondaryNav items={navItems} />
      <Outlet />
    </>
  );
}
