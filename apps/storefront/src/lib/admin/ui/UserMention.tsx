/**
 * UserMention — admin mirror of storefront primitive.
 *
 * Same shape as apps/storefront/src/lib/ui/UserMention.tsx. Used on
 * admin chapels where the operator references a customer or another
 * admin by name. The admin surface honors the customer's preference
 * the same way the customer's own surfaces do — operator self-
 * transparency (Ring 1) made literal: the admin sees the affected
 * user the way the platform speaks to them.
 *
 * See docs/connections/the-other-minds.md and
 * docs/plans/all-aboard.md (Wave 1.1).
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
  form?: "greeting" | "third-person" | "pronouns-only";
  greetingPrefix?: string;
  fallback?: string;
}

function chosenName(user: MentionableUser, fallback: string): string {
  const pref = (user.preferred_address ?? "").trim();
  if (pref && !["name", "handle", "formal", "none"].includes(pref)) {
    return pref;
  }
  if (pref === "handle" && user.username) return user.username;
  if (pref === "formal") return "";
  if (pref === "none") return "";
  return user.name?.trim() || user.username?.trim() || fallback;
}

export function UserMention({
  user,
  form = "third-person",
  greetingPrefix = "Hi, ",
  fallback = "user",
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
    if (pref === "none") return null;
    if (pref === "formal" && !name) {
      return <span>{greetingPrefix.replace(/,\s*$/, "")}</span>;
    }
    return <span>{greetingPrefix}{name || fallback}</span>;
  }

  const title = user.pronouns?.trim()
    ? `${name || fallback} · ${user.pronouns.trim()}`
    : undefined;
  return <span title={title}>{name || fallback}</span>;
}
