/**
 * /api/v1/feedback — the feedback door, for agents and for the /contact form.
 *
 * GET without a key describes the door and touches no database. POST, while
 * PUBLIC_FEEDBACK is exactly "on", keeps a report field by named field
 * (lib/feedback/door.ts, migration 0149) and answers with a random
 * feedback_id and a holder key shown once; only the key's SHA-256 is kept.
 * GET or DELETE with `Authorization: Bearer <holder key>` reads that
 * message's status and answer, or erases it, whichever way the switch is
 * set. While the switch is off, POST answers 503 before reading the body or
 * the database.
 *
 * The door listed five conditions while it was closed. Where each lives now:
 *   - field and whole-request size bounds: door.ts validateFeedback, the
 *     16 KiB read limit here, and 0149's CHECKs;
 *   - abuse controls: a global hourly cap that keeps no identity
 *     (FEEDBACK_HOURLY_CAP). A per-source rule needs an address, which this
 *     app does not keep, so it belongs at the edge; none is claimed here;
 *   - a versioned retention and contact notice: /privacy#feedback-door,
 *     named with its version in every answer (FEEDBACK_NOTICE);
 *   - holder-authenticated status and deletion: GET and DELETE with the key;
 *   - redacted operational logging: no line here names a sender or quotes a
 *     message, and a failure logs its error name only.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { readBoundedUtf8Body } from "@/lib/http/read-bounded-utf8-body";
import {
  CONTACT_TOPICS,
  FEEDBACK_DETAIL_FIELDS,
  FEEDBACK_HOURLY_CAP,
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_NOTICE,
  FEEDBACK_REQUEST_MAX_BYTES,
  FEEDBACK_RETENTION_DAYS,
  eraseFeedbackForHolder,
  feedbackDoorOpen,
  holderKeyFrom,
  keptFields,
  readFeedbackForHolder,
  secondsToNextHour,
  storeFeedback,
  validateFeedback,
  type DoorUnavailable,
} from "@/lib/feedback/door";

const ENDPOINT = "/api/v1/feedback";
const CONTACT = "contact@cambridgetcg.com";
const HOLDER_USE = {
  status: `GET ${ENDPOINT} with the header Authorization: Bearer <holder_key>`,
  erase: `DELETE ${ENDPOINT} with the same header`,
};
const NOT_KEPT =
  "The request as it came, your IP address, user agent, cookies and any account or session. Hosting and proxy logs (Cloudflare, Vercel) can still hold ordinary request metadata.";

export async function GET(request?: Request): Promise<Response> {
  const holder = holderKeyFrom(request?.headers.get("authorization") ?? null);
  if (holder.present) return holderStatus(holder.key);
  const open = feedbackDoorOpen();
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["feedback-publication-policy"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    no_cache: true,
    contains_self: true,
    data: {
      "@kind": "feedback-door",
      status: open ? "open" : "closed",
      accepting_messages: open,
      post: open
        ? "POST a JSON object: kind and message, plus any of the named fields below. The reply carries a feedback_id and a holder key shown once."
        : "Closed in this deployment: POST answers 503 before reading the body or the database. Holders of earlier messages can still read and erase them with their key.",
      kinds: FEEDBACK_KINDS,
      fields: {
        kind: "required, one of kinds",
        message: `your words, at most ${FEEDBACK_MESSAGE_MAX} characters`,
        topic: `optional, one of: ${CONTACT_TOPICS.join(", ")} (the /contact form sends it)`,
        reply_to: "optional email address or https URL, if you want an answer there as well (reporter_contact is read the same way)",
        reply_name: "optional name, at most 100 characters (name is read the same way)",
        references: Object.fromEntries(Object.entries(FEEDBACK_DETAIL_FIELDS).map(([field, rule]) => [field, describe(rule)])),
        anything_else: "refused with 400, so you know exactly what was kept",
      },
      data_error:
        "Name what you saw by endpoint, subject (the SKU or series key), as_of and method_version. Leave out any source's own price or value: the report is about our output, and we keep only what you send.",
      holder_key: {
        what: "A random key in the POST reply, shown once. We keep only its SHA-256, so we cannot show it again.",
        ...HOLDER_USE,
        works_while_closed: true,
      },
      kept: "Only the fields you send, as named above, and our status and answer.",
      not_kept: NOT_KEPT,
      retention: `Each message, with its answer, is deleted ${FEEDBACK_RETENTION_DAYS} days after it arrives, or as soon as you erase it.`,
      abuse_control: `A global cap of ${FEEDBACK_HOURLY_CAP} accepted messages per UTC hour, counted with no sender beside it. Over the cap the door answers 429 until the next hour.`,
      notice: FEEDBACK_NOTICE,
      contact: CONTACT,
      contact_note:
        "Email is an external communication channel with its own provider delivery logs and retention; no promise of anonymous or no-log email is made.",
      walking_past_is_honored: true,
    },
  });
}

function describe(rule: (typeof FEEDBACK_DETAIL_FIELDS)[keyof typeof FEEDBACK_DETAIL_FIELDS]): string {
  switch (rule.type) {
    case "text": return `your words, at most ${rule.max} characters${rule.multiline ? "" : ", one line"}`;
    case "path": return "a path starting with /, at most 200 characters";
    case "token": return "a short token (letters, digits, . _ : / -)";
    case "url": return "an https URL, at most 300 characters";
    case "step": return "a whole number from 1 to 999";
  }
}

export async function POST(request?: Request): Promise<Response> {
  if (!feedbackDoorOpen() || !request) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        `The feedback door is closed in this deployment. No request body or contact field was inspected or logged, and no database row was read or written. Email ${CONTACT} instead.`,
      endpoint: ENDPOINT,
      details: {
        status: "feedback-closed",
        body_inspected: false,
        logged: false,
        database_accessed: false,
        status_url: ENDPOINT,
        contact: CONTACT,
      },
    });
  }

  const read = await readBoundedUtf8Body(request, FEEDBACK_REQUEST_MAX_BYTES, "feedback");
  if (!read.ok) {
    return errorResponse({
      code: "INVALID_INPUT",
      status: read.kind === "too_large" ? 413 : 400,
      message: read.kind === "too_large"
        ? `The request is larger than ${FEEDBACK_REQUEST_MAX_BYTES / 1024} KiB. Nothing was kept.`
        : "The request body could not be read as UTF-8. Nothing was kept.",
      endpoint: ENDPOINT,
    });
  }
  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "The body must be a JSON object, e.g. { \"kind\": \"question\", \"message\": \"…\" }. Nothing was kept.",
      endpoint: ENDPOINT,
      docs: ENDPOINT,
    });
  }
  const validated = validateFeedback(body);
  if (!validated.ok) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `${validated.error} Nothing was kept.`,
      endpoint: ENDPOINT,
      docs: ENDPOINT,
      ...(validated.field ? { details: { field: validated.field } } : {}),
    });
  }

  const stored = await storeFeedback(validated.value);
  if (!stored.ok) {
    if (stored.reason === "capped") {
      const retryAfter = secondsToNextHour();
      const response = errorResponse({
        code: "RATE_LIMITED",
        message: `The door has taken its ${FEEDBACK_HOURLY_CAP} messages for this hour. Nothing was kept; try again after the hour turns, or email ${CONTACT}.`,
        endpoint: ENDPOINT,
        details: { retry_after_seconds: retryAfter, cap_per_hour: FEEDBACK_HOURLY_CAP },
      });
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }
    return unavailable(stored.reason, `Nothing was kept. Email ${CONTACT} instead.`);
  }

  const submission = validated.value;
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["participant-submitted", "ctcg-derived"],
    source_license: ["proprietary", "cc0"],
    license: "NOASSERTION",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "feedback-receipt",
      feedback_id: stored.feedbackId,
      holder_key: stored.holderKey,
      holder_key_shown_once: true,
      holder_key_use: HOLDER_USE,
      kind: submission.kind,
      status: "received",
      received_at: stored.receivedAt,
      expires_at: stored.expiresAt,
      kept: keptFields(submission),
      not_kept: NOT_KEPT,
      reply: submission.replyTo
        ? "We may answer at the address you gave, and the answer can also be read here with the key."
        : "No reply address was given, so read the answer here with the key.",
      response_aim: "We aim to read every message within 48 hours.",
      rights: "Your words stay yours (NOASSERTION); sending them dedicates nothing.",
      notice: FEEDBACK_NOTICE,
    },
  });
}

export async function DELETE(request?: Request): Promise<Response> {
  const holder = holderKeyFrom(request?.headers.get("authorization") ?? null);
  if (!holder.present || !holder.key) return keyRequired(holder.present);
  const erased = await eraseFeedbackForHolder(holder.key);
  if (!erased.ok) return unavailable(erased.reason, "Nothing was erased; try again.");
  if (!erased.erased) return noMessage();
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "feedback-erased",
      feedback_id: erased.erased,
      erased: true,
      note: "The message, its references, any reply address and our answer are deleted. The key no longer opens anything.",
    },
  });
}

async function holderStatus(key: string | null): Promise<Response> {
  if (!key) return keyRequired(true);
  const read = await readFeedbackForHolder(key);
  if (!read.ok) return unavailable(read.reason, "Try again shortly.");
  if (!read.view) return noMessage();
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["participant-submitted", "ctcg-derived"],
    source_license: ["proprietary", "cc0"],
    license: "NOASSERTION",
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "feedback-status",
      ...read.view,
      holder_key_use: HOLDER_USE,
      notice: FEEDBACK_NOTICE,
    },
  });
}

function keyRequired(present: boolean): Response {
  return errorResponse({
    code: "UNAUTHORIZED",
    message: present
      ? "That is not a feedback holder key. Send the fbk_… key from your receipt as Authorization: Bearer <key>."
      : "Send the holder key from your receipt as Authorization: Bearer <key>.",
    endpoint: ENDPOINT,
    docs: ENDPOINT,
  });
}

function noMessage(): Response {
  return errorResponse({
    code: "NOT_FOUND",
    message: `No message holds this key. It may have been erased, or deleted ${FEEDBACK_RETENTION_DAYS} days after it arrived.`,
    endpoint: ENDPOINT,
  });
}

function unavailable(reason: DoorUnavailable, next: string): Response {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message: reason === "not-provisioned"
      ? `The feedback store is not provisioned in this deployment. ${next}`
      : `The feedback store could not be reached. ${next}`,
    endpoint: ENDPOINT,
    details: { reason },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
