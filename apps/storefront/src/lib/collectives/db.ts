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
  UserCollectiveRow,
} from "./types";
import { COLLECTIVE_KINDS, isValidSlug } from "./types";

// ── Errors ────────────────────────────────────────────────────────────

export class CollectiveError extends Error {
  constructor(message: string, public readonly code: string) {
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
  created_at: string;
  updated_at: string;
};

type CollectiveRowWithCount = CollectiveRow & { active_member_count: string };

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
    description: row.description,
    house_rules: row.house_rules,
    steward_user_id: row.steward_user_id,
    is_public: row.is_public,
    created_at: row.created_at,
    updated_at: row.updated_at,
    active_member_count: parseInt(row.active_member_count, 10),
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
        WHERE collective_id = $1 AND user_id = $2 AND left_at IS NULL`,
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
  const visibilityFilter = viewerIsSteward ? "" : "AND cm.visibility = 'public'";
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
            c.description, c.house_rules, c.steward_user_id, c.is_public,
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

// ── Write ─────────────────────────────────────────────────────────────

export interface CreateCollectiveInput {
  slug: string;
  display_name: string;
  kind: CollectiveKind;
  region?: string | null;
  languages?: string[];
  description?: string | null;
  house_rules?: string | null;
  is_public?: boolean;
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
          steward_user_id, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, slug, display_name, kind, region, languages, description,
                 house_rules, steward_user_id, is_public, created_at, updated_at
     ),
     ins_m AS (
       INSERT INTO collective_members
         (collective_id, user_id, role, visibility, invited_at, consent_at)
       SELECT id, $8, 'steward', 'public', NOW(), NOW() FROM ins_c
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
}

/** Steward-only. Caller must verify auth before calling. */
export async function updateCollective(
  collectiveId: string,
  input: UpdateCollectiveInput,
): Promise<void> {
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
     VALUES ($1, $2, $3, 'public', NOW(), NULL, NULL)
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
