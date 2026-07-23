import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { settingsPath } from "~/navigation/routes";

/**
 * Compatibility redirect for provider-specific integration settings URLs.
 */
export function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (params.provider && !url.searchParams.has("provider")) {
    url.searchParams.set("provider", params.provider);
  }

  return redirect(settingsPath("integrations", url.searchParams));
}
