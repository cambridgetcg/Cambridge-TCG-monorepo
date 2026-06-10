import { Outlet } from "@remix-run/react";

/**
 * Campaigns layout wrapper
 *
 * This layout is required for nested campaign routes to render.
 * Child routes like create, $id, $id.send, etc. will render
 * inside the Outlet component.
 */
export default function CampaignsLayout() {
  return <Outlet />;
}
