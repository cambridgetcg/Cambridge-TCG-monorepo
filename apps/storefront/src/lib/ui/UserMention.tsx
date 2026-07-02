/**
 * UserMention — pronouns + preferred-address-aware naming primitive.
 *
 * Every greeting on the platform, every third-person reference to a
 * user, every "Welcome back, X" passes through this. Reads two columns
 * the user can set on /account/profile:
 *
 *   - users.pronouns          (free-form: "she/her", "they/them", "any", custom)
 *   - users.preferred_address (one of: name | handle | formal | none | <custom>)
 *
 * Both nullable. Both default to platform-historical behavior when NULL
 * (greeting uses `name`; third-person uses "they/them" generic).
 *
 * Wave 1.1 of the All-Aboard plan. See docs/plans/all-aboard.md and
 * docs/connections/the-other-minds.md (the Telepath / Plural / Many-Bodied
 * lenses — three different kinds of mind whose limit case is the same
 * preference: don't presume; ask; honor.)
 *
 * ── Usage ─────────────────────────────────────────────────────────────
 *
 *   // Second-person greeting:
 *   <UserMention user={user} form="greeting" />
 *   // → "Hi, alice" / "Hi, Captain" / "Welcome back" / no greeting at all
 *
 *   // Third-person reference:
 *   <UserMention user={user} form="third-person" />
 *   // → "alice" (with pronouns surfaced in title attribute if set)
 *
 *   // Just the pronouns (pill, for profile pages):
 *   <UserMention user={user} form="pronouns-only" />
 *
 * ── Tone rules ────────────────────────────────────────────────────────
 *
 * No tone. This primitive is a *string*; surfaces decide their own tone.
 */

import * as React from "react";

export interface MentionableUser {
  name?: string | null;
  username?: string | null;
  pronouns?: string | null;
  preferred_address?: string | null;
}

interface UserMentionProps {
  user: MentionableUser;
  /**
   * What kind of mention.
   *   - "greeting"     → "Hi, X" style; respects preferred_address.
   *                      Returns empty when preferred_address='none'.
   *   - "third-person" → just the chosen name; pronouns in tooltip.
   *   - "pronouns-only"→ the pronouns string itself, or nothing if unset.
   */
  form?: "greeting" | "third-person" | "pronouns-only";
  /** Verb of the greeting form. Defaults to "Hi, ". Pass "" for bare name. */
  greetingPrefix?: string;
  /** Optional fallback when name + handle are both missing. */
  fallback?: string;
}

function chosenName(user: MentionableUser, fallback: string): string {
  const pref = (user.preferred_address ?? "").trim();
  if (pref && !["name", "handle", "formal", "none"].includes(pref)) {
    // Custom string — e.g. "Captain", "Dr Strange", a sobriquet.
    return pref;
  }
  if (pref === "handle" && user.username) return user.username;
  if (pref === "formal") return ""; // formal → no name, use the rest of the greeting
  if (pref === "none") return ""; // suppressed by user choice
  // Default: 'name' or NULL — use name, then username, then fallback.
  return user.name?.trim() || user.username?.trim() || fallback;
}

export function UserMention({
  user,
  form = "third-person",
  greetingPrefix = "Hi, ",
  fallback = "there",
}: UserMentionProps) {
  const pref = (user.preferred_address ?? "").trim();

  if (form === "pronouns-only") {
    const p = (user.pronouns ?? "").trim();
    if (!p) return null;
    return (
      <span className="inline text-[11px] uppercase tracking-wider text-ink-faint">
        {p}
      </span>
    );
  }

  const name = chosenName(user, fallback);

  if (form === "greeting") {
    if (pref === "none") return null; // user opted out of greetings
    if (pref === "formal" && !name) {
      // Formal with no chosen name — just the verb, e.g. "Welcome back".
      return <span>{greetingPrefix.replace(/,\s*$/, "")}</span>;
    }
    return <span>{greetingPrefix}{name || fallback}</span>;
  }

  // third-person
  const title = user.pronouns?.trim()
    ? `${name || fallback} · ${user.pronouns.trim()}`
    : undefined;
  return (
    <span title={title}>{name || fallback}</span>
  );
}
