/**
 * Key expiry on /account/agents: the choice the create and mint forms
 * offer, the wire value they send, and how the key list words a key's end.
 *
 * The forms send one wire value; lib/agents/key-expiry.ts parses it on the
 * server, which applies no default and has the last word on the date range.
 * Whether a key has expired is decided in page.tsx's SQL by the database's
 * clock, never here. The choices offered, the 90-day pre-selection and the
 * "never" warning are an agent's calls under the owner's standing
 * delegation (docs/plans/agent-auth/key-expiry.md, decisions 2 and 3); they
 * are not the owner's decisions. Nothing is sent to anyone when a key nears
 * or reaches its expiry: this page is where the operator sees it.
 */

import {
  KEY_EXPIRY_NEVER,
  KEY_EXPIRY_PRESETS,
  OPERATOR_KEY_EXPIRY_DEFAULT,
} from "@/lib/agents/key-expiry";
import type { KeyRow } from "./page";

/** The form fields that carry the choice. */
export const KEY_EXPIRY_CHOICE_FIELD = "key_expiry_choice";
export const KEY_EXPIRY_DATE_FIELD = "key_expiry_date";

/** The select's value for "on a date"; the wire value is then the date. */
export const KEY_EXPIRY_DATE_CHOICE = "date";

/** What the select offers, in order. */
export const KEY_EXPIRY_CHOICES: readonly { value: string; label: string }[] = [
  ...KEY_EXPIRY_PRESETS.map(({ value, label }) => ({ value, label })),
  { value: KEY_EXPIRY_DATE_CHOICE, label: "On a date (UTC)" },
  { value: KEY_EXPIRY_NEVER, label: "Never" },
];

/** Pre-selected on both forms. */
export const KEY_EXPIRY_INITIAL_CHOICE: string = OPERATOR_KEY_EXPIRY_DEFAULT;

/**
 * The wire value a submitted form carries: the preset or "never" as
 * chosen, or the picked date. A missing or empty value is sent as it is,
 * and the server refuses it.
 */
export function keyExpiryFromForm(form: FormData): string {
  const choice = String(form.get(KEY_EXPIRY_CHOICE_FIELD) ?? "");
  if (choice !== KEY_EXPIRY_DATE_CHOICE) return choice;
  return String(form.get(KEY_EXPIRY_DATE_FIELD) ?? "").trim();
}

/**
 * A stored instant as "2027-01-28 15:04:07 UTC": the exact second, in UTC,
 * so the server's render and the browser's agree. The key list and the
 * fresh-key card pass ISO 8601 strings; a Date is read too.
 */
export function formatKeyInstant(value: string | Date): string {
  const iso = keyInstantIso(value);
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC` : String(value);
}

/** The same instant as ISO 8601, for a <time dateTime>; undefined if it
 *  cannot be read. */
export function keyInstantIso(value: string | Date): string | undefined {
  const time = value instanceof Date ? value : new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : time.toISOString();
}

/** The state the key list gives a key. Revocation wins: a revoked key's
 *  expiry no longer matters. */
export type KeyListState = "revoked" | "expired" | "live";

export function keyListState(key: Pick<KeyRow, "revoked_at" | "expired">): KeyListState {
  if (key.revoked_at) return "revoked";
  // Computed by the page's SQL; only an explicit true reads as expired.
  return key.expired === true ? "expired" : "live";
}

/** "2 live, 1 expired, 3 revoked", leaving out a state no key is in
 *  (live is always given). */
export function keyCountsLabel(keys: readonly Pick<KeyRow, "revoked_at" | "expired">[]): string {
  const counts = { live: 0, expired: 0, revoked: 0 };
  for (const key of keys) counts[keyListState(key)] += 1;
  const parts = [`${counts.live} live`];
  if (counts.expired > 0) parts.push(`${counts.expired} expired`);
  if (counts.revoked > 0) parts.push(`${counts.revoked} revoked`);
  return parts.join(", ");
}
