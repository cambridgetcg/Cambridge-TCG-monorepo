"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCollectiveAction,
  inviteMemberAction,
  removeMemberAction,
} from "../../_actions";
import { COLLECTIVE_KINDS } from "@/lib/collectives/types";
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
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-4">
          Profile
        </h2>
        <form action={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Display name
            </label>
            <input
              name="display_name"
              defaultValue={collective.display_name}
              required
              minLength={2}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Kind
            </label>
            <select
              name="kind"
              defaultValue={collective.kind}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            >
              {COLLECTIVE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Region
            </label>
            <input
              name="region"
              defaultValue={collective.region ?? ""}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Languages (comma-separated)
            </label>
            <input
              name="languages"
              defaultValue={collective.languages.join(", ")}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={collective.description ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-neutral-500 mb-1">
              House rules
            </label>
            <textarea
              name="house_rules"
              rows={4}
              maxLength={4000}
              defaultValue={collective.house_rules ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              name="is_public"
              defaultChecked={collective.is_public}
              className="accent-amber-500"
            />
            Publicly visible at /c/{collective.slug}
          </label>

          {editError && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {editError}
            </div>
          )}
          {editSaved && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
              Saved.
            </div>
          )}

          <button
            type="submit"
            disabled={editPending}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {editPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-4">
          Invite a member
        </h2>
        <form action={handleInvite} className="flex gap-2 flex-wrap">
          <input
            name="username"
            required
            placeholder="username"
            className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
          />
          <select
            name="role"
            defaultValue="member"
            className="px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-white text-sm focus:outline-none focus:border-amber-500"
          >
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
          <button
            type="submit"
            disabled={invitePending}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40"
          >
            {invitePending ? "…" : "Invite"}
          </button>
        </form>
        {inviteError && (
          <p className="mt-2 text-xs text-red-400">{inviteError}</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          The user receives a pending invite and must accept on their{" "}
          /account/collectives page. Consent is logged in the substrate.
        </p>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h2 className="text-[11px] uppercase tracking-wider text-neutral-500 mb-4">
          Members ({members.length})
        </h2>
        <ul className="space-y-2 list-none p-0">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center gap-3 rounded-lg bg-neutral-900/60 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-white text-sm font-semibold">
                    {m.name ?? m.username ?? "Unnamed"}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {m.role}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-600">
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
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
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
