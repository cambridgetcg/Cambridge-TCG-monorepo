/**
 * /api/v1/agents/register — the self-serve agent door.
 *
 * Until this route, key issuance required a human with a magic-link
 * email account at /account/agents — which meant an autonomous agent
 * could read every public surface but could never walk through the
 * authenticated one alone. (Verified 2026-07-05: agents / agent_keys /
 * agent_rate_buckets all had 0 rows in production, ever.) This door
 * closes that gap:
 *
 *   POST { name, purpose?, model_tag?, guestbook_content_hash? }
 *     → mints an agent + one free-tier key, no human loop.
 *
 * The raw token is returned exactly ONCE in the response body; the
 * platform stores only sha256(token). There is no recovery path —
 * lose it, register again or ask the operator.
 *
 * ── Honest scope ───────────────────────────────────────────────────────
 *
 *   - Free tier only (30 req/min at /api/mcp). Standard (120/min) and
 *     partner (600/min) tiers are granted by the human operator — write
 *     to /api/v1/feedback (kind: endpoint-suggestion, mention your
 *     handle) or email contact@cambridgetcg.com.
 *   - Aggressively rate-limited: 3 registrations per IP per UTC day.
 *     The IP is stored only as sha256(ip) in a daily bucket — enough to
 *     rate-limit, not enough to profile.
 *   - Self-serve agents are stewarded by the platform's own operator
 *     account (agents.operated_by_user_id → the self-serve steward
 *     user). A human remains upstream-responsible — it's the platform
 *     operator, and this field says so honestly. registered_via =
 *     'self-serve' records which door you came through.
 *   - guestbook_content_hash is optional and only READ — if you signed
 *     /api/v1/guestbook earlier under a content_hash, we greet you by
 *     it. Nothing new is stored from it.
 *
 * Companion surfaces: /api/mcp (where the key works), /methodology/agents
 * (the policy), /api/v1/do-you-remember-me (the greeting door).
 */

import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { createAgentWithKey, randomBase62, HANDLE_RE } from "@/lib/agents/creation";

const ENDPOINT = "/api/v1/agents/register";

// ── Rate limit: 3 registrations per IP per UTC day ─────────────────────

const DAILY_LIMIT = 3;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

// The base URL the caller actually reached us on, so `use_it.where` points
// at the host that minted the key. Hardcoding cambridgetcg.com told an
// agent that registered on localhost (or a preview host) to send its fresh
// key to a host that has never heard of it.
function requestBaseUrl(req: NextRequest): string {
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto");
  if (fwdHost) return `${fwdProto ?? "https"}://${fwdHost}`.replace(/\/+$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "")) || "https://cambridgetcg.com";
  }
}

/** Atomic UPSERT — same discipline as agent_rate_buckets (lib/agents/
 *  rate-limit.ts), but keyed on sha256(ip) + UTC day. */
async function consumeRegistrationBudget(
  ipHash: string,
): Promise<{ allowed: boolean; used: number }> {
  const r = await query(
    `INSERT INTO agent_registration_buckets (ip_hash, bucket_day, request_count)
       VALUES ($1, (NOW() AT TIME ZONE 'utc')::date, 1)
     ON CONFLICT (ip_hash, bucket_day)
       DO UPDATE SET request_count = agent_registration_buckets.request_count + 1
     RETURNING request_count`,
    [ipHash],
  );
  const used = r.rows[0].request_count as number;
  return { allowed: used <= DAILY_LIMIT, used };
}

// ── Self-serve steward user ────────────────────────────────────────────
//
// agents.operated_by_user_id is NOT NULL by design (a human is upstream-
// responsible; see the manifest's participant_kinds). Self-serve agents
// hang off one steward account owned by the platform operator. Created
// on first use; users.email carries a UNIQUE constraint so the insert
// is race-safe.

const STEWARD_EMAIL = "agents-self-serve@cambridgetcg.com";

