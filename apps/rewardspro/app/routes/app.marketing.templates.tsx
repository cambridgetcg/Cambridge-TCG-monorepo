import { Outlet } from "@remix-run/react";

/**
 * Templates layout wrapper
 *
 * This layout is required for nested template routes to render.
 * Child routes like new, $id, etc. will render inside the Outlet component.
 */
export default function TemplatesLayout() {
  return <Outlet />;
}
