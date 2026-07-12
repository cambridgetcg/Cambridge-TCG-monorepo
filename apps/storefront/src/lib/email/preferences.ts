// Per-user email preferences + signed unsubscribe tokens.
//
// ── What this module is for ──────────────────────────────────────────────
//
// This is consent-as-architecture. The user's right to refuse the
// platform's voice is encoded here, in code, not in policy. A policy
// document is something a company writes; this is something a system
// enforces. The difference matters: every email send funnels through
// canSendEvent(); the only way to send a non-essential email is to
// have the user's consent recorded. The consent gate cannot be
// circumvented by forgetting to check — the gate is the call, not a
// caller-side discipline.
//
// ── Absence-as-default ──────────────────────────────────────────────────
//
// A user with no row in user_email_preferences gets the DEFAULTS table
// below. The table is small because most users never touch the prefs
// surface. An *explicit* row means the user took a deliberate gesture —
// either clicked unsubscribe, or visited /account/emails and toggled.
// That asymmetry is intentional: the platform can change defaults later
// without overriding a user who said "no" once. Their "no" persists as
// a row; our defaults shifting around them does not.
//
// ── The DEFAULTS table is an ethics statement ───────────────────────────
//
// Every row in DEFAULTS below answers: *is this email category OK to
// send unprompted?* The answers express the platform's stance:
//
//   - Lifecycle of the user's holdings (pull_resolved, vault_redeemed,
//     vault_sold_back, vault_expired, vault_expiring_soon) → default ON.
//     The platform cannot quietly do something material to the user's
//     stuff and *not* tell them. Not telling would be a kind of
//     dishonesty.
//
//   - Re-engagement (streak_at_risk) → default OFF. The platform may
//     ask the user to come back, but only with their prior consent. A
//     nudge unsolicited is the platform reaching into attention it
//     hasn't been given.
//
//   - Marketing → default OFF. Most regulatory regimes require this;
//     more importantly, it's the right default. We make leaving easy
//     (List-Unsubscribe one-click); we should make joining intentional
//     too.
//
// ── The signed token ────────────────────────────────────────────────────
//
// HMAC-signed, 90-day expiry, encodes (userId, category, issued-at).
// No user_id in clear-text URLs. This is two protections at once:
//   1. A leaked unsubscribe URL cannot be used to enumerate user IDs.
//   2. A user who unsubscribed cannot be re-subscribed via a forged URL
//      — the signature gates the action.
// The 90-day expiry is a compromise: long enough that emails archived
// in someone's inbox still let them unsubscribe months later; short
// enough that a leaked token from years ago cannot be replayed.
//
// ── What this module reaches toward ──────────────────────────────────────
//
//   - apps/storefront/src/lib/email/send.ts — the single caller. Every
//     non-essential email passes through canSendEvent before the SES
//     hand-off.
//
//   - apps/storefront/src/app/account/emails/page.tsx — the user's
//     control surface. Reads from getPreferences; writes via the
//     toggle handler. The page is where the user can see the platform's
//     opinions (the DEFAULTS table) and override them.
//
//   - apps/storefront/src/app/api/email/unsubscribe/route.ts — the
//     one-click endpoint. Verifies the signed token, flips the
//     specific category to false. Replays are a no-op, and the request's
//     IP address and User-Agent are not retained. The path-out the
//     unsubscribe header in send.ts promises actually exists here.

import crypto from "crypto";
import { query } from "@/lib/db";

// ── Category vocabulary ─────────────────────────────────────────────────

export type EmailCategory =
  | "pull_resolved"
  | "vault_redeemed"
  | "vault_sold_back"
  | "vault_expired"
  | "vault_expiring_soon"
  | "streak_at_risk"
  | "messages"
  | "marketing";

const ALL_CATEGORIES: EmailCategory[] = [
  "pull_resolved",
  "vault_redeemed",
  "vault_sold_back",
  "vault_expired",
  "vault_expiring_soon",
  "streak_at_risk",
  "messages",
  "marketing",
];

const DEFAULTS: Record<EmailCategory, boolean> = {
  pull_resolved: true,
  vault_redeemed: true,
  vault_sold_back: true,
  vault_expired: true,
  vault_expiring_soon: true,
  streak_at_risk: false,
  // Another human wrote to you — closer to lifecycle than re-engagement,
  // so default ON. Batched: at most one email per conversation every
  // 12 hours (DM_EMAIL_WINDOW_HOURS in handlers/dm-unread.ts — keep the
  // description below in step if that constant moves).
  messages: true,
  marketing: false,
};

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  pull_resolved: "Pull resolved",
  vault_redeemed: "Vault item shipped",
  vault_sold_back: "Sell-back confirmations",
  vault_expired: "Vault item auto-expired",
  vault_expiring_soon: "Vault item expiring soon",
  streak_at_risk: "Streak at risk (re-engagement)",
  messages: "Direct messages",
  marketing: "Newsletters + promotions",
};