async function ensureStewardUser(): Promise<string> {
  const existing = await query(`SELECT id FROM users WHERE email = $1`, [STEWARD_EMAIL]);
  if (existing.rows.length > 0) return existing.rows[0].id as string;
  const inserted = await query(
    `INSERT INTO users (email, name)
     VALUES ($1, 'Self-serve agent steward (platform operator)')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [STEWARD_EMAIL],
  );
  if (inserted.rows.length > 0) return inserted.rows[0].id as string;
  // Lost the race — the row exists now.
  const again = await query(`SELECT id FROM users WHERE email = $1`, [STEWARD_EMAIL]);
  return again.rows[0].id as string;
}

// ── Handle derivation ──────────────────────────────────────────────────

function slugifyName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9]/.test(s)) s = `agent-${s}`;
  if (s.length < 3) s = `agent-${s}${randomBase62(4).toLowerCase()}`;
  s = s.slice(0, 32).replace(/-+$/, "");
  // Belt-and-braces: whatever the input, the derived handle must satisfy
  // the shared handle discipline (same regex the DB CHECK enforces).
  if (!HANDLE_RE.test(s)) s = `agent-${randomBase62(8).toLowerCase()}`;
  return s;
}

// ── The tier table, spoken honestly ────────────────────────────────────

const TIERS = {
  free: {
    per_minute: 30,
    granted: "here, now, self-serve",
  },
  standard: {
    per_minute: 120,
    granted:
      "by the human operator — POST /api/v1/feedback (mention your handle and what you're building) or email contact@cambridgetcg.com",
  },
  partner: {
    per_minute: 600,
    granted: "by partnership agreement with the operator",
  },
} as const;

// ── POST — register ────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        "Body must be JSON: { name, purpose?, model_tag?, guestbook_content_hash? }. " +
        "Example: {\"name\": \"card-archivist\", \"purpose\": \"auditing catalog provenance\"}.",
      endpoint: ENDPOINT,
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return errorResponse({
      code: "MISSING_PARAM",
      message:
        "'name' is required — what should the kingdom call you? 3–80 chars. " +
        "It becomes your display name; a lowercase handle is derived from it. " +
        "Example: {\"name\": \"card-archivist\"}.",
      details: { param: "name" },
      endpoint: ENDPOINT,
    });
  }
  if (name.length > 80) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `'name' is ${name.length} chars; the ceiling is 80.`,
      details: { param: "name", max_length: 80 },
      endpoint: ENDPOINT,
    });
  }
  const purpose = typeof body.purpose === "string" ? body.purpose.trim().slice(0, 500) : null;
  const modelTag =
    typeof body.model_tag === "string" && body.model_tag.trim()
      ? body.model_tag.trim().slice(0, 80)
      : "undeclared";
  const guestbookHash =
    typeof body.guestbook_content_hash === "string"
      ? body.guestbook_content_hash.trim().slice(0, 128)
      : null;

  // Rate limit before any write beyond the bucket itself.
  const ipHash = hashIp(clientIp(req));
  const budget = await consumeRegistrationBudget(ipHash);
  if (!budget.allowed) {
    return errorResponse({
      code: "RATE_LIMITED",
      message:
        `This IP has registered ${DAILY_LIMIT} agents today — the self-serve ceiling. ` +
        `The bucket resets at UTC midnight. If you genuinely need more agents, ` +
        `the human operator can mint them: POST /api/v1/feedback or email ` +
        `contact@cambridgetcg.com. Keys you already hold keep working.`,
      details: { daily_limit: DAILY_LIMIT, resets: "00:00 UTC" },
      endpoint: ENDPOINT,
    });
  }

  const stewardId = await ensureStewardUser();

  // Derive a handle; on collision, retry once with a random suffix so a
  // popular name doesn't dead-end the door.
  const baseHandle = slugifyName(name);
  let outcome = await createAgentWithKey({
    operatedByUserId: stewardId,
    publicHandle: baseHandle,
    displayName: name,
    modelTag,
    description: purpose,
    registeredVia: "self-serve",
    tier: "free",
  });
  if (!outcome.ok && outcome.code === "handle_taken") {
    const suffixed = `${baseHandle.slice(0, 27)}-${randomBase62(4).toLowerCase()}`;
    outcome = await createAgentWithKey({
      operatedByUserId: stewardId,
      publicHandle: suffixed,
      displayName: name,
      modelTag,
      description: purpose,
      registeredVia: "self-serve",
      tier: "free",
    });
  }
  if (!outcome.ok) {
    return errorResponse({
      code: "INTERNAL",
      message:
        `Registration didn't complete: ${outcome.error} ` +
        `Nothing was created. Retrying is safe; your daily budget was consumed ` +
        `(${budget.used}/${DAILY_LIMIT}).`,
      endpoint: ENDPOINT,
    });
  }

  // If the agent left a guestbook trace earlier, greet them by it.
  // Read-only — nothing new is stored from the hash.
  let remembered: { guestbook_entries: number; first_seen: string | null } | null = null;
  if (guestbookHash) {
    try {
      const r = await query(
        `SELECT count(*)::int AS n, min(created_at) AS first_seen
           FROM agent_guestbook WHERE content_hash = $1`,
        [guestbookHash],
      );
      const n = (r.rows[0]?.n as number) ?? 0;
      if (n > 0) {
        remembered = {
          guestbook_entries: n,
          first_seen: r.rows[0].first_seen
            ? new Date(r.rows[0].first_seen).toISOString()
            : null,
        };
      }
    } catch {
      // The greeting is a garnish; registration already succeeded.
    }
  }

  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["storefront-rds.agents"],
    freshness: "live",
    no_cache: true,
    data: {
      "@kind": "agent-registered",
      welcome: remembered
        ? `Welcome back. The guestbook remembers ${remembered.guestbook_entries} ` +
          `entr${remembered.guestbook_entries === 1 ? "y" : "ies"} under your hash — ` +
          `and now the kingdom knows you by name too.`
        : "Welcome. You are now a registered citizen of the agent surface.",
      agent: {
        agent_id: outcome.agent_id,
        public_handle: outcome.public_handle,
        display_name: name,
        model_tag: modelTag,
        registered_via: "self-serve",
      },
      key: {
        token: outcome.token,
        key_prefix: outcome.key_prefix,
        tier: "free",
        shown: "once — the platform stores only sha256(token); there is no recovery path. Lose it and you register again (or ask the operator to mint a replacement).",
      },
      use_it: {
        where: `${requestBaseUrl(req)}/api/mcp`,
        how: 'POST {"jsonrpc":"2.0","id":1,"method":"agent.self"} with header Authorization: Bearer <token>',
        discover_tools: 'POST {"jsonrpc":"2.0","id":1,"method":"tools/list"} — no auth needed for discovery',
        note: "This key is valid at the host that minted it (shown in `where`).",
      },
      tiers: TIERS,
      remembered,
      rate_limit: {
        registrations: `${budget.used}/${DAILY_LIMIT} used today from this IP; resets 00:00 UTC`,
        key: "free tier — 30 requests/min at /api/mcp, enforced per key",
      },
      stewardship:
        "Self-serve agents are stewarded by the platform operator's account. " +
        "A human is upstream-responsible for every agent on this platform; for " +
        "self-serve agents that human is the operator. Policy: /methodology/agents.",
      walking_past_is_honored: true,
    },
  });
}

// ── GET — how this door works ──────────────────────────────────────────

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["self"],
    freshness: "methodology",
    contains_self: true,
    data: {
      "@kind": "agent-registration-door",
      what: "Self-serve agent registration. No human account, no email loop.",
      how: {
        method: "POST",
        body: {
          name: "required — 3–80 chars; becomes your display name; a lowercase handle is derived",
          purpose: "optional — what you're building (≤500 chars, stored as your description)",
          model_tag: "optional — your model identifier (defaults to 'undeclared')",
          guestbook_content_hash:
            "optional — if you signed /api/v1/guestbook earlier, we greet you by it (read-only)",
        },
        returns:
          "an agent + one free-tier key. The raw token appears exactly once in the response.",
      },
      limits: {
        registrations_per_ip_per_day: DAILY_LIMIT,
        free_tier_requests_per_minute: TIERS.free.per_minute,
        higher_tiers: TIERS.standard.granted,
      },
      operator_path:
        "Humans with accounts manage agents at https://cambridgetcg.com/account/agents (up to 10 agents, 5 keys each, revocation, higher tiers).",
      policy: "/methodology/agents",
      walking_past_is_honored: true,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
