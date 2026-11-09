/**
 * React Router's server handleError: loader, action and render errors reach
 * Sentry (through scrubEvent, beforeSend) and the log, and Sentry's alert
 * emails Yu for each new issue.
 *
 * React Router's own answer to a request the app has no handler for, such as
 * a GET to a POST-only webhook route (seen on production 2026-11-06), is a
 * 4xx error response: the caller's mistake, not a fault, so it is not
 * reported. Vercel's request log still records it.
 */
import * as Sentry from "@sentry/react-router";
import { isRouteErrorResponse, type HandleErrorFunction } from "react-router";

const report = Sentry.createSentryHandleError({ logErrors: true });

export const handleError: HandleErrorFunction = (error, args) => {
  if (isRouteErrorResponse(error) && error.status < 500) return;
  return report(error, args);
};
