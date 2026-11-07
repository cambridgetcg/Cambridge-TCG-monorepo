import { beforeEach, describe, expect, it, vi } from "vitest";

const { report } = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@sentry/react-router", () => ({ createSentryHandleError: () => report }));

import { handleError } from "~/handle-error.server";

/**
 * Loader, action and render errors go to Sentry, whose alert emails Yu for
 * each new issue. A request the app has no handler for (a GET to a POST-only
 * webhook route, seen on production 2026-11-06 as REWARDSPRO-1E) is answered
 * 4xx by React Router and is the caller's mistake, not a fault: not reported.
 */

const args = { request: new Request("https://app.test/webhooks/orders/paid") } as Parameters<typeof handleError>[1];
// The shape of React Router's internal ErrorResponse (isRouteErrorResponse)
const routerError = (status: number) => ({ status, statusText: "Bad Request", internal: true, data: "no loader" });

describe("handleError", () => {
  beforeEach(() => report.mockReset());

  it("reports an error the app threw", () => {
    const error = new Error("boom");
    handleError(error, args);

    expect(report).toHaveBeenCalledWith(error, args);
  });

  it("does not report React Router's answer to a request with no handler", () => {
    handleError(routerError(400), args);
    handleError(routerError(405), args);

    expect(report).not.toHaveBeenCalled();
  });

  it("reports a server error response", () => {
    const error = routerError(500);
    handleError(error, args);

    expect(report).toHaveBeenCalledWith(error, args);
  });
});
