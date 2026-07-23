import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { settingsPath } from "~/navigation/routes";

/**
 * Compatibility redirect for the former Settings integrations URL.
 *
 * On a provider child URL the child loader owns the redirect, so this route
 * only supplies its outlet.
 */
export function loader({ request, params }: LoaderFunctionArgs) {
  if (params.provider) {
    return null;
  }

  const url = new URL(request.url);
  return redirect(settingsPath("integrations", url.searchParams));
}

export default function LegacyIntegrationsLayout() {
  return <Outlet />;
}
