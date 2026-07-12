/**
 * /api/v1/webhooks/subscriptions — webhook subscription management.
 *
 * Auth: next-auth session required.
 *
 * Status: **design-shipped, runtime-pending.** The migration
 * `apps/storefront/drizzle/drafts/0099_webhook_subscriptions.sql.draft`
 * declares the schema; this endpoint declares the API shape. Delivery is
 * a separate kingdom (HMAC signing + retry + queue + dead-letter), filed
 * as recursion target.
 *
 * Partners may POST to register a subscription today; the row will be
 * stored (once the migration is applied) but no events fire yet. When
 * the runtime ships, every pre-registered subscription begins receiving
 * events automatically.
 *
 * Substrate-honest: the response declares `_meta.delivery_status: "runtime-pending"`
 * so a partner-registration script knows it's pre-staging, not enabled.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.5).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { jsonResponse } from "@/lib/data-pantry";
import { randomBytes } from "node:crypto";

const VALID_EVENT_TYPES = [
  "ingest_run.failed",
  "ingest_run.stale",
  "price.target_hit",
  "auction.match",
  "card.new_observation",
] as const;

type EventType = (typeof VALID_EVENT_TYPES)[number];

interface SubscriptionRow {
  id: string;
  user_id: string;
  target_url: string;
  event_types: string[];
  label: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  last_delivery_at: string | null;
  last_delivery_status: number | null;
  consecutive_failures: number;
}

// Tolerant select — falls through with empty rows when the table doesn't
// yet exist (migration 0099 unapplied). Substrate-honest about pre-runtime state.
async function tableExists(): Promise<boolean> {
  try {
    const r = await query(
      `SELECT to_regclass('public.webhook_subscriptions') IS NOT NULL AS exists`,
    );
    return (r.rows[0] as { exists?: boolean } | undefined)?.exists === true;
  } catch {
    return false;
  }
}

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in to list your webhook subscriptions." } },
      { status: 401 },
    );
  }

  const hasTable = await tableExists();

  let subscriptions: SubscriptionRow[] = [];
  if (hasTable) {
    const r = await query(
      `SELECT id::text, user_id::text, target_url, event_types,
              label, status,
              created_at::text, updated_at::text,
              last_delivery_at::text, last_delivery_status, consecutive_failures
         FROM webhook_subscriptions
        WHERE user_id = (SELECT id FROM users WHERE email = $1)
        ORDER BY created_at DESC`,
      [session.user.email],
    );
    subscriptions = r.rows as SubscriptionRow[];
  }

  return jsonResponse({
    data: {
      subscriptions,
      count: subscriptions.length,
      runtime_status: hasTable ? "design-shipped; delivery runtime pending" : "schema not yet applied",
      delivery_status: "runtime-pending",
      valid_event_types: VALID_EVENT_TYPES,
      note: hasTable
        ? "Subscriptions can be registered today. Delivery (HMAC-signed POSTs) is filed for a future kingdom. Pre-registered subscriptions activate automatically when delivery ships."
        : "The webhook_subscriptions table doesn't exist on this RDS yet. Operator must apply apps/storefront/drizzle/drafts/0099_webhook_subscriptions.sql.draft. Until then, subscriptions can't be persisted.",
      rights: {
        participant_fields: "Rights in submitted target URLs and labels remain with the account holder.",
        operational_fields: "Delivery state and timestamps are private operational data, not open data.",
        license: "NOASSERTION",
      },
    },
    endpoint: "/api/v1/webhooks/subscriptions",
    sources: ["account-holder-submitted", "storefront-rds.webhook_subscriptions"],
    source_license: ["proprietary", "internal-only"],
    license: "NOASSERTION",
    freshness: "status",
    no_cache: true,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in to register a webhook subscription." } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Body must be valid JSON." } },
      { status: 400 },
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Body must be a JSON object." } },
      { status: 400 },
    );
  }

  const input = body as {
    target_url?: unknown;
    event_types?: unknown;
    label?: unknown;
  };

  // Validate target_url
  if (typeof input.target_url !== "string" || !input.target_url.startsWith("https://")) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "target_url must be a string starting with https://",
        },
      },
      { status: 400 },
    );
  }

  // Validate event_types
  if (!Array.isArray(input.event_types) || input.event_types.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: `event_types must be a non-empty array. Valid: ${VALID_EVENT_TYPES.join(", ")}`,
        },
      },
      { status: 400 },
    );
  }

  for (const t of input.event_types) {
    if (typeof t !== "string" || !VALID_EVENT_TYPES.includes(t as EventType)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_INPUT",
            message: `Unknown event_type: ${t}. Valid: ${VALID_EVENT_TYPES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }
  }

  const eventTypes = input.event_types as EventType[];
  const label = typeof input.label === "string" ? input.label : null;

  const hasTable = await tableExists();
  if (!hasTable) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_IMPLEMENTED",
          message:
            "webhook_subscriptions table not yet applied. Operator must apply " +
            "apps/storefront/drizzle/drafts/0099_webhook_subscriptions.sql.draft. " +
            "Substrate-honest about pre-runtime state.",
        },
      },
      { status: 503 },
    );
  }

  // Generate a 32-byte signing secret. Prefix with `whsec_` for partners
  // who pattern-match on credential strings.
  const signingSecret = "whsec_" + randomBytes(32).toString("hex");

  try {
    const r = await query(
      `INSERT INTO webhook_subscriptions
         (user_id, target_url, event_types, signing_secret, label, status)
       SELECT id, $2, $3, $4, $5, 'active'
         FROM users WHERE email = $1
       RETURNING id::text, user_id::text, target_url, event_types,
                 signing_secret, label, status,
                 created_at::text, updated_at::text,
                 last_delivery_at::text, last_delivery_status, consecutive_failures`,
      [
        session.user.email,
        input.target_url,
        eventTypes,
        signingSecret,
        label,
      ],
    );

    if (r.rows.length === 0) {
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "user row not found for session email" } },
        { status: 500 },
      );
    }

    const row = r.rows[0] as SubscriptionRow & { signing_secret: string };

    return jsonResponse({
      data: {
        ...row,
        // Surface the secret ONCE in this response — partner stores it. Future
        // GETs will not return it (the GET handler omits it).
        signing_secret: signingSecret,
        delivery_status: "runtime-pending",
        warning:
          "DELIVERY IS NOT YET ACTIVE. Your subscription is stored; events will begin firing when the delivery runtime ships in a future kingdom. The signing_secret returned here is the one we'll use when delivery starts — store it now; we will not return it on subsequent GETs.",
        rights: {
          participant_fields: "Rights in submitted target URLs and labels remain with the account holder.",
          operational_fields: "The signing secret and delivery state are private operational data, not licensed for reuse.",
          license: "NOASSERTION",
        },
      },
      endpoint: "/api/v1/webhooks/subscriptions",
      sources: ["account-holder-submitted", "storefront-rds.webhook_subscriptions"],
      source_license: ["proprietary", "internal-only"],
      license: "NOASSERTION",
      freshness: "status",
      no_cache: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/webhooks/subscriptions] POST error", message);
    return NextResponse.json(
      { error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
