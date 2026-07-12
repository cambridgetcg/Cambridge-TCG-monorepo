/**
 * Collectives — DB layer. Raw `pg` via `@/lib/db`, no ORM.
 *
 * Public read helpers + steward-gated mutations. Server actions in
 * `app/account/collectives/_actions.ts` compose these with auth checks.
 *
 * See docs/connections/the-collective.md for the doctrine + design choices.
 */

import { query, transaction } from "@/lib/db";
import type {
  Collective,
  CollectiveKind,
  CollectiveMemberRole,
  CollectiveMemberVisibility,
  CollectiveMemberWithUser,
  PublicCollective,
  UserCollectiveRow,
} from "./types";
import {
  COLLECTIVE_KINDS,
  DIRECTORY_NOTICE_VERSION,
  isValidSlug,
} from "./types";
import { toPublicCollective } from "./public";
import { containsDirectContact } from "./contact-safety";

// ── Errors ────────────────────────────────────────────────────────────

export class CollectiveError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "CollectiveError";
  }
}

function assertTextLimit(
  label: string,
  value: string | null | undefined,
  max: number,
): void {
  if (value != null && value.trim().length > max) {
    throw new CollectiveError(`${label} must be ${max} characters or fewer.`, "invalid_length");
  }
}

function assertList(label: string, values: string[] | undefined): void {
  if (!values) return;
  const normalized = values.map((value) => value.trim().toLowerCase());
  if (
    values.length > 20 ||
    values.some((value) => value.trim().length > 40) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new CollectiveError(
      `${label} may contain up to 20 values of 40 characters each.`,
      "invalid_list",
    );
  }
}

function assertPublicHttpsUrl(label: string, value: string | null | undefined): void {
  if (!value) return;
  if (value.length > 2048) {
    throw new CollectiveError(`${label} is too long.`, "invalid_url");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CollectiveError(`${label} must be a valid URL.`, "invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new CollectiveError(
      `${label} must be a public https URL without embedded credentials.`,
      "invalid_url",
    );
  }
}

function assertNoDirectContact(
  label: string,
  value: string | null | undefined,
): void {
  if (!value) return;
  if (containsDirectContact(value)) {
    throw new CollectiveError(
      `${label} must not contain an email address or phone number. Use the public contact-page URL instead.`,
      "direct_contact_in_free_text",
    );
  }
}

function assertCollectiveFields(input: CreateCollectiveInput | UpdateCollectiveInput): void {
  assertTextLimit("Display name", input.display_name, 120);
  assertTextLimit("Region", input.region, 120);
  assertTextLimit("Description", input.description, 2000);
  assertTextLimit("House rules", input.house_rules, 4000);
  assertTextLimit("Accessibility notes", input.accessibility_notes, 2000);
  assertNoDirectContact("Region", input.region);
  assertNoDirectContact("Description", input.description);
  assertNoDirectContact("House rules", input.house_rules);
  assertNoDirectContact("Accessibility notes", input.accessibility_notes);
  assertList("Languages", input.languages);
  assertList("Games", input.games);
  assertPublicHttpsUrl("Official website", input.website_url);
  assertPublicHttpsUrl("Public contact page", input.public_contact_url);
}

// Internal row shapes — DB returns untyped objects; we narrow at read time.
type CollectiveRow = {
  id: string;
  slug: string;
  display_name: string;
  kind: string;
  region: string | null;
  languages: string[] | null;
  games: string[] | null;
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
};

type CollectiveRowWithCount = CollectiveRow & { active_member_count: string };

type DirectoryCollectiveRow = {
  slug: string;
  display_name: string;
  kind: string;
  region: string | null;
  languages: string[] | null;
  games: string[] | null;
  description: string | null;
  website_url: string | null;
  public_contact_url: string | null;
  accessibility_notes: string | null;
  is_public: boolean;
  directory_listed: boolean;
  directory_listed_at: string | null;
  directory_notice_version: string | null;
  directory_authority_attested_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  collective_id: string;
  user_id: string;
  role: string;
  visibility: string;
  invited_at: string;
  consent_at: string;
  left_at: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
};

type UserCollectiveDbRow = CollectiveRowWithCount & {
  role: string;
  consent_at: string | null;
  invited_at: string;
};

