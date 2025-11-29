import { Outlet } from "@remix-run/react";

/**
 * Marketing layout wrapper
 *
 * This layout is required for nested marketing routes to render.
 * Child routes like templates.new, campaigns.create, etc. will render
 * inside the Outlet component.
 */
export default function MarketingLayout() {
  return <Outlet />;
}
