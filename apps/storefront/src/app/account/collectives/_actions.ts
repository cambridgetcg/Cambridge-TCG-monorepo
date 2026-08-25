"use server";

/**
 * Server actions for collective management. Caller-auth via next-auth
 * session. Steward-gated mutations check `isSteward(collectiveId, userId)`.
 *
 * See apps/storefront/src/lib/collectives/db.ts for the underlying helpers
 * and docs/connections/the-collective.md for the doctrine.
 */

import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import {
  createCollective,
  updateCollective,
  inviteMember,
  acceptInvite,
  leaveCollective,
  removeMember,
  isSteward,
  CollectiveError,
} from "@/lib/collectives/db";
import type {
  CollectiveKind,
  CollectiveMemberRole,
} from "@/lib/collectives/types";
import { COLLECTIVE_KINDS, isValidSlug } from "@/lib/collectives/types";
import { DIRECTORY_PUBLICATION_VERSION } from "@/lib/collectives/directory-contract";

interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUserId(): Promise<string | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in." };
  return session.user.id;
}

async function getCollectiveIdBySlug(slug: string): Promise<string | null> {
  const r = (await query(`SELECT id FROM collectives WHERE slug = $1`, [
    slug,
  ])) as { rows: { id: string }[] };
  return r.rows[0]?.id ?? null;
}

function fmtErr(e: unknown): string {
  if (e instanceof CollectiveError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error.";
}

// ── Create ───────────────────────────────────────────────────────────

export async function createCollectiveAction(
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const slug = String(formData.get("slug") ?? "").trim();
  const display_name = String(formData.get("display_name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as CollectiveKind;
  const region = String(formData.get("region") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const house_rules = String(formData.get("house_rules") ?? "").trim() || null;
  const languagesRaw = String(formData.get("languages") ?? "");
  const languages = languagesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const is_public = formData.get("is_public") === "on";
  const directory_listed = formData.get("directory_listed") === "on";
  const directory_publication_version = String(
    formData.get("directory_publication_version") ?? "",
  );

  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "Slug must be lowercase, hyphen-separated, 3–48 characters.",
    };
  }
  if (!COLLECTIVE_KINDS.includes(kind)) {
    return { ok: false, error: "Pick a kind." };
  }
  if (
    directory_listed &&
    directory_publication_version !== DIRECTORY_PUBLICATION_VERSION
  ) {
    return {
      ok: false,
      error:
        "The directory publication notice changed. Reload and review it before listing.",
    };
  }

  try {
    const c = await createCollective(auth, {
      slug,
      display_name,
      kind,
      region,
      languages,
      description,
      house_rules,
      is_public,
      directory_listed,
      directory_publication_version,
    });
    revalidatePath("/account/collectives");
    revalidatePath(`/c/${c.slug}`);
    revalidatePath("/community/directory");
    revalidatePath("/api/v1/directory/organisations");
    return { ok: true, data: { slug: c.slug } };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

// ── Update ───────────────────────────────────────────────────────────

export async function updateCollectiveAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };
  if (!(await isSteward(collectiveId, auth))) {
    return { ok: false, error: "Only the steward may edit this collective." };
  }

  const display_name = formData.get("display_name");
  const kind = formData.get("kind");
  const region = formData.get("region");
  const description = formData.get("description");
  const house_rules = formData.get("house_rules");
  const languagesRaw = formData.get("languages");
  // This action receives the complete profile form. An absent checkbox means
  // false; treating it as "leave unchanged" made publication impossible to
  // withdraw from this surface.
  const is_public = formData.get("is_public") === "on";
  const directory_listed = formData.get("directory_listed") === "on";
  const directory_publication_version = String(
    formData.get("directory_publication_version") ?? "",
  );

  if (
    directory_listed &&
    directory_publication_version !== DIRECTORY_PUBLICATION_VERSION
  ) {
    return {
      ok: false,
      error:
        "The directory publication notice changed. Reload and review it before listing.",
    };
  }

  try {
    await updateCollective(collectiveId, {
      display_name: display_name == null ? undefined : String(display_name),
      kind: kind == null ? undefined : (String(kind) as CollectiveKind),
      region: region == null ? undefined : String(region) || null,
      description:
        description == null ? undefined : String(description) || null,
      house_rules:
        house_rules == null ? undefined : String(house_rules) || null,
      languages:
        languagesRaw == null
          ? undefined
          : String(languagesRaw)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
      is_public,
      directory_listed,
      directory_publication_version,
    });
    revalidatePath(`/c/${slug}`);
    revalidatePath(`/account/collectives/${slug}/manage`);
    revalidatePath("/community/directory");
    revalidatePath("/api/v1/directory/organisations");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

// ── Members ──────────────────────────────────────────────────────────

export async function inviteMemberAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };
  if (!(await isSteward(collectiveId, auth))) {
    return { ok: false, error: "Only the steward may invite members." };
  }

  const username = String(formData.get("username") ?? "").trim();
  const role = String(formData.get("role") ?? "member") as CollectiveMemberRole;
  if (!username) return { ok: false, error: "Username required." };
  if (role !== "admin" && role !== "member") {
    return { ok: false, error: "Role must be admin or member." };
  }

  try {
    await inviteMember(collectiveId, username, role);
    revalidatePath(`/account/collectives/${slug}/manage`);
    revalidatePath(`/c/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

export async function removeMemberAction(
  slug: string,
  userId: string,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };
  if (!(await isSteward(collectiveId, auth))) {
    return { ok: false, error: "Only the steward may remove members." };
  }

  try {
    await removeMember(collectiveId, userId);
    revalidatePath(`/account/collectives/${slug}/manage`);
    revalidatePath(`/c/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

export async function acceptInviteAction(slug: string): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };

  try {
    await acceptInvite(collectiveId, auth);
    revalidatePath("/account/collectives");
    revalidatePath(`/c/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

export async function leaveCollectiveAction(
  slug: string,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };

  try {
    await leaveCollective(collectiveId, auth);
    revalidatePath("/account/collectives");
    revalidatePath(`/c/${slug}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

// ── Redirect helpers (used by form action= attributes) ───────────────

export async function createAndRedirect(formData: FormData): Promise<void> {
  const result = await createCollectiveAction(formData);
  if (result.ok && result.data) {
    redirect(`/account/collectives/${result.data.slug}/manage`);
  }
  // On failure, the client component re-renders with the error.
  // (Server-action errors don't redirect; client falls through.)
}