function shape(row: CollectiveRowWithCount): Collective {
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    kind: row.kind as CollectiveKind,
    region: row.region,
    languages: row.languages ?? [],
    games: row.games ?? [],
    description: row.description,
    house_rules: row.house_rules,
    website_url: row.website_url,
    public_contact_url: row.public_contact_url,
    accessibility_notes: row.accessibility_notes,
    directory_listed: row.directory_listed,
    directory_listed_at: row.directory_listed_at,
    directory_notice_version: row.directory_notice_version,
    directory_authority_attested_at: row.directory_authority_attested_at,
    steward_user_id: row.steward_user_id,
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
    active_member_count: parseInt(row.active_member_count, 10),
  };
}

function shapeDirectory(row: DirectoryCollectiveRow): PublicCollective {
  return toPublicCollective({
    ...row,
    kind: row.kind as CollectiveKind,
    languages: row.languages ?? [],
    games: row.games ?? [],
  });
}

// ── Read ──────────────────────────────────────────────────────────────

/**
 * Fetch a collective by slug. Returns null if no row matches OR if the
 * collective is private and `viewerUserId` is not a member. Substrate-
 * honest: a private collective answers as "not found" rather than
 * leaking its existence.
 */
export async function getCollectiveBySlug(
  slug: string,
  viewerUserId: string | null,
): Promise<Collective | null> {
  const r = (await query(
    `SELECT c.id, c.slug, c.display_name, c.kind, c.region, c.languages,
            c.games, c.description, c.house_rules, c.website_url,
            c.public_contact_url, c.accessibility_notes,
            c.directory_listed, c.directory_listed_at,
            c.directory_notice_version, c.directory_authority_attested_at,
            c.steward_user_id, c.is_public,
            c.created_at, c.updated_at,
            (SELECT COUNT(*)::text FROM collective_members cm
              WHERE cm.collective_id = c.id
                AND cm.consent_at IS NOT NULL
                AND cm.left_at IS NULL) AS active_member_count
       FROM collectives c
      WHERE c.slug = $1`,
    [slug],
  )) as { rows: CollectiveRowWithCount[] };
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  if (!row.is_public) {
    if (!viewerUserId) return null;
    const member = (await query(
      `SELECT 1 AS ok FROM collective_members
        WHERE collective_id = $1
          AND user_id = $2
          AND consent_at IS NOT NULL
          AND left_at IS NULL`,
      [row.id, viewerUserId],
    )) as { rows: { ok: number }[] };
    if (member.rows.length === 0) return null;
  }
  return shape(row);
}

/** Active (consented, not-left) members of a collective, with user fields
 *  joined. Honors per-member visibility unless the viewer is the steward. */
export async function getActiveMembers(
  collectiveId: string,
  viewerIsSteward: boolean,
): Promise<CollectiveMemberWithUser[]> {
  const visibilityFilter = viewerIsSteward
    ? ""
    : "AND cm.visibility = 'public' AND u.is_public = TRUE";
  const r = (await query(
    `SELECT cm.collective_id, cm.user_id, cm.role, cm.visibility,
            cm.invited_at, cm.consent_at, cm.left_at,
            u.username, u.name, u.avatar_url
       FROM collective_members cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.collective_id = $1
        AND cm.consent_at IS NOT NULL
        AND cm.left_at IS NULL
        ${visibilityFilter}
      ORDER BY
        CASE cm.role WHEN 'steward' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        cm.consent_at ASC`,
    [collectiveId],
  )) as { rows: MemberRow[] };
  return r.rows.map((row) => ({
    collective_id: row.collective_id,
    user_id: row.user_id,
    role: row.role as CollectiveMemberRole,
    visibility: row.visibility as CollectiveMemberVisibility,
    invited_at: row.invited_at,
    consent_at: row.consent_at,
    left_at: row.left_at,
    username: row.username,
    name: row.name,
    avatar_url: row.avatar_url,
  }));
}

/** Collectives the user is involved with — active membership or pending
 *  invite. Used by /account/collectives. */