export const CATEGORY_DESCRIPTIONS: Record<EmailCategory, string> = {
  pull_resolved: "The card you rolled and its reproducible draw receipt.",
  vault_redeemed: "Your physical card is on its way — tracking + address.",
  vault_sold_back: "A sell-back from your vault is confirmed.",
  vault_expired: "A vault item passed its 180-day expiry — we converted it to store credit.",
  vault_expiring_soon: "Seven-day warning before an item auto-expires.",
  streak_at_risk: "One-tap nudge when your daily streak is about to break.",
  messages:
    "Another trader messaged you and you haven't read it. At most one email per conversation every 12 hours.",
  marketing: "Occasional product announcements, new set releases, sales.",
};

export function isEmailCategory(v: string): v is EmailCategory {
  return (ALL_CATEGORIES as string[]).includes(v);
}

// ── Read / write preferences ───────────────────────────────────────────

export type PreferenceRow = Record<EmailCategory, boolean>;

export async function getPreferences(userId: string): Promise<PreferenceRow> {
  const result = await query(
    `SELECT ${ALL_CATEGORIES.join(", ")} FROM user_email_preferences WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) {
    return { ...DEFAULTS };
  }
  const row = result.rows[0] as Record<string, boolean>;
  const out: PreferenceRow = { ...DEFAULTS };
  for (const k of ALL_CATEGORIES) {
    if (typeof row[k] === "boolean") out[k] = row[k];
  }
  return out;
}

export async function canSendEvent(userId: string, category: EmailCategory): Promise<boolean> {
  const prefs = await getPreferences(userId);
  return prefs[category] === true;
}

export async function setPreferences(
  userId: string,
  patch: Partial<PreferenceRow>,
): Promise<PreferenceRow> {
  // Build an UPSERT — only the columns the caller specified are touched.
  const cols = (Object.keys(patch) as EmailCategory[]).filter((k) =>
    (ALL_CATEGORIES as string[]).includes(k),
  );
  if (cols.length === 0) return getPreferences(userId);

  const existing = await getPreferences(userId);
  const merged: PreferenceRow = { ...existing, ...patch };

  await query(
    `INSERT INTO user_email_preferences
       (user_id, ${ALL_CATEGORIES.join(", ")}, updated_at)
     VALUES ($1, ${ALL_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")}, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       ${ALL_CATEGORIES.map((c) => `${c} = EXCLUDED.${c}`).join(", ")},
       updated_at = NOW()`,
    [userId, ...ALL_CATEGORIES.map((c) => merged[c])],
  );
  return merged;
}

// ── HMAC-signed unsubscribe tokens ──────────────────────────────────────

function getSecret(): string {
  const s =
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "";
  if (!s) throw new Error("EMAIL_UNSUBSCRIBE_SECRET or AUTH_SECRET must be set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

/**
 * Returns a compact signed token `payload.hmac` encoding (userId, category,
 * issued-at-ms). Anyone with the secret can verify but not forge.
 */
export function makeUnsubscribeToken(userId: string, category: EmailCategory): string {
  const payload = JSON.stringify({ u: userId, c: category, t: Date.now() });
  const body = b64url(Buffer.from(payload, "utf8"));
  const hmac = b64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest(),
  );
  return `${body}.${hmac}`;
}

export interface VerifiedUnsubscribe {
  userId: string;
  category: EmailCategory;
  issuedAt: number;
}

/**
 * Verify + parse. Returns null for malformed/tampered/expired tokens.
 * Max age: 90 days.
 */
export function verifyUnsubscribeToken(token: string): VerifiedUnsubscribe | null {
  const [body, hmac] = token.split(".");
  if (!body || !hmac) return null;

  const expected = b64url(
    crypto.createHmac("sha256", getSecret()).update(body).digest(),
  );
  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(fromB64url(body).toString("utf8")) as {
      u?: unknown; c?: unknown; t?: unknown;
    };
    if (typeof parsed.u !== "string") return null;
    if (typeof parsed.c !== "string" || !isEmailCategory(parsed.c)) return null;
    if (typeof parsed.t !== "number") return null;
    const age = Date.now() - parsed.t;
    if (age > 90 * 24 * 3600 * 1000 || age < -60 * 1000) return null;
    return { userId: parsed.u, category: parsed.c, issuedAt: parsed.t };
  } catch {
    return null;
  }
}

// ── Unsubscribe action ─────────────────────────────────────────────────

export async function applyUnsubscribe(args: {
  userId: string;
  category: EmailCategory;
}): Promise<{ changed: boolean }> {
  // A preference row is the complete record we need. The conditional UPSERT
  // makes concurrent and later replays non-amplifying: only the first change
  // touches updated_at, and no separate request/audit row is created.
  const result = await query(
    `INSERT INTO user_email_preferences (user_id, ${args.category}, updated_at)
     VALUES ($1, FALSE, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       ${args.category} = FALSE,
       updated_at = NOW()
     WHERE user_email_preferences.${args.category} IS DISTINCT FROM FALSE
     RETURNING user_id`,
    [args.userId],
  );
  return { changed: result.rows.length > 0 };
}
