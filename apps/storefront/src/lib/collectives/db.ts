/**
 * Collectives — DB layer. Raw `pg` via `@/lib/db`, no ORM.
 *
 * Public read helpers + steward-gated mutations. Server actions in
 * `app/account/collectives/_actions.ts` compose these with auth checks.
 *
 * See docs/connections/the-collective.md for the doctrine + design choices.
 */

import { query } from "@/lib/db";
import type {
  Collective,
  CollectiveKind,
  CollectiveMemberRole,
  CollectiveMemberVisibility,
  CollectiveMemberWithUser,
  StewardCollectiveMemberWithUser,
  UserCollectiveRow,
} from "./types";
import { COLLECTIVE_KINDS, isValidSlug } from "./types";
import {
  DIRECTORY_CONTROL_CHARACTER_RE,
  DIRECTORY_MAX_LANGUAGE_LENGTH,
  DIRECTORY_MAX_LANGUAGES,
  DIRECTORY_MAX_LIMIT,
  DIRECTORY_MAX_OFFSET,
  DIRECTORY_MAX_DESCRIPTION_LENGTH,
  DIRECTORY_MAX_FACET_VALUES,
  DIRECTORY_MAX_HOUSE_RULES_LENGTH,
  DIRECTORY_MAX_PROFILE_REGION_LENGTH,
  DIRECTORY_MAX_QUERY_LENGTH,
  DIRECTORY_MAX_REGION_LENGTH,
  DIRECTORY_PAGE_SIZE,
  DIRECTORY_PUBLICATION_VERSION,
} from "./directory-contract";

// ── Errors ────────────────────────────────────────────────────────────

export class CollectiveError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CollectiveError";
  }
}

// Internal row shapes — DB returns untyped objects; we narrow at read time.
type CollectiveRow = {
  id: string;
  slug: string;
  display_name: string;
  kind: string;
  region: string | null;
  languages: string[] | null;
  description: string | null;
  house_rules: string | null;
  steward_user_id: string;
  is_public: boolean;
  directory_publication_at: string | null;
  directory_publication_version: string | null;
  created_at: string;
  updated_at: string;
};

type CollectiveRowWithCount = CollectiveRow & {
  active_member_count: string | null;
};

type PublicCollectiveRow = {
  slug: string;
  display_name: string;
  kind: string;
  region: string | null;
  languages: string[] | null;
  description: string | null;
  house_rules: string | null;
  platform_record_created_at: string;
  platform_record_updated_at: string;
};

type PublicCollectivePageDbRow = {
  total: string;
} & {
  [K in keyof PublicCollectiveRow]: PublicCollectiveRow[K] | null;
};

type MemberRow = {
  collective_id: string;
  user_id: string | null;
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
    description: row.description,
    house_rules: row.house_rules,
    steward_user_id: row.steward_user_id,
    is_public: row.is_public,
    directory_publication_at: row.directory_publication_at,
    directory_publication_version: row.directory_publication_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    active_member_count:
      row.active_member_count === null
        ? null
        : parseInt(row.active_member_count, 10),
  };
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
            c.description, c.house_rules, c.steward_user_id, c.is_public,
            c.directory_publication_at, c.directory_publication_version,
            c.created_at, c.updated_at,
            CASE WHEN c.steward_user_id = $2 THEN
              (SELECT COUNT(*)::text FROM collective_members cm
                WHERE cm.collective_id = c.id
                  AND cm.consent_at IS NOT NULL
                  AND cm.left_at IS NULL)
              ELSE NULL
            END AS active_member_count
       FROM collectives c
      WHERE c.slug = $1`,
    [slug, viewerUserId],
  )) as { rows: CollectiveRowWithCount[] };
  if (r.rows.length === 0) return null;
  const row = r.rows[0]!;
  if (!row.is_public) {
    if (!viewerUserId) return null;
    const member = (await query(
      `SELECT 1 AS ok FROM collective_members
        WHERE collective_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [row.id, viewerUserId],
    )) as { rows: { ok: number }[] };
    if (member.rows.length === 0) return null;
  }
  return shape(row);
}

/** Active members are private management data until membership publication
 *  has its own current receipt. Non-steward reads return no rows. */