export async function getUserCollectives(
  userId: string,
): Promise<UserCollectiveRow[]> {
  const r = (await query(
    `SELECT c.id, c.slug, c.display_name, c.kind, c.region, c.languages,
            c.games, c.description, c.house_rules, c.website_url,
            c.public_contact_url, c.accessibility_notes,
            c.directory_listed, c.directory_listed_at,
            c.directory_notice_version, c.directory_authority_attested_at,
            c.steward_user_id, c.is_public,
            c.created_at, c.updated_at,
            cm.role, cm.consent_at, cm.invited_at,
            (SELECT COUNT(*)::text FROM collective_members cm2
              WHERE cm2.collective_id = c.id
                AND cm2.consent_at IS NOT NULL
                AND cm2.left_at IS NULL) AS active_member_count
       FROM collective_members cm
       JOIN collectives c ON c.id = cm.collective_id
      WHERE cm.user_id = $1
        AND cm.left_at IS NULL
      ORDER BY
        CASE WHEN cm.consent_at IS NULL THEN 0 ELSE 1 END,
        c.display_name ASC`,
    [userId],
  )) as { rows: UserCollectiveDbRow[] };
  return r.rows.map((row) => ({
    collective: shape(row),
    role: row.role as CollectiveMemberRole,
    consent_at: row.consent_at,
    invited_at: row.invited_at,
  }));
}

