/**
 * Collectives — multi-member identities sharing one decision and one
 * collection. See docs/connections/the-collective.md for the doctrine,
 * and Door 3 in docs/connections/the-tailored-doors.md for cultural
 * intent. Substrate: migration 0097_collectives.sql.
 *
 * A collective is one of eleven named doors into the commons. It is the
 * cultural unit the platform has been built without — a Tokyo LGS and a
 * Bristol LGS exchanging culture through TCG is the canonical purpose-
 * statement of the commons, made concrete by this module.
 */

/** Suggested kinds for the `kind` column. Free-form in the DB to remain
 *  substrate-honest about a vocabulary that will grow before it crystallizes;
 *  these are the values currently surfaced on the management form. */
export const COLLECTIVE_KINDS = [
  "shop",
  "club",
  "guild",
  "lab",
  "tournament-collective",
  "other",
] as const;

export type CollectiveKind = (typeof COLLECTIVE_KINDS)[number];

/** Member role within a collective. The steward is also recorded on the
 *  `collectives.steward_user_id` column; the membership row mirrors it
 *  so the membership table is the single source of truth for "who's in?". */
export type CollectiveMemberRole = "steward" | "admin" | "member";

/** Per-member visibility. */
export type CollectiveMemberVisibility = "public" | "private";

/** Notice recorded when a steward opts into bulk/API directory publication. */
export const DIRECTORY_NOTICE_VERSION = "community-directory-v1-2026-07-11";

export interface Collective {
  id: string;
  slug: string;
  display_name: string;
  kind: CollectiveKind;
  region: string | null;
  languages: string[];
  games: string[];
  description: string | null;
  house_rules: string | null;
  website_url: string | null;
  public_contact_url: string | null;
  accessibility_notes: string | null;
  directory_listed: boolean;
  directory_listed_at: string | null;
  directory_notice_version: string | null;
  directory_authority_attested_at: string | null;
  steward_user_id: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  /** Derived: active-member count (consent_at IS NOT NULL AND left_at IS NULL).
   *  Always populated by the read helpers. */
  active_member_count: number;
}

export interface CollectiveMember {
  collective_id: string;
  user_id: string;
  role: CollectiveMemberRole;
  visibility: CollectiveMemberVisibility;
  invited_at: string;
  consent_at: string | null;
  left_at: string | null;
}

/** Joined membership row — used by /c/<slug> roster + /account/collectives. */
export interface CollectiveMemberWithUser extends CollectiveMember {
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

/** A user's view of one of their collective relationships. */
export interface UserCollectiveRow {
  collective: Collective;
  role: CollectiveMemberRole;
  consent_at: string | null;
  invited_at: string;
}

/** Exact public-directory allowlist. Adding a field to Collective never adds
 * it here automatically. */
export interface PublicCollective {
  slug: string;
  display_name: string;
  kind: CollectiveKind;
  region: string | null;
  languages: string[];
  games: string[];
  description: string | null;
  website_url: string | null;
  public_contact_url: string | null;
  accessibility_notes: string | null;
  is_public: true;
  verification_status: "self_attested_unverified";
  listed_at: string;
  created_at: string;
  updated_at: string;
  profile_url: string;
  correction_url: string;
  rights: {
    license: "LicenseRef-CambridgeTCG-Public-Display-Only";
    terms_url: "/licenses/community-directory-public-display-v1";
    caching: "no-store";
    scope: "current-display-only";
  };
}

// ── Slug validation ──────────────────────────────────────────────────────

/** Mirrors the SQL CHECK constraint: lowercase alphanumeric + hyphens,
 *  starts and ends with alphanumeric, 3–48 characters total. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Suggest a slug from a free-form display name (lowercase, hyphen-
 *  separated, ASCII-only, truncated). Not authoritative — the user
 *  may edit before submission. */
export function suggestSlug(displayName: string): string {
  const ascii = displayName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return ascii.slice(0, 48);
}
