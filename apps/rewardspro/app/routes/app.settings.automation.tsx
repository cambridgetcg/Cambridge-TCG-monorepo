import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { settingsPath } from "~/navigation/routes";

/**
 * Compatibility redirect for the former standalone automation screen.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(settingsPath("automation", url.searchParams));
}
