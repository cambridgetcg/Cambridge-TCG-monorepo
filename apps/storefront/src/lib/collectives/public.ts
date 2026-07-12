/**
 * The open directory projection for a collective.
 *
 * A collective row also carries an internal id, a steward user id and house
 * rules. None of those belong in a bulk organisation directory. This helper
 * is the single boundary used by both list and detail endpoints.
 */

import {
  COLLECTIVE_KINDS,
  DIRECTORY_NOTICE_VERSION,
  type Collective,
  type PublicCollective,
} from "./types";

export type DirectoryProjectionSource = Pick<
  Collective,
  | "slug"
  | "display_name"
  | "kind"
  | "region"
  | "languages"
  | "games"
  | "description"
  | "website_url"
  | "public_contact_url"
  | "accessibility_notes"
  | "is_public"
  | "directory_listed"
  | "directory_listed_at"
  | "directory_notice_version"
  | "directory_authority_attested_at"
  | "created_at"
  | "updated_at"
>;

function invalid(reason: string): never {
  throw new Error(`Collective cannot enter the directory projection: ${reason}`);
}

function checkedText(
  label: string,
  value: string | null,
  max: number,
): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) invalid(`${label} is invalid`);
  return value;
}

function checkedList(label: string, value: string[]): string[] {
  if (!Array.isArray(value) || value.length > 20) invalid(`${label} is invalid`);
  const normalized = value.map((item) => {
    if (typeof item !== "string" || item.length > 40) invalid(`${label} is invalid`);
    return item;
  });
  if (new Set(normalized.map((item) => item.toLowerCase())).size !== normalized.length) {
    invalid(`${label} contains duplicates`);
  }
  return normalized;
}

function checkedHttpsUrl(label: string, value: string | null): string | null {
  if (value == null) return null;
  if (value.length > 2048) invalid(`${label} is invalid`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) invalid(`${label} is invalid`);
  } catch {
    invalid(`${label} is invalid`);
  }
  return value;
}

function iso(label: string, value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid(`${label} is invalid`);
  return parsed.toISOString();
}

export function toPublicCollective(
  collective: DirectoryProjectionSource,
): PublicCollective {
  if (
    !collective.is_public ||
    !collective.directory_listed ||
    !collective.directory_listed_at ||
    collective.directory_notice_version !== DIRECTORY_NOTICE_VERSION ||
    !collective.directory_authority_attested_at
  ) {
    throw new Error("Collective lacks a current directory publication receipt.");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(collective.slug)) {
    invalid("slug is invalid");
  }
  if (
    typeof collective.display_name !== "string" ||
    collective.display_name.length < 2 ||
    collective.display_name.length > 120
  ) {
    invalid("display name is invalid");
  }
  if (!COLLECTIVE_KINDS.includes(collective.kind)) invalid("kind is invalid");

  const region = checkedText("region", collective.region, 120);
  const languages = checkedList("languages", collective.languages);
  const games = checkedList("games", collective.games);
  const description = checkedText("description", collective.description, 2000);
  const websiteUrl = checkedHttpsUrl("website", collective.website_url);
  const publicContactUrl = checkedHttpsUrl("public contact", collective.public_contact_url);
  const accessibilityNotes = checkedText(
    "accessibility notes",
    collective.accessibility_notes,
    2000,
  );
  const listedAt = iso("listed_at", collective.directory_listed_at);
  const createdAt = iso("created_at", collective.created_at);
  const updatedAt = iso("updated_at", collective.updated_at);

  return {
    slug: collective.slug,
    display_name: collective.display_name,
    kind: collective.kind,
    region,
    languages,
    games,
    description,
    website_url: websiteUrl,
    public_contact_url: publicContactUrl,
    accessibility_notes: accessibilityNotes,
    is_public: true,
    verification_status: "self_attested_unverified",
    listed_at: listedAt,
    created_at: createdAt,
    updated_at: updatedAt,
    profile_url: `/c/${collective.slug}`,
    correction_url: `/contact?topic=directory&listing=${encodeURIComponent(collective.slug)}`,
    rights: {
      license: "LicenseRef-CambridgeTCG-Public-Display-Only",
      terms_url: "/licenses/community-directory-public-display-v1",
      caching: "no-store",
      scope: "current-display-only",
    },
  };
}