export function getActiveMembers(
  collectiveId: string,
  viewerIsSteward: true,
): Promise<StewardCollectiveMemberWithUser[]>;
export function getActiveMembers(
  collectiveId: string,
  viewerIsSteward: false,
): Promise<CollectiveMemberWithUser[]>;
export function getActiveMembers(
  collectiveId: string,
  viewerIsSteward: boolean,
): Promise<CollectiveMemberWithUser[]>;
export async function getActiveMembers(
  collectiveId: string,
  viewerIsSteward: boolean,
): Promise<CollectiveMemberWithUser[]> {
  if (!viewerIsSteward) return [];

  const r = (await query(
    `SELECT cm.collective_id, cm.user_id,
            cm.role, cm.visibility,
            cm.invited_at, cm.consent_at, cm.left_at,
            u.username, u.name, u.avatar_url
       FROM collective_members cm
       JOIN users u ON u.id = cm.user_id
      WHERE cm.collective_id = $1
        AND cm.consent_at IS NOT NULL
        AND cm.left_at IS NULL
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
            c.description, c.house_rules, c.steward_user_id, c.is_public,
            c.directory_publication_at, c.directory_publication_version,
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

// ── Public directory ──────────────────────────────────────────────────

export interface PublicCollectiveFilter {
  kind?: CollectiveKind | null;
  region?: string | null;
  language?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

/** A public row keeps participant-authored values separate from timestamps
 * generated by the platform's collective record. Neither timestamp is a
 * publication receipt or evidence of when the steward made the row public. */
export interface PublicCollective {
  steward_fields: {
    slug: string;
    display_name: string;
    kind: CollectiveKind;
    region: string | null;
    languages: string[];
    description: string | null;
    house_rules: string | null;
  };
  platform_record: {
    created_at: string;
    updated_at: string;
  };
}

export interface PublicCollectivePage {
  collectives: PublicCollective[];
  total: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function assertCollectiveProfileBounds(input: {
  region?: string | null;
  languages?: string[];
  description?: string | null;
  house_rules?: string | null;
}): void {
  if (
    input.region != null &&
    (input.region.length > DIRECTORY_MAX_PROFILE_REGION_LENGTH ||
      DIRECTORY_CONTROL_CHARACTER_RE.test(input.region))
  ) {
    throw new CollectiveError(
      `Region must be printable text of at most ${DIRECTORY_MAX_PROFILE_REGION_LENGTH} characters.`,
      "invalid_region",
    );
  }
  if (input.languages !== undefined) {
    if (input.languages.length > DIRECTORY_MAX_LANGUAGES) {
      throw new CollectiveError(
        `Use at most ${DIRECTORY_MAX_LANGUAGES} languages.`,
        "too_many_languages",
      );
    }
    if (
      input.languages.some(
        (language) =>
          language.length === 0 ||
          language.length > DIRECTORY_MAX_LANGUAGE_LENGTH ||
          DIRECTORY_CONTROL_CHARACTER_RE.test(language),
      )
    ) {
      throw new CollectiveError(
        `Each language must be printable text of 1-${DIRECTORY_MAX_LANGUAGE_LENGTH} characters.`,
        "invalid_language",
      );
    }
  }
  if (
    input.description != null &&
    input.description.length > DIRECTORY_MAX_DESCRIPTION_LENGTH
  ) {
    throw new CollectiveError(
      `Description must be at most ${DIRECTORY_MAX_DESCRIPTION_LENGTH} characters.`,
      "description_too_long",
    );
  }
  if (
    input.house_rules != null &&
    input.house_rules.length > DIRECTORY_MAX_HOUSE_RULES_LENGTH
  ) {
    throw new CollectiveError(
      `House rules must be at most ${DIRECTORY_MAX_HOUSE_RULES_LENGTH} characters.`,
      "house_rules_too_long",
    );
  }
}

function assertDirectoryPublicationChoice(input: {
  is_public?: boolean;
  directory_listed?: boolean;
  directory_publication_version?: string;
}): void {
  if (!input.directory_listed) return;
  if (!input.is_public) {
    throw new CollectiveError(
      "A collective must have a public profile before it can enter the directory.",
      "directory_requires_public_profile",
    );
  }
  if (input.directory_publication_version !== DIRECTORY_PUBLICATION_VERSION) {
    throw new CollectiveError(
      "The directory publication notice changed. Reload and review it before listing.",
      "stale_directory_publication_notice",
    );
  }
}

function assertPublicFilterBounds(filter: PublicCollectiveFilter): void {
  if (filter.kind && DIRECTORY_CONTROL_CHARACTER_RE.test(filter.kind)) {
    throw new RangeError("kind must not contain control characters.");
  }
  if (
    filter.kind &&
    !(COLLECTIVE_KINDS as readonly string[]).includes(filter.kind)
  ) {
    throw new RangeError(
      `kind must be one of: ${COLLECTIVE_KINDS.join(", ")}.`,
    );
  }
  const textBounds: Array<[string, string | null | undefined, number]> = [
    ["q", filter.q, DIRECTORY_MAX_QUERY_LENGTH],
    ["region", filter.region, DIRECTORY_MAX_REGION_LENGTH],
    ["language", filter.language, DIRECTORY_MAX_LANGUAGE_LENGTH],
  ];
  for (const [name, value, max] of textBounds) {
    if (value && DIRECTORY_CONTROL_CHARACTER_RE.test(value)) {
      throw new RangeError(`${name} must not contain control characters.`);
    }
    if (value && value.length > max) {
      throw new RangeError(
        `${name} exceeds the ${max}-character directory bound.`,
      );
    }
  }
  if (
    filter.limit !== undefined &&
    (!Number.isSafeInteger(filter.limit) ||
      filter.limit < 1 ||
      filter.limit > DIRECTORY_MAX_LIMIT)
  ) {
    throw new RangeError(
      `limit must be an integer from 1 to ${DIRECTORY_MAX_LIMIT}.`,
    );
  }
  if (
    filter.offset !== undefined &&
    (!Number.isSafeInteger(filter.offset) ||
      filter.offset < 0 ||
      filter.offset > DIRECTORY_MAX_OFFSET)
  ) {
    throw new RangeError(
      `offset must be an integer from 0 to ${DIRECTORY_MAX_OFFSET}.`,
    );
  }
}

function shapePublic(row: PublicCollectiveRow): PublicCollective {
  return {
    steward_fields: {
      slug: row.slug,
      display_name: row.display_name,
      kind: row.kind as CollectiveKind,
      region: row.region,
      languages: row.languages ?? [],
      description: row.description,
      house_rules: row.house_rules,
    },
    platform_record: {
      created_at: row.platform_record_created_at,
      updated_at: row.platform_record_updated_at,
    },
  };
}

/**
 * List only collectives with both a public profile and a current, versioned
 * directory-publication receipt. Legacy public profiles remain absent.
 *
 * The SELECT intentionally cannot hydrate the private `Collective` shape:
 * it omits the record id, steward id, publication toggle, and every member
 * relationship. Participant-authored fields and platform timestamps remain
 * separate in the returned type. Name ordering is deterministic, not a rank.
 */
export async function listPublicCollectives(
  filter: PublicCollectiveFilter = {},
): Promise<PublicCollectivePage> {
  assertPublicFilterBounds(filter);

  const where: string[] = [
    "c.is_public = TRUE",
    "c.directory_publication_at IS NOT NULL",
    "c.directory_publication_version = $1",
  ];
  const params: unknown[] = [DIRECTORY_PUBLICATION_VERSION];
  let parameter = 2;

  if (filter.kind) {
    where.push(`c.kind = $${parameter++}`);
    params.push(filter.kind);
  }
  if (filter.region) {
    where.push(`c.region ILIKE $${parameter++} ESCAPE '\\'`);
    params.push(`%${escapeLike(filter.region)}%`);
  }
  if (filter.language) {
    where.push(`$${parameter++} = ANY(c.languages)`);
    params.push(filter.language);
  }
  if (filter.q) {
    where.push(
      `(c.display_name ILIKE $${parameter} ESCAPE '\\' OR c.description ILIKE $${parameter} ESCAPE '\\')`,
    );
    params.push(`%${escapeLike(filter.q)}%`);
    parameter++;
  }

  const clause = where.join(" AND ");
  const limit = filter.limit ?? DIRECTORY_PAGE_SIZE;
  const offset = filter.offset ?? 0;

  const limitParameter = parameter++;
  const offsetParameter = parameter++;
  const result = (await query(
    `WITH filtered AS MATERIALIZED (
       SELECT c.slug, c.display_name, c.kind, c.region, c.languages,
              c.description, c.house_rules,
              c.created_at AS platform_record_created_at,
              c.updated_at AS platform_record_updated_at
         FROM collectives c
        WHERE ${clause}
     ), counted AS (
       SELECT COUNT(*)::text AS total FROM filtered
     )
     SELECT counted.total, page.*
       FROM counted
       LEFT JOIN LATERAL (
         SELECT * FROM filtered
          ORDER BY display_name ASC, slug ASC
          LIMIT $${limitParameter} OFFSET $${offsetParameter}
       ) AS page ON TRUE`,
    [...params, limit, offset],
  )) as { rows: PublicCollectivePageDbRow[] };

  const total = parseInt(result.rows[0]?.total ?? "0", 10);
  const collectives = result.rows.flatMap((row) =>
    row.slug === null ? [] : [shapePublic(row as PublicCollectiveRow)],
  );

  return {
    collectives,
    total,
  };
}

/** Facet vocabulary from the same explicitly public rows. Counts remain
 * absent: the filters reveal usable values without publishing a histogram. */
export async function getPublicCollectiveFacets(): Promise<{
  kinds: string[];
  regions: string[];
  languages: string[];
}> {
  const result = (await query(
    `SELECT
       ARRAY(SELECT DISTINCT kind FROM collectives
              WHERE is_public = TRUE
                AND directory_publication_at IS NOT NULL
                AND directory_publication_version = $1
                AND kind IS NOT NULL
              ORDER BY kind
              LIMIT $2) AS kinds,
       ARRAY(SELECT DISTINCT region FROM collectives
              WHERE is_public = TRUE
                AND directory_publication_at IS NOT NULL
                AND directory_publication_version = $1
                AND region IS NOT NULL AND region <> ''
              ORDER BY region
              LIMIT $2) AS regions,
       ARRAY(SELECT DISTINCT language FROM collectives,
                    UNNEST(languages) AS language
              WHERE is_public = TRUE
                AND directory_publication_at IS NOT NULL
                AND directory_publication_version = $1
                AND language <> ''
              ORDER BY language
              LIMIT $2) AS languages`,
    [DIRECTORY_PUBLICATION_VERSION, DIRECTORY_MAX_FACET_VALUES],
  )) as {
    rows: { kinds: string[]; regions: string[]; languages: string[] }[];
  };
  const row = result.rows[0];
  return {
    kinds: row?.kinds ?? [],
    regions: row?.regions ?? [],
    languages: row?.languages ?? [],
  };
}

// ── Write inputs ───────────────────────────────

export interface CreateCollectiveInput {
  slug: string;
  display_name: string;
  kind: CollectiveKind;
  region?: string | null;
  languages?: string[];
  description?: string | null;
  house_rules?: string | null;
  is_public?: boolean;
  directory_listed?: boolean;
  directory_publication_version?: string;
}

/** Create a new collective. The creating user becomes the steward + first
 *  member (consent_at populated, role='steward'). Atomic via CTE. */
export async function createCollective(
  stewardUserId: string,
  input: CreateCollectiveInput,
): Promise<Collective> {
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
  assertCollectiveProfileBounds(input);
  assertDirectoryPublicationChoice(input);

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
         (slug, display_name, kind, region, languages, description, house_rules,
          steward_user_id, is_public, directory_publication_at,
          directory_publication_version)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         CASE WHEN $10 THEN clock_timestamp() ELSE NULL END,
         CASE WHEN $10 THEN $11 ELSE NULL END
       )
       RETURNING id, slug, display_name, kind, region, languages, description,
                 house_rules, steward_user_id, is_public,
                 directory_publication_at, directory_publication_version,
                 created_at, updated_at
     ),
     ins_m AS (
       INSERT INTO collective_members
         (collective_id, user_id, role, visibility, invited_at, consent_at)
       SELECT id, $8, 'steward', 'private', NOW(), NOW() FROM ins_c
       RETURNING 1
     )
     SELECT * FROM ins_c`,
    [
      input.slug,
      input.display_name.trim(),
      input.kind,
      input.region?.trim() || null,
      input.languages ?? [],
      input.description?.trim() || null,
      input.house_rules?.trim() || null,
      stewardUserId,
      input.is_public ?? false,
      input.directory_listed ?? false,
      input.directory_publication_version ?? null,
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
  description?: string | null;
  house_rules?: string | null;
  is_public?: boolean;
  directory_listed?: boolean;
  directory_publication_version?: string;
}

/** Steward-only. Caller must verify auth before calling. */
export async function updateCollective(
  collectiveId: string,
  input: UpdateCollectiveInput,
): Promise<void> {
  assertCollectiveProfileBounds(input);
  assertDirectoryPublicationChoice(input);
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
  if (input.description !== undefined) {
    sets.push(`description = $${i++}`);
    params.push(input.description?.trim() || null);
  }
  if (input.house_rules !== undefined) {
    sets.push(`house_rules = $${i++}`);
    params.push(input.house_rules?.trim() || null);
  }
  if (input.is_public !== undefined) {
    sets.push(`is_public = $${i++}`);
    params.push(input.is_public);
  }
  if (input.directory_listed !== undefined) {
    const enabled = `$${i++}`;
    params.push(input.directory_listed);
    const version = `$${i++}`;
    params.push(input.directory_publication_version ?? null);
    sets.push(
      `directory_publication_at = CASE WHEN ${enabled} THEN CASE WHEN directory_publication_version = ${version} THEN COALESCE(directory_publication_at, clock_timestamp()) ELSE clock_timestamp() END ELSE NULL END`,
      `directory_publication_version = CASE WHEN ${enabled} THEN ${version} ELSE NULL END`,
    );
  } else if (input.is_public === false) {
    // A private profile cannot remain searchable. Clear the current receipt
    // atomically so later republication requires a fresh directory choice.
    sets.push(
      `directory_publication_at = NULL`,
      `directory_publication_version = NULL`,
    );
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  params.push(collectiveId);
  await query(
    `UPDATE collectives SET ${sets.join(", ")} WHERE id = $${i}`,
    params,
  );
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
  const u = (await query(`SELECT id FROM users WHERE username = $1`, [
    username,
  ])) as { rows: { id: string }[] };
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
            visibility = 'private',
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
