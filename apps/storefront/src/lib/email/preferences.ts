// Per-user email preferences + signed unsubscribe tokens.
//
// Design:
//   - Absence of a row in user_email_preferences = "use schema defaults".
//     This keeps the table small: we only write a row when the user actually
//     clicks something.
//   - canSendEvent(userId, category) is the single gate every email goes
//     through. sendEmail() in send.ts calls it automatically when caller
//     supplies { unsubscribe: { userId, category } }.
//   - Tokens are HMAC-signed, expire after 90 days, and encode (userId,
//     category, issued-at). No user_id in clear-text URLs.
//   - Essential categories (magic links, receipts, shipments) are never
//     gated — callers omit the `unsubscribe` param entirely.

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
  | "marketing";

const ALL_CATEGORIES: EmailCategory[] = [
  "pull_resolved",
  "vault_redeemed",
  "vault_sold_back",
  "vault_expired",
  "vault_expiring_soon",
  "streak_at_risk",
  "marketing",
];

const DEFAULTS: Record<EmailCategory, boolean> = {
  pull_resolved: true,
  vault_redeemed: true,
  vault_sold_back: true,
  vault_expired: true,
  vault_expiring_soon: true,
  streak_at_risk: false,
  marketing: false,
};

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  pull_resolved: "Pull resolved",
  vault_redeemed: "Vault item shipped",
  vault_sold_back: "Sell-back confirmations",
  vault_expired: "Vault item auto-expired",
  vault_expiring_soon: "Vault item expiring soon",
  streak_at_risk: "Streak at risk (re-engagement)",
  marketing: "Newsletters + promotions",
};

export const CATEGORY_DESCRIPTIONS: Record<EmailCategory, string> = {
  pull_resolved: "The card you rolled and its provably-fair proof.",
  vault_redeemed: "Your physical card is on its way — tracking + address.",
  vault_sold_back: "A sell-back from your vault is confirmed.",
  vault_expired: "A vault item passed its 180-day expiry — we converted it to store credit.",
  vault_expiring_soon: "Seven-day warning before an item auto-expires.",
  streak_at_risk: "One-tap nudge when your daily streak is about to break.",
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
  source: "email_link" | "preference_page" | "list_unsubscribe";
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await setPreferences(args.userId, { [args.category]: false });
  await query(
    `INSERT INTO email_unsubscribe_log (user_id, category, source, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [args.userId, args.category, args.source, args.ip ?? null, args.userAgent ?? null],
  );
}
