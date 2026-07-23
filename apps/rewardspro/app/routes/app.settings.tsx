import { Outlet } from "@remix-run/react";

/**
 * Settings layout.
 *
 * The index route owns the settings data and UI while legacy child URLs can
 * redirect into a stable named section.
 */
export default function SettingsLayout() {
  return <Outlet />;
}