export interface PublicCollectiveFilters {
  q?: string;
  kind?: CollectiveKind;
  game?: string;
  region?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

/** One directory record through a public-only SELECT. Internal collective,
 * steward, house-rule and membership columns never cross this query seam. */
export async function getDirectoryCollectiveBySlug(
  slug: string,
): Promise<PublicCollective | null> {
  const result = (await query(
    `SELECT c.slug, c.display_name, c.kind, c.region, c.languages,
            c.games, c.description, c.website_url,
            c.public_contact_url, c.accessibility_notes,
            c.is_public, c.directory_listed, c.directory_listed_at,
            c.directory_notice_version, c.directory_authority_attested_at,
            c.created_at, c.updated_at
       FROM collectives c
      WHERE c.slug = $1
        AND c.is_public = TRUE
        AND c.directory_listed = TRUE
        AND c.directory_notice_version = $2
      LIMIT 1`,
    [slug, DIRECTORY_NOTICE_VERSION],
  )) as { rows: DirectoryCollectiveRow[] };
  return result.rows[0] ? shapeDirectory(result.rows[0]) : null;
}

/** Directory-listed organisations only. The query selects the exact public
 * allowlist; it never reads a roster, membership aggregate or steward id. */
export async function listPublicCollectives(
  filters: PublicCollectiveFilters = {},
): Promise<{ items: PublicCollective[]; total: number; limit: number; offset: number }> {
  const conditions = [
    "c.is_public = TRUE",
    "c.directory_listed = TRUE",
    "c.directory_notice_version = $1",
  ];
  const params: unknown[] = [DIRECTORY_NOTICE_VERSION];
  let i = 2;

  if (filters.q?.trim()) {
    conditions.push(`(c.display_name ILIKE $${i} OR c.description ILIKE $${i})`);
    params.push(`%${filters.q.trim().slice(0, 100)}%`);
    i += 1;
  }
  if (filters.kind && COLLECTIVE_KINDS.includes(filters.kind)) {
    conditions.push(`c.kind = $${i++}`);
    params.push(filters.kind);
  }
  if (filters.game?.trim()) {
    conditions.push(`$${i++} = ANY(c.games)`);
    params.push(filters.game.trim().toLowerCase().slice(0, 40));
  }
  if (filters.region?.trim()) {
    conditions.push(`c.region ILIKE $${i++}`);
    params.push(`%${filters.region.trim().slice(0, 100)}%`);
  }
  if (filters.language?.trim()) {
    conditions.push(`$${i++} = ANY(c.languages)`);
    params.push(filters.language.trim().toLowerCase().slice(0, 40));
  }

  const where = conditions.join(" AND ");
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const count = (await query(
    `SELECT COUNT(*)::text AS total FROM collectives c WHERE ${where}`,
    params,
  )) as { rows: { total: string }[] };

  const rows = (await query(
    `SELECT c.slug, c.display_name, c.kind, c.region, c.languages,
            c.games, c.description, c.website_url,
            c.public_contact_url, c.accessibility_notes,
            c.is_public, c.directory_listed, c.directory_listed_at,
            c.directory_notice_version, c.directory_authority_attested_at,
            c.created_at, c.updated_at
       FROM collectives c
      WHERE ${where}
      ORDER BY c.display_name ASC, c.slug ASC
      LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset],
  )) as { rows: DirectoryCollectiveRow[] };

  return {
    items: rows.rows.map(shapeDirectory),
    total: parseInt(count.rows[0]?.total ?? "0", 10),
    limit,
    offset,
  };
}

// ── Write ─────────────────────────────────────────────────────────────

export interface CreateCollectiveInput {
  slug: string;
  display_name: string;
  kind: CollectiveKind;
  region?: string | null;
  languages?: string[];
  games?: string[];
  description?: string | null;
  house_rules?: string | null;
  website_url?: string | null;
  public_contact_url?: string | null;
  accessibility_notes?: string | null;
  is_public?: boolean;
  directory_publication?: {
    notice_version: string;
    authority_attested: true;
  };
}

/** Create a new collective. The creating user becomes the steward + first
 *  member (consent_at populated, role='steward'). Atomic via CTE. */
export async function createCollective(
  stewardUserId: string,
  input: CreateCollectiveInput,
): Promise<Collective> {
  assertCollectiveFields(input);
  if (!isValidSlug(input.slug)) {
    throw new CollectiveError(
      "Slug must be lowercase, hyphen-separated, 3–48 characters.",
      "invalid_slug",
    );
  }
  if (!COLLECTIVE_KINDS.includes(input.kind)) {
    throw new CollectiveError("Unknown collective kind.", "invalid_kind");
  }
  if (input.display_name.trim().length < 2) {
    throw new CollectiveError(
      "Display name must be at least 2 characters.",
      "invalid_display_name",
    );
  }
  if (input.directory_publication && !input.is_public) {
    throw new CollectiveError(
      "Publish the web profile before listing it in the public directory.",
      "directory_requires_public_profile",
    );
  }
  if (
    input.directory_publication &&
    (
      input.directory_publication.notice_version !== DIRECTORY_NOTICE_VERSION ||
      input.directory_publication.authority_attested !== true
    )
  ) {
    throw new CollectiveError(
      "A current directory notice and authority attestation are required.",
      "invalid_directory_receipt",
    );
  }

  const exists = (await query(
    `SELECT 1 AS ok FROM collectives WHERE slug = $1`,
    [input.slug],
  )) as { rows: { ok: number }[] };
  if (exists.rows.length > 0) {
    throw new CollectiveError("Slug already taken.", "slug_taken");
  }

  const r = (await query(
    `WITH ins_c AS (
       INSERT INTO collectives
         (slug, display_name, kind, region, languages, games, description,
          house_rules, website_url, public_contact_url, accessibility_notes,
          steward_user_id, is_public, directory_listed, directory_listed_at,
          directory_notice_version, directory_authority_attested_at)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
         CASE WHEN $14 THEN NOW() ELSE NULL END,
         CASE WHEN $14 THEN $15 ELSE NULL END,
         CASE WHEN $14 THEN NOW() ELSE NULL END
       )
       RETURNING id, slug, display_name, kind, region, languages, games,
                 description, house_rules, website_url, public_contact_url,
                 accessibility_notes, directory_listed, directory_listed_at,
                 directory_notice_version, directory_authority_attested_at,
                 steward_user_id, is_public, created_at, updated_at
     ),
     ins_m AS (
       INSERT INTO collective_members
         (collective_id, user_id, role, visibility, invited_at, consent_at)
       SELECT id, $12, 'steward', 'private', NOW(), NOW() FROM ins_c
       RETURNING 1
     ),
     ins_p AS (
       INSERT INTO collective_directory_publication_log
         (collective_id, collective_slug, actor_user_id, action, notice_version)
       SELECT id, slug, $12, 'listed', $15 FROM ins_c WHERE $14
       RETURNING 1
     )
     SELECT * FROM ins_c`,
    [
      input.slug,
      input.display_name.trim(),
      input.kind,
      input.region?.trim() || null,
      input.languages ?? [],
      input.games ?? [],
      input.description?.trim() || null,
      input.house_rules?.trim() || null,
      input.website_url?.trim() || null,
      input.public_contact_url?.trim() || null,
      input.accessibility_notes?.trim() || null,
      stewardUserId,
      input.is_public ?? false,
      input.directory_publication != null,
      input.directory_publication?.notice_version ?? DIRECTORY_NOTICE_VERSION,
    ],
  )) as { rows: CollectiveRow[] };
  const row = r.rows[0]!;
  return shape({ ...row, active_member_count: "1" });
}

export interface UpdateCollectiveInput {
  display_name?: string;
  kind?: CollectiveKind;
  region?: string | null;
  languages?: string[];
  games?: string[];
  description?: string | null;
  house_rules?: string | null;
  website_url?: string | null;
  public_contact_url?: string | null;
  accessibility_notes?: string | null;
  is_public?: boolean;
}

/** Steward-only. Caller must verify auth before calling. */
export async function updateCollective(
  collectiveId: string,
  input: UpdateCollectiveInput,
): Promise<void> {
  assertCollectiveFields(input);
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.display_name !== undefined) {
    if (input.display_name.trim().length < 2) {
      throw new CollectiveError(
        "Display name must be at least 2 characters.",
        "invalid_display_name",
      );
    }
    sets.push(`display_name = $${i++}`);
    params.push(input.display_name.trim());
  }
  if (input.kind !== undefined) {
    if (!COLLECTIVE_KINDS.includes(input.kind)) {
      throw new CollectiveError("Unknown collective kind.", "invalid_kind");
    }
    sets.push(`kind = $${i++}`);
    params.push(input.kind);
  }
  if (input.region !== undefined) {
    sets.push(`region = $${i++}`);
    params.push(input.region?.trim() || null);
  }
  if (input.languages !== undefined) {
    sets.push(`languages = $${i++}`);
    params.push(input.languages);
  }
  if (input.games !== undefined) {
    sets.push(`games = $${i++}`);
    params.push(input.games);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${i++}`);
    params.push(input.description?.trim() || null);
  }
  if (input.house_rules !== undefined) {
    sets.push(`house_rules = $${i++}`);
    params.push(input.house_rules?.trim() || null);
  }
  for (const [column, value] of [
    ["website_url", input.website_url],
    ["public_contact_url", input.public_contact_url],
    ["accessibility_notes", input.accessibility_notes],
  ] as const) {
    if (value !== undefined) {
      sets.push(`${column} = $${i++}`);
      params.push(value?.trim() || null);
    }
  }
  if (input.is_public !== undefined) {
    sets.push(`is_public = $${i++}`);
    params.push(input.is_public);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  params.push(collectiveId);
  await query(
    `UPDATE collectives SET ${sets.join(", ")} WHERE id = $${i}`,
    params,
  );
}

/** Dedicated directory publication transition. Receipt actions are append-only
 * evidence that a bulk/API purpose was chosen or withdrawn; the private actor
 * id is later redacted. Ordinary profile edits never refresh this receipt. */
export async function setDirectoryPublication(
  collectiveId: string,
  actorUserId: string,
  listed: boolean,
  noticeVersion: string = DIRECTORY_NOTICE_VERSION,
): Promise<void> {
  if (listed && noticeVersion !== DIRECTORY_NOTICE_VERSION) {
    throw new CollectiveError(
      "The directory notice changed. Review the current notice before listing.",
      "stale_directory_notice",
    );
  }

  await transaction(async (tx) => {
    const current = await tx(
      `SELECT slug, is_public, directory_listed, directory_notice_version,
              display_name, kind, region, languages, games, description,
              house_rules, website_url, public_contact_url,
              accessibility_notes
         FROM collectives
        WHERE id = $1 AND steward_user_id = $2
        FOR UPDATE`,
      [collectiveId, actorUserId],
    );
    const row = current.rows[0];
    if (!row) {
      throw new CollectiveError(
        "Only the steward may change directory publication.",
        "not_steward",
      );
    }
    if (listed && !row.is_public) {
      throw new CollectiveError(
        "Publish the web profile before listing it in the public directory.",
        "directory_requires_public_profile",
      );
    }
    if (listed) {
      assertCollectiveFields({
        display_name: row.display_name,
        kind: row.kind as CollectiveKind,
        region: row.region,
        languages: row.languages ?? [],
        games: row.games ?? [],
        description: row.description,
        house_rules: row.house_rules,
        website_url: row.website_url,
        public_contact_url: row.public_contact_url,
        accessibility_notes: row.accessibility_notes,
      });
      if (String(row.display_name ?? "").trim().length < 2) {
        throw new CollectiveError(
          "Display name must be at least 2 characters.",
          "invalid_display_name",
        );
      }
    }

    const alreadyCurrent = listed
      ? row.directory_listed === true && row.directory_notice_version === DIRECTORY_NOTICE_VERSION
      : row.directory_listed === false;
    if (alreadyCurrent) return;

    await tx(
      `UPDATE collectives
          SET directory_listed = $3,
              directory_listed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
              directory_notice_version = CASE WHEN $3 THEN $4 ELSE NULL END,
              directory_authority_attested_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
              updated_at = NOW()
        WHERE id = $1 AND steward_user_id = $2`,
      [collectiveId, actorUserId, listed, DIRECTORY_NOTICE_VERSION],
    );
    await tx(
      `INSERT INTO collective_directory_publication_log
         (collective_id, collective_slug, actor_user_id, action, notice_version)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        collectiveId,
        row.slug,
        actorUserId,
        listed ? "listed" : "unlisted",
        listed ? DIRECTORY_NOTICE_VERSION : (row.directory_notice_version ?? DIRECTORY_NOTICE_VERSION),
      ],
    );
  });
}

/** Steward invites a user by username. The member row is created with
 *  consent_at NULL (pending). User accepts via acceptInvite() to set
 *  consent_at. Idempotent: re-inviting an already-pending user is a no-op;
 *  inviting a user who has left re-opens the invite (clears left_at,
 *  resets invited_at). */
export async function inviteMember(
  collectiveId: string,
  username: string,
  role: CollectiveMemberRole = "member",
): Promise<{ user_id: string }> {
  if (role === "steward") {
    throw new CollectiveError(
      "Steward role is transferred, not invited.",
      "invalid_role",
    );
  }
  const u = (await query(
    `SELECT id FROM users WHERE username = $1`,
    [username],
  )) as { rows: { id: string }[] };
  if (u.rows.length === 0) {
    throw new CollectiveError("User not found.", "user_not_found");
  }
  const userId = u.rows[0]!.id;
  await query(
    `INSERT INTO collective_members
       (collective_id, user_id, role, visibility, invited_at, consent_at, left_at)
     VALUES ($1, $2, $3, 'private', NOW(), NULL, NULL)
     ON CONFLICT (collective_id, user_id) DO UPDATE
        SET role = EXCLUDED.role,
            invited_at = EXCLUDED.invited_at,
            consent_at = NULL,
            left_at = NULL
       WHERE collective_members.left_at IS NOT NULL
          OR collective_members.consent_at IS NULL`,
    [collectiveId, userId, role],
  );
  return { user_id: userId };
}

/** User accepts an outstanding invite. Sets consent_at = now(). */
export async function acceptInvite(
  collectiveId: string,
  userId: string,
): Promise<void> {
  const r = (await query(
    `UPDATE collective_members
        SET consent_at = NOW()
      WHERE collective_id = $1
        AND user_id = $2
        AND consent_at IS NULL
        AND left_at IS NULL`,
    [collectiveId, userId],
  )) as { rowCount: number | null };
  if (!r.rowCount) {
    throw new CollectiveError("No pending invite found.", "no_invite");
  }
}

/** User declines an outstanding invite, or member leaves an active
 *  membership. Sets left_at = now(). Stewards cannot leave their own
 *  collective via this path (transfer flow is admin-mediated, future). */
export async function leaveCollective(
  collectiveId: string,
  userId: string,
): Promise<void> {
  const steward = (await query(
    `SELECT 1 AS ok FROM collectives
       WHERE id = $1 AND steward_user_id = $2`,
    [collectiveId, userId],
  )) as { rows: { ok: number }[] };
  if (steward.rows.length > 0) {
    throw new CollectiveError(
      "Steward cannot leave their own collective. Transfer stewardship first (admin-mediated).",
      "steward_locked",
    );
  }
  await query(
    `UPDATE collective_members SET left_at = NOW()
       WHERE collective_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [collectiveId, userId],
  );
}

/** Steward removes a member. Same effect as the user leaving (left_at = now()).
 *  Cannot remove the steward (would orphan the collective). */
export async function removeMember(
  collectiveId: string,
  userId: string,
): Promise<void> {
  const steward = (await query(
    `SELECT 1 AS ok FROM collectives
       WHERE id = $1 AND steward_user_id = $2`,
    [collectiveId, userId],
  )) as { rows: { ok: number }[] };
  if (steward.rows.length > 0) {
    throw new CollectiveError(
      "Cannot remove the steward.",
      "cannot_remove_steward",
    );
  }
  await query(
    `UPDATE collective_members SET left_at = NOW()
       WHERE collective_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [collectiveId, userId],
  );
}

/** Auth helper for steward-gated server actions. */
export async function isSteward(
  collectiveId: string,
  userId: string,
): Promise<boolean> {
  const r = (await query(
    `SELECT 1 AS ok FROM collectives
       WHERE id = $1 AND steward_user_id = $2`,
    [collectiveId, userId],
  )) as { rows: { ok: number }[] };
  return r.rows.length > 0;
}
