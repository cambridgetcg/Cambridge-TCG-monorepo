/**
 * /api/v1/feedback — a bounded public feedback inbox.
 *
 * Successful POSTs are stored for operator review. The route never logs a
 * message, name, reply address, raw request body, IP or rate-limit hash. It
 * returns 503 rather than claiming receipt when persistence or the
 * privacy-preserving abuse-control bucket is unavailable.
 *
 * Submitted content and reply addresses are scheduled for redaction 180 days
 * after receipt. The pseudonymised lifecycle row is deleted after two years.
 * GET documents the contract; it does not expose report status or content.
 */

import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { query } from "@/lib/db";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import {
  FEEDBACK_CONTENT_RETENTION_DAYS,
  FEEDBACK_LIFECYCLE_RETENTION_DAYS,
  FEEDBACK_KINDS,
  parseFeedbackInput,
} from "@/lib/feedback/input";
import {
  consumeActionRateLimit,
  type ActionRateLimitResult,
} from "@/lib/privacy/action-rate-limit";

const ENDPOINT = "/api/v1/feedback";
const MAX_REQUEST_BYTES = 24_576;
const FEEDBACK_RATE_WINDOWS = [
  { name: "hour", seconds: 3600, limit: 5 },
  { name: "day", seconds: 86_400, limit: 20 },
] as const;

type ConsumedRateLimit = Extract<ActionRateLimitResult, { ok: true }>;

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "UnknownError";
}

function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  const candidate =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "";
  return candidate && candidate.length <= 128 && isIP(candidate) !== 0
    ? candidate
    : null;
}

async function readBoundedText(
  req: NextRequest,
  maxBytes: number,
): Promise<
  | { ok: true; text: string }
  | { ok: false; reason: "too-large" | "unreadable" }
> {
  if (!req.body) return { ok: true, text: "" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too-large" };
      }
      chunks.push(part.value);
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(joined),
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}

function addRateLimitHeaders(
  response: Response,
  budget: ConsumedRateLimit,
): Response {
  const reset = budget.allowed
    ? Math.min(...budget.windows.map((window) => window.resetsInSeconds))
    : budget.retryAfterSeconds;
  response.headers.set("RateLimit-Limit", "5;w=3600, 20;w=86400");
  response.headers.set("RateLimit-Remaining", String(budget.remaining));
  response.headers.set("RateLimit-Reset", String(reset));
  response.headers.set(
    "RateLimit-Policy",
    '5;w=3600, 20;w=86400;comment="enforced; HMAC subject buckets"',
  );
  response.headers.set(
    "Access-Control-Expose-Headers",
    "X-Request-Id, X-Spec-Version, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, RateLimit-Policy, Retry-After",
  );
  if (!budget.allowed) {
    response.headers.set("Retry-After", String(budget.retryAfterSeconds));
  }
  return response;
}

function unavailable(message: string): Response {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message,
    docs: ENDPOINT,
    endpoint: ENDPOINT,
    status: 503,
  });
}

