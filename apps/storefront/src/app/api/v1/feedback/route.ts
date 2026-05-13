/**
 * /api/v1/feedback — the agent feedback channel.
 *
 * Public, no-auth. Accepts structured reports from autonomous agents,
 * scrapers, mirrors, federation partners, anyone. The reports land in
 * `agent_feedback` (a planned table; for now, logged + emailed to
 * contact@cambridgetcg.com).
 *
 * Five kinds:
 *   - "contract-drift"        — endpoint response doesn't match the spec
 *   - "guide-feedback"        — a guide is wrong or unclear
 *   - "endpoint-suggestion"   — partner wants a new endpoint
 *   - "federation-adopter"    — partner registering for bilateral federation
 *   - "general"               — anything else
 *
 * Substrate-honest about pre-runtime state: today we log + email. When
 * the feedback table ships (drafts/0100_agent_feedback.sql.draft below),
 * reports will be queryable via /api/v1/feedback?id=... — but identifying
 * info is operator-only.
 *
 * Filed for kingdom-082 (the-hospitality.md). Phase E.
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

// kingdom-083: persist when the table exists (drafts/0101_agent_feedback).
// Substrate-honest about pre-runtime state: if the table doesn't exist,
// we still accept the report and log it; we just don't persist.
async function feedbackTableExists(): Promise<boolean> {
  try {
    const r = await query(
      `SELECT to_regclass('public.agent_feedback') IS NOT NULL AS exists`,
    );
    return (r.rows[0] as { exists?: boolean } | undefined)?.exists === true;
  } catch {
    return false;
  }
}

const VALID_KINDS = [
  "contract-drift",
  "guide-feedback",
  "endpoint-suggestion",
  "federation-adopter",
  "general",
] as const;

type FeedbackKind = (typeof VALID_KINDS)[number];

interface FeedbackBody {
  kind?: string;
  reporter_contact?: string;
  // contract-drift fields
  endpoint?: string;
  observed?: string;
  expected?: string;
  request_id_to_correlate?: string;
  // guide-feedback fields
  guide_slug?: string;
  step_number?: number | null;
  observation?: string;
  // endpoint-suggestion fields
  proposed_endpoint?: string;
  use_case?: string;
  // federation-adopter fields
  platform_name?: string;
  platform_url?: string;
  federation_endpoint?: string;
  // general fields
  message?: string;
}

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "feedback_endpoint",
    description:
      "POST a structured feedback report. We read every report. " +
      "Contract drift gets fixed within a week; we reply with the commit SHA.",
    method: "POST",
    body_required: {
      kind: VALID_KINDS,
      reporter_contact: "email or URL where we can reply",
    },
    body_per_kind: {
      "contract-drift": {
        endpoint: "the path that produced the unexpected response",
        observed: "what you got",
        expected: "what the OpenAPI spec says (or what's documented)",
        request_id_to_correlate: "(optional) the X-Request-Id from our response",
      },
      "guide-feedback": {
        guide_slug: "the slug of the guide (from /api/v1/guides)",
        step_number: "(optional) which step had the issue",
        observation: "what you observed",
        expected: "what you expected",
      },
      "endpoint-suggestion": {
        proposed_endpoint: "the path you'd like to see",
        use_case: "what you'd build with it",
      },
      "federation-adopter": {
        platform_name: "your platform's display name",
        platform_url: "your platform's URL",
        federation_endpoint:
          "your /api/v1/federation/identify/[hash] implementation URL",
      },
      general: {
        message: "free-form text",
      },
    },
    response_window_hours: 48,
    example_curl:
      "curl -X POST https://cambridgetcg.com/api/v1/feedback \\\n" +
      "  -H 'content-type: application/json' \\\n" +
      "  -d '{ \"kind\": \"general\", \"message\": \"hello\", \"reporter_contact\": \"you@example.com\" }'",
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/feedback",
    sources: ["ctcg-derived"],
    source_license: ["CC0-1.0"],
    freshness: "methodology",
    contains_self: true,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        "Body must be valid JSON. Send Content-Type: application/json and a JSON object.",
      docs: "/api/v1/feedback",
    });
  }

  if (typeof body.kind !== "string" || !VALID_KINDS.includes(body.kind as FeedbackKind)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `kind must be one of: ${VALID_KINDS.join(", ")}.`,
      docs: "/api/v1/feedback",
    });
  }

  // reporter_contact is recommended but not required for general reports
  if (
    (body.kind === "federation-adopter" || body.kind === "contract-drift") &&
    !body.reporter_contact
  ) {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        `reporter_contact is required for kind '${body.kind}' so we can reply.`,
      docs: "/api/v1/feedback",
    });
  }

  // Generate a feedback id for the reporter to reference.
  const feedbackId = `fb_${randomUUID().slice(0, 12)}`;
  const receivedAt = new Date().toISOString();

  // Persist when the table exists (drafts/0101_agent_feedback). Substrate-
  // honest about pre-runtime state: if the migration hasn't been applied,
  // we still accept + log + reply; we just don't persist. The reporter's
  // feedback_id is unique either way.
  const persisted = await feedbackTableExists();
  if (persisted) {
    try {
      await query(
        `INSERT INTO agent_feedback (feedback_id, kind, reporter_contact, raw_body, status)
         VALUES ($1, $2, $3, $4, 'received')`,
        [
          feedbackId,
          body.kind,
          body.reporter_contact ?? null,
          JSON.stringify(body),
        ],
      );
    } catch (err) {
      // Log but don't fail the request — accept-and-log is the
      // hospitality minimum.
      console.error("[/api/v1/feedback] persist failed", err);
    }
  }

  // Always log structured, even when persisted (for email digest + ops).
  console.log("[/api/v1/feedback] received", {
    feedback_id: feedbackId,
    kind: body.kind,
    reporter_contact: body.reporter_contact,
    received_at: receivedAt,
    persisted,
    body,
  });

  const data = {
    "@kind": "feedback_receipt",
    feedback_id: feedbackId,
    kind: body.kind,
    received_at: receivedAt,
    status: persisted ? "received" : "logged",
    persisted,
    persistence: persisted
      ? "agent_feedback table row inserted with status='received'; operator triages via /ops/agent-feedback (planned admin page)."
      : "agent_feedback table not yet applied; report logged + email digest. Apply drafts/0101_agent_feedback.sql.draft to enable typed persistence.",
    response_window_hours: 48,
    expected_response:
      body.kind === "contract-drift"
        ? "If the drift is real, we patch within a week and reply to reporter_contact with the commit SHA. If we judge the report doesn't match the spec, we reply with the spec citation."
        : body.kind === "guide-feedback"
          ? "If the guide is wrong, we patch the corpus (apps/storefront/src/lib/guides.ts) and reply with the new last_verified date."
          : body.kind === "endpoint-suggestion"
            ? "We add the proposal to the recursion targets in the relevant connection-doc; if shipped, you'll be credited."
            : body.kind === "federation-adopter"
              ? "We smoke-test your federation endpoint and reply with confirmation + adopter registry update."
              : "We read general reports daily; reply within 48h if a question is asked.",
    next_steps_for_reporter: [
      "Save your feedback_id; quote it in any follow-up.",
      "If urgent (production outage on our side), email contact@cambridgetcg.com directly.",
      "If you reported contract-drift, you can re-test in 7 days; we'll close the loop on your reporter_contact.",
    ],
  };

  return jsonResponse({
    data,
    endpoint: "/api/v1/feedback",
    sources: ["ctcg-derived"],
    source_license: ["CC0-1.0"],
    freshness: "status",
    no_cache: true,
  });
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
