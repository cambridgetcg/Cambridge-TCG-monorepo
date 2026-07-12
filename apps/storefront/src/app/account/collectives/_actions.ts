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
import { consumeActionRateLimit } from "@/lib/privacy/action-rate-limit";
import {
  createCollective,
  updateCollective,
  setDirectoryPublication,
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
import {
  COLLECTIVE_KINDS,
  DIRECTORY_NOTICE_VERSION,
  isValidSlug,
} from "@/lib/collectives/types";

interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

const COLLECTIVE_CREATION_WINDOWS = [
  { name: "day", seconds: 86_400, limit: 3 },
] as const;
const DIRECTORY_LISTING_WINDOWS = [
  { name: "day", seconds: 86_400, limit: 5 },
] as const;
const MAX_STEWARDED_COLLECTIVES = 10;

async function requireUserId(): Promise<string | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in." };
  return session.user.id;
}

async function getCollectiveIdBySlug(slug: string): Promise<string | null> {
  const r = (await query(
    `SELECT id FROM collectives WHERE slug = $1`,
    [slug],
  )) as { rows: { id: string }[] };
  return r.rows[0]?.id ?? null;
}

function fmtErr(e: unknown): string {
  if (e instanceof CollectiveError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error.";
}

function commaList(value: FormDataEntryValue | null): string[] {
  return Array.from(new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  ));
}

function publicHttpsUrl(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new CollectiveError("Public link is too long.", "invalid_url");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new CollectiveError("Public links must use https and cannot contain embedded credentials.", "invalid_url");
  }
  return url.toString();
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
  const accessibility_notes = String(formData.get("accessibility_notes") ?? "").trim() || null;
  const languages = commaList(formData.get("languages"));
  const games = commaList(formData.get("games"));
  const is_public = formData.get("is_public") === "on";
  const directory_listed = formData.get("directory_listed") === "on";
  const directoryNoticeVersion = String(formData.get("directory_notice_version") ?? "");

  if (!isValidSlug(slug)) {
    return { ok: false, error: "Slug must be lowercase, hyphen-separated, 3–48 characters." };
  }
  if (!COLLECTIVE_KINDS.includes(kind)) {
    return { ok: false, error: "Pick a kind." };
  }
  if (directory_listed && directoryNoticeVersion !== DIRECTORY_NOTICE_VERSION) {
    return { ok: false, error: "Review the current directory publication notice before listing." };
  }

  try {
    const existing = await query(
      `SELECT count(*)::int AS n FROM collectives WHERE steward_user_id = $1`,
      [auth],
    );
    if (Number(existing.rows[0]?.n ?? 0) >= MAX_STEWARDED_COLLECTIVES) {
      return {
        ok: false,
        error: `One account may steward up to ${MAX_STEWARDED_COLLECTIVES} organisations. Contact us if you manage a larger public network.`,
      };
    }

    const creationBudget = await consumeActionRateLimit({
      action: "collective-create",
      subject: auth,
      windows: COLLECTIVE_CREATION_WINDOWS,
    });
    if (!creationBudget.ok) {
      return { ok: false, error: "Organisation creation is temporarily unavailable. Please try again later." };
    }
    if (!creationBudget.allowed) {
      return { ok: false, error: "You can create up to 3 organisations per day." };
    }

    const c = await createCollective(auth, {
      slug,
      display_name,
      kind,
      region,
      languages,
      games,
      description,
      house_rules,
      website_url: publicHttpsUrl(formData.get("website_url")),
      public_contact_url: publicHttpsUrl(formData.get("public_contact_url")),
      accessibility_notes,
      is_public,
      directory_publication: directory_listed
        ? {
            notice_version: directoryNoticeVersion,
            authority_attested: true,
          }
        : undefined,
    });
    revalidatePath("/account/collectives");
    revalidatePath(`/c/${c.slug}`);
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
  const gamesRaw = formData.get("games");
  const websiteUrl = formData.get("website_url");
  const publicContactUrl = formData.get("public_contact_url");
  const accessibilityNotes = formData.get("accessibility_notes");
  const is_public = formData.get("is_public");

  try {
    if (is_public !== "on") {
      await setDirectoryPublication(collectiveId, auth, false);
    }
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
          : commaList(languagesRaw),
      games: gamesRaw == null ? undefined : commaList(gamesRaw),
      website_url: websiteUrl == null ? undefined : publicHttpsUrl(websiteUrl),
      public_contact_url:
        publicContactUrl == null ? undefined : publicHttpsUrl(publicContactUrl),
      accessibility_notes:
        accessibilityNotes == null ? undefined : String(accessibilityNotes) || null,
      // This action is submitted by the complete management form. An
      // unchecked checkbox is absent from FormData, so treating absence as
      // "leave unchanged" made a public collective impossible to unpublish.
      is_public: is_public === "on",
    });
    revalidatePath(`/c/${slug}`);
    revalidatePath(`/account/collectives/${slug}/manage`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fmtErr(e) };
  }
}

// ── Directory publication ───────────────────────────────────────────

export async function setDirectoryPublicationAction(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (typeof auth !== "string") return { ok: false, error: auth.error };

  const collectiveId = await getCollectiveIdBySlug(slug);
  if (!collectiveId) return { ok: false, error: "Collective not found." };
  if (!(await isSteward(collectiveId, auth))) {
    return { ok: false, error: "Only the steward may change directory publication." };
  }

  const intent = String(formData.get("intent") ?? "");
  const listed = intent === "list";
  if (!listed && intent !== "unlist") {
    return { ok: false, error: "Choose list or unlist." };
  }
  if (listed) {
    if (formData.get("authority_attested") !== "on") {
      return { ok: false, error: "Confirm that you are authorised to represent this organisation." };
    }
    if (formData.get("directory_notice_version") !== DIRECTORY_NOTICE_VERSION) {
      return { ok: false, error: "Review the current directory publication notice before listing." };
    }
  }

  try {
    if (listed) {
      const listingBudget = await consumeActionRateLimit({
        action: "collective-directory-list",
        subject: auth,
        windows: DIRECTORY_LISTING_WINDOWS,
      });
      if (!listingBudget.ok) {
        return { ok: false, error: "Directory publication is temporarily unavailable. You can still withdraw an existing listing." };
      }
      if (!listingBudget.allowed) {
        return { ok: false, error: "You can publish up to 5 organisation listings per day. You can always withdraw a listing." };
      }
    }
    await setDirectoryPublication(
      collectiveId,
      auth,
      listed,
      DIRECTORY_NOTICE_VERSION,
    );
    revalidatePath(`/c/${slug}`);
    revalidatePath(`/account/collectives/${slug}/manage`);
    revalidatePath("/community/directory");
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

export async function acceptInviteAction(
  slug: string,
): Promise<ActionResult> {
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