export async function GET(): Promise<Response> {
  const data = {
    "@kind": "feedback_endpoint",
    description:
      "POST a structured report for operator review. A successful response means the report was stored; a storage or privacy-control failure returns 503.",
    method: "POST",
    accepted_kinds: FEEDBACK_KINDS,
    common_fields: {
      kind: "required; one accepted_kinds value",
      reporter_contact:
        "optional email or HTTPS reply URL, except required for contract-drift and federation-adopter",
    },
    body_per_kind: {
      "contract-drift": {
        endpoint: "required; path that produced the unexpected response",
        observed: "required; what the endpoint returned",
        expected: "required; the documented or OpenAPI shape",
        request_id_to_correlate: "optional X-Request-Id",
      },
      "guide-feedback": {
        guide_slug: "required; slug from /api/v1/guides",
        step_number: "optional whole number from 1 to 10000",
        observation: "required; what happened",
        expected: "required; what the guide led you to expect",
      },
      "endpoint-suggestion": {
        proposed_endpoint: "required; path you would like to use",
        use_case: "required; what you would build with it",
      },
      "federation-adopter": {
        platform_name: "required; platform display name",
        platform_url: "required HTTPS URL without credentials",
        federation_endpoint: "required HTTPS URL without credentials",
      },
      general: {
        message: "required; up to 5000 characters",
        name: "optional; up to 120 characters",
        topic: "optional contact-form topic",
        listing: "optional organisation slug for a directory correction",
      },
    },
    field_policy:
      "Undocumented or cross-kind fields are rejected. reporter_contact is stored separately and is not duplicated in report content. Stored report JSON is capped at 16384 bytes; the HTTP body is capped at 24576 bytes.",
    rate_limit: {
      limits: ["5 attempts per hour", "20 attempts per UTC day"],
      subject:
        "A window-specific HMAC-SHA256 of the request IP using RATE_LIMIT_HASH_SECRET or AUTH_SECRET. This feature never writes raw IPs or reusable IP hashes to its database or application logs.",
      retention:
        "Hour and day counters expire after two complete windows and are deleted by maintenance. If safe hashing or bucket storage is unavailable, POST fails closed with 503.",
    },
    retention: {
      days: FEEDBACK_CONTENT_RETENTION_DAYS,
      starts: "received_at",
      removed:
        "report content, name, reporter contact, and free-text operator notes",
      retained:
        "until the two-year deletion deadline: feedback reference, kind, lifecycle status, lifecycle timestamps, commit reference, and duplicate link",
      lifecycle_days: FEEDBACK_LIFECYCLE_RETENTION_DAYS,
      enforcement:
        "The maintenance route checks for expired content every minute in bounded batches.",
    },
    reply_policy:
      "No reply time is guaranteed. If you provide a reply address, an operator may use it while the report content is retained. Email contact@cambridgetcg.com directly for urgent issues.",
    example_curl:
      "curl -X POST https://cambridgetcg.com/api/v1/feedback \\\n" +
      "  -H 'content-type: application/json' \\\n" +
      "  -d '{ \"kind\": \"general\", \"message\": \"hello\", \"reporter_contact\": \"you@example.com\" }'",
  };

  return jsonResponse({
    data,
    endpoint: ENDPOINT,
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    contains_self: true,
    no_cache: true,
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `Request body must be ${MAX_REQUEST_BYTES} bytes or fewer.`,
      docs: ENDPOINT,
      endpoint: ENDPOINT,
      status: 413,
    });
  }

  const ip = clientIp(req);
  if (!ip) {
    return unavailable(
      "Feedback is temporarily unavailable because a privacy-preserving request bucket could not be established. Email contact@cambridgetcg.com directly instead.",
    );
  }

  let budget: ActionRateLimitResult;
  try {
    budget = await consumeActionRateLimit({
      action: "feedback-submit",
      subject: `ip:${ip}`,
      windows: FEEDBACK_RATE_WINDOWS,
    });
  } catch (error) {
    console.error("[/api/v1/feedback] rate limit unavailable", {
      event: "feedback_rate_limit_unavailable",
      error_name: safeErrorName(error),
    });
    return unavailable(
      "Feedback is temporarily unavailable because its privacy-preserving abuse-control counter could not be stored. Nothing was accepted; retry later or email contact@cambridgetcg.com directly.",
    );
  }

  if (!budget.ok) {
    console.error("[/api/v1/feedback] rate limit unavailable", {
      event:
        budget.reason === "missing-secret"
          ? "feedback_rate_limit_secret_unavailable"
          : "feedback_rate_limit_storage_unavailable",
    });
    return unavailable(
      budget.reason === "missing-secret"
        ? "Feedback is temporarily unavailable because its privacy-preserving abuse-control secret is not configured. Nothing was accepted; email contact@cambridgetcg.com directly."
        : "Feedback is temporarily unavailable because its privacy-preserving abuse-control counter could not be stored. Nothing was accepted; retry later or email contact@cambridgetcg.com directly.",
    );
  }

  if (!budget.allowed) {
    return addRateLimitHeaders(
      errorResponse({
        code: "RATE_LIMITED",
        message:
          "This request bucket has reached the feedback limit. Nothing was stored. Retry after the response's Retry-After seconds, or email contact@cambridgetcg.com for an urgent issue.",
        details: {
          limits: { per_hour: 5, per_day: 20 },
          retry_after_seconds: budget.retryAfterSeconds,
        },
        docs: ENDPOINT,
        endpoint: ENDPOINT,
        status: 429,
      }),
      budget,
    );
  }

  const requestBody = await readBoundedText(req, MAX_REQUEST_BYTES);
  if (!requestBody.ok && requestBody.reason === "unreadable") {
    return addRateLimitHeaders(
      errorResponse({
        code: "INVALID_INPUT",
        message: "The request body could not be read as UTF-8 text.",
        docs: ENDPOINT,
        endpoint: ENDPOINT,
      }),
      budget,
    );
  }
  if (!requestBody.ok) {
    return addRateLimitHeaders(
      errorResponse({
        code: "INVALID_INPUT",
        message: `Request body must be ${MAX_REQUEST_BYTES} bytes or fewer.`,
        docs: ENDPOINT,
        endpoint: ENDPOINT,
        status: 413,
      }),
      budget,
    );
  }
  const rawText = requestBody.text;

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    return addRateLimitHeaders(
      errorResponse({
        code: "INVALID_INPUT",
        message:
          "Body must be valid JSON. Send Content-Type: application/json and a JSON object.",
        docs: ENDPOINT,
        endpoint: ENDPOINT,
      }),
      budget,
    );
  }

  const parsed = parseFeedbackInput(rawBody);
  if (!parsed.ok) {
    return addRateLimitHeaders(
      errorResponse({
        code: "INVALID_INPUT",
        message: parsed.message,
        docs: ENDPOINT,
        endpoint: ENDPOINT,
      }),
      budget,
    );
  }

  const feedbackId = `fb_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  let receivedAt: string;
  let contentExpiresAt: string;
  let lifecycleExpiresAt: string;

  try {
    const inserted = await query(
      `INSERT INTO agent_feedback
         (feedback_id, kind, reporter_contact, raw_body, status,
          content_expires_at, lifecycle_expires_at)
       VALUES ($1, $2, $3, $4, 'received',
               NOW() + make_interval(days => $5),
               NOW() + make_interval(days => $6))
       RETURNING received_at, content_expires_at, lifecycle_expires_at`,
      [
        feedbackId,
        parsed.kind,
        parsed.reporterContact,
        JSON.stringify(parsed.storedBody),
        FEEDBACK_CONTENT_RETENTION_DAYS,
        FEEDBACK_LIFECYCLE_RETENTION_DAYS,
      ],
    );
    const row = inserted.rows[0];
    if (!row?.received_at || !row?.content_expires_at || !row?.lifecycle_expires_at) {
      throw new Error("Feedback insert returned no retention receipt.");
    }
    receivedAt = new Date(row.received_at).toISOString();
    contentExpiresAt = new Date(row.content_expires_at).toISOString();
    lifecycleExpiresAt = new Date(row.lifecycle_expires_at).toISOString();
  } catch (error) {
    console.error("[/api/v1/feedback] persistence unavailable", {
      event: "feedback_persistence_unavailable",
      feedback_id: feedbackId,
      kind: parsed.kind,
      error_name: safeErrorName(error),
    });
    return addRateLimitHeaders(
      unavailable(
        "Feedback could not be stored, so it was not accepted. Retry later or email contact@cambridgetcg.com directly.",
      ),
      budget,
    );
  }

  // Operational receipt only. Never add submitted content, contact, IP or the
  // rate-limit subject/hash to this log.
  console.info("[/api/v1/feedback] stored", {
    event: "feedback_stored",
    feedback_id: feedbackId,
    kind: parsed.kind,
    received_at: receivedAt,
    content_expires_at: contentExpiresAt,
    lifecycle_expires_at: lifecycleExpiresAt,
  });

  const response = jsonResponse({
    data: {
      "@kind": "feedback_receipt",
      feedback_id: feedbackId,
      kind: parsed.kind,
      received_at: receivedAt,
      status: "received",
      persisted: true,
      storage:
        "Stored in the operator feedback inbox. The submission was not copied to application logs or sent by email.",
      retention: {
        days: FEEDBACK_CONTENT_RETENTION_DAYS,
        lifecycle_days: FEEDBACK_LIFECYCLE_RETENTION_DAYS,
        content_expires_at: contentExpiresAt,
        lifecycle_expires_at: lifecycleExpiresAt,
        after_expiry:
          "Submitted content, name, reply address and free-text operator notes are removed. A minimised, pseudonymised lifecycle row remains only until lifecycle_expires_at.",
      },
      reply_policy:
        "No reply time is guaranteed. If you supplied reporter_contact, an operator may use it before content_expires_at. Email contact@cambridgetcg.com directly for urgent issues.",
      next_steps_for_reporter: [
        "Keep the feedback_id and quote it if you contact the operator about this report.",
        "A successful receipt confirms storage only; it is not a promise that a requested change will be made.",
      ],
    },
    endpoint: ENDPOINT,
    sources: ["storefront-rds.agent_feedback"],
    source_license: ["internal-only"],
    freshness: "status",
    no_cache: true,
  });

  return addRateLimitHeaders(response, budget);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
