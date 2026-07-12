"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateCollectiveAction,
  setDirectoryPublicationAction,
  inviteMemberAction,
  removeMemberAction,
} from "../../_actions";
import {
  COLLECTIVE_KINDS,
  DIRECTORY_NOTICE_VERSION,
} from "@/lib/collectives/types";
import type {
  Collective,
  CollectiveMemberWithUser,
} from "@/lib/collectives/types";

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Other",
};

export function ManageClient({
  collective,
  members,
}: {
  collective: Collective;
  members: CollectiveMemberWithUser[];
}) {
  const router = useRouter();
  const [editPending, startEdit] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);

  const [invitePending, startInvite] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [directoryPending, startDirectory] = useTransition();
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  function handleUpdate(formData: FormData) {
    setEditError(null);
    setEditSaved(false);
    startEdit(async () => {
      const r = await updateCollectiveAction(collective.slug, formData);
      if (!r.ok) setEditError(r.error ?? "Failed.");
      else {
        setEditSaved(true);
        router.refresh();
      }
    });
  }

  function handleInvite(formData: FormData) {
    setInviteError(null);
    startInvite(async () => {
      const r = await inviteMemberAction(collective.slug, formData);
      if (!r.ok) setInviteError(r.error ?? "Failed.");
      else router.refresh();
    });
  }

  function handleDirectory(formData: FormData) {
    setDirectoryError(null);
    startDirectory(async () => {
      const r = await setDirectoryPublicationAction(collective.slug, formData);
      if (!r.ok) setDirectoryError(r.error ?? "Failed.");
      else router.refresh();
    });
  }

  function handleRemove(userId: string, displayName: string) {
    if (!window.confirm(`Remove ${displayName} from this collective?`)) return;
    startEdit(async () => {
      const r = await removeMemberAction(collective.slug, userId);
      if (!r.ok) setEditError(r.error ?? "Failed.");
      else router.refresh();
    });
  }

  return (
    <>
      <section className="mb-8 rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-4">
          Profile
        </h2>
        <form action={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Display name
            </label>
            <input
              name="display_name"
              defaultValue={collective.display_name}
              required
              minLength={2}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Kind
            </label>
            <select
              name="kind"
              defaultValue={collective.kind}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            >
              {COLLECTIVE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Region
            </label>
            <input
              name="region"
              defaultValue={collective.region ?? ""}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs text-ink-faint">
              Coarse public area only; no home address or private meetup location.
            </p>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Languages (comma-separated)
            </label>
            <input
              name="languages"
              defaultValue={collective.languages.join(", ")}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Games (comma-separated codes)
            </label>
            <input
              name="games"
              defaultValue={collective.games.join(", ")}
              placeholder="pkm, op, mtg"
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
                Official website
              </label>
              <input
                name="website_url"
                type="url"
                defaultValue={collective.website_url ?? ""}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
                Public contact page
              </label>
              <input
                name="public_contact_url"
                type="url"
                defaultValue={collective.public_contact_url ?? ""}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Accessibility notes
            </label>
            <textarea
              name="accessibility_notes"
              rows={3}
              maxLength={2000}
              defaultValue={collective.accessibility_notes ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs text-ink-faint">
              Do not include personal emails, phone numbers or private addresses. Use the public contact-page link.
            </p>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={collective.description ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              House rules
            </label>
            <textarea
              name="house_rules"
              rows={4}
              maxLength={4000}
              defaultValue={collective.house_rules ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              name="is_public"
              defaultChecked={collective.is_public}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              <span className="block">Publish the web profile at /c/{collective.slug}</span>
              <span className="mt-1 block text-xs text-ink-faint">
                This does not add the organisation to the searchable API directory.
              </span>
            </span>
          </label>
          {editError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {editError}
            </div>
          )}
          {editSaved && (
            <div className="rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm text-ok">
              Saved.
            </div>
          )}

          <button
            type="submit"
            disabled={editPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 disabled:opacity-40"
          >
            {editPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      <section className="mb-8 rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">
          Public directory and API
        </h2>
        {collective.directory_listed && collective.directory_notice_version === DIRECTORY_NOTICE_VERSION ? (
          <>
            <p className="mb-4 text-sm leading-relaxed text-ink-muted">
              Listed under the current notice. This publishes only the
              submitted organisation fields—not members, attendance or the
              steward identity. Withdrawal takes effect on the next request.
            </p>
            <form action={handleDirectory}>
              <input type="hidden" name="intent" value="unlist" />
              <button
                type="submit"
                disabled={directoryPending}
                className="rounded-lg border border-danger/30 px-4 py-2 text-sm font-semibold text-danger disabled:opacity-40"
              >
                {directoryPending ? "Withdrawing…" : "Withdraw directory listing"}
              </button>
            </form>
          </>
        ) : (
          <form action={handleDirectory} className="space-y-4">
            {collective.directory_listed && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-ink-muted">
                The previous directory notice is no longer current. This
                organisation is withheld until the steward reviews and accepts
                the notice below.
              </p>
            )}
            <input type="hidden" name="intent" value="list" />
            <input
              type="hidden"
              name="directory_notice_version"
              value={DIRECTORY_NOTICE_VERSION}
            />
            <label className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-subtle p-3 text-sm text-ink-muted">
              <input
                type="checkbox"
                name="authority_attested"
                required
                className="mt-0.5 accent-amber-500"
              />
              <span>
                <span className="block font-medium text-ink">
                  I am authorised to represent this organisation
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-faint">
                  I ask Cambridge TCG to distribute the submitted organisation
                  fields through its searchable page and public API. The record
                  will be labelled self-attested and unverified. No member
                  roster is included.
                  {" "}<Link
                    href="/licenses/community-directory-public-display-v1"
                    target="_blank"
                    className="text-accent underline"
                  >
                    Read the versioned display terms
                  </Link>.
                  <span className="mt-1 block">
                    We privately record your account ID, this notice version,
                    the action and its time. The account ID is removed after
                    180 days. The pseudonymised receipt is treated as personal
                    data and deleted after two years.
                  </span>
                </span>
              </span>
            </label>
            {!collective.is_public && (
              <p className="text-xs text-warning">
                Publish the /c web profile and save it before listing.
              </p>
            )}
            <button
              type="submit"
              disabled={directoryPending || !collective.is_public}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-page disabled:opacity-40"
            >
              {directoryPending ? "Publishing…" : "Publish directory listing"}
            </button>
          </form>
        )}
        {directoryError && <p className="mt-3 text-sm text-danger">{directoryError}</p>}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Abuse control allows 5 listing actions per account each day.
          Withdrawal is never rate-limited.
        </p>
      </section>

      <section className="mb-8 rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-4">
          Invite a member
        </h2>
        <form action={handleInvite} className="flex gap-2 flex-wrap">
          <input
            name="username"
            required
            placeholder="username"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
          />
          <select
            name="role"
            defaultValue="member"
            className="px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm focus:outline-none focus:border-accent"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            disabled={invitePending}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 disabled:opacity-40"
          >
            {invitePending ? "…" : "Invite"}
          </button>
        </form>
        {inviteError && (
          <p className="mt-2 text-xs text-danger">{inviteError}</p>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          The user receives a pending invite and must accept on their{" "}
          /account/collectives page. Consent is logged in the substrate.
        </p>
      </section>

      <section className="rounded-lg border border-border-subtle bg-surface p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-4">
          Members ({members.length})
        </h2>
        <ul className="space-y-2 list-none p-0">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-lg bg-surface p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-ink text-sm font-semibold">
                    {m.name ?? m.username ?? "Unnamed"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                    {m.role}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                    {m.visibility}
                  </span>
                </div>
              </div>
              {m.role !== "steward" && (
                <button
                  onClick={() =>
                    handleRemove(m.user_id, m.name ?? m.username ?? "this member")
                  }
                  disabled={editPending}
                  className="text-xs text-danger hover:text-danger disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
