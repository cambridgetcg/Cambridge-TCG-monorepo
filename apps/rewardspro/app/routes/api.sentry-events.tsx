/**
 * Sentry Events API Endpoint
 *
 * Internal endpoint for viewing recent Sentry events.
 * Protected by admin authentication.
 *
 * GET /api/sentry-events
 * - Returns recent error events from Sentry
 * - Query params: limit (default: 10), query (Sentry search syntax)
 *
 * Usage:
 * - /api/sentry-events?limit=20
 * - /api/sentry-events?query=is:unresolved
 * - /api/sentry-events?query=shop.domain:myshop.myshopify.com
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// Sentry API configuration
const SENTRY_API_BASE = "https://sentry.io/api/0";
const SENTRY_ORG = process.env.SENTRY_ORG || "cambridgetcgs-projects";
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || "rewardspro";
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;

interface SentryEvent {
  eventID: string;
  id: string;
  title: string;
  message: string;
  level: string;
  platform: string;
  type: string;
  dateCreated: string;
  dateReceived: string;
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  tags?: Array<{ key: string; value: string }>;
  context?: Record<string, unknown>;
  metadata?: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
}

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  level: string;
  status: string;
  isUnhandled: boolean;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  metadata?: {
    type?: string;
    value?: string;
    filename?: string;
    function?: string;
  };
  project: {
    id: string;
    name: string;
    slug: string;
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Authenticate admin request
  try {
    await authenticate.admin(request);
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check for Sentry auth token
  if (!SENTRY_AUTH_TOKEN) {
    return json({
      error: "Sentry API token not configured",
      hint: "Add SENTRY_AUTH_TOKEN environment variable",
      configuredDSN: process.env.SENTRY_DSN ? "✓ DSN configured" : "✗ DSN missing",
    }, { status: 500 });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10"), 100);
  const query = url.searchParams.get("query") || "is:unresolved";
  const view = url.searchParams.get("view") || "issues"; // "issues" or "events"

  try {
    if (view === "events") {
      // Fetch recent events
      const eventsResponse = await fetch(
        `${SENTRY_API_BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/events/?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!eventsResponse.ok) {
        const errorText = await eventsResponse.text();
        return json({
          error: `Sentry API error: ${eventsResponse.status}`,
          details: errorText,
        }, { status: eventsResponse.status });
      }

      const events: SentryEvent[] = await eventsResponse.json();

      return json({
        view: "events",
        query,
        count: events.length,
        events: events.slice(0, limit).map(event => ({
          id: event.eventID,
          title: event.title,
          message: event.message,
          level: event.level,
          type: event.type,
          dateCreated: event.dateCreated,
          user: event.user?.id || event.user?.email || "anonymous",
          tags: event.tags?.reduce((acc, tag) => {
            acc[tag.key] = tag.value;
            return acc;
          }, {} as Record<string, string>),
          metadata: event.metadata,
        })),
      });
    } else {
      // Fetch issues (default view)
      const issuesResponse = await fetch(
        `${SENTRY_API_BASE}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=${encodeURIComponent(query)}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!issuesResponse.ok) {
        const errorText = await issuesResponse.text();
        return json({
          error: `Sentry API error: ${issuesResponse.status}`,
          details: errorText,
          hint: issuesResponse.status === 401
            ? "Check SENTRY_AUTH_TOKEN - needs project:read scope"
            : undefined,
        }, { status: issuesResponse.status });
      }

      const issues: SentryIssue[] = await issuesResponse.json();

      return json({
        view: "issues",
        query,
        count: issues.length,
        issues: issues.map(issue => ({
          id: issue.id,
          shortId: issue.shortId,
          title: issue.title,
          culprit: issue.culprit,
          level: issue.level,
          status: issue.status,
          isUnhandled: issue.isUnhandled,
          count: issue.count,
          userCount: issue.userCount,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen,
          metadata: issue.metadata,
          link: `https://sentry.io/organizations/${SENTRY_ORG}/issues/${issue.id}/`,
        })),
      });
    }
  } catch (error) {
    return json({
      error: "Failed to fetch Sentry data",
      details: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

/**
 * POST handler for triggering test events
 */
export async function action({ request }: LoaderFunctionArgs) {
  // Authenticate admin request
  try {
    await authenticate.admin(request);
  } catch {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "test_error") {
    // Import Sentry service and capture a test error
    const { SentryService } = await import("../services/monitoring/sentry.service");

    const testError = new Error("Test error from Sentry monitoring endpoint");
    SentryService.captureException(testError, {
      shop: { domain: "test.myshopify.com" },
      operation: {
        type: "api",
        name: "sentry-events-test",
      },
      tags: {
        "test.source": "api.sentry-events",
        "test.type": "manual_trigger",
      },
      level: "warning",
    });

    await SentryService.flush();

    return json({
      success: true,
      message: "Test error sent to Sentry",
      note: "Check Sentry dashboard in a few seconds to see the event",
    });
  }

  if (intent === "test_transaction") {
    const { SentryService } = await import("../services/monitoring/sentry.service");

    // Create a test transaction
    const transaction = SentryService.startTransaction(
      "test.transaction",
      "test",
      { source: "manual_trigger" }
    );

    if (transaction) {
      // Add some spans
      const span1 = transaction.startChild({
        op: "test.operation",
        description: "Test operation 1",
      });
      span1?.finish();

      const span2 = transaction.startChild({
        op: "test.operation",
        description: "Test operation 2",
      });
      span2?.finish();

      transaction.finish();
    }

    await SentryService.flush();

    return json({
      success: true,
      message: "Test transaction sent to Sentry",
      note: "Check Sentry Performance dashboard to see the transaction",
    });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
