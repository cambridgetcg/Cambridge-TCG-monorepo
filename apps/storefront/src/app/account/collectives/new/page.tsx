/**
 * /account/collectives/new — create-a-collective form.
 *
 * Client component for live slug validation + suggestion. Submits via
 * the server action and redirects to the manage page on success.
 */

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isValidSlug, suggestSlug, COLLECTIVE_KINDS } from "@/lib/collectives/types";
import { createCollectiveAction } from "../_actions";

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Other",
};

export default function NewCollectivePage() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const effectiveSlug = slugTouched ? slug : suggestSlug(displayName);
  const slugValid = effectiveSlug === "" ? null : isValidSlug(effectiveSlug);

  function handleSubmit(formData: FormData) {
    formData.set("slug", effectiveSlug);
    start(async () => {
      setError(null);
      const r = await createCollectiveAction(formData);
      if (!r.ok) {
        setError(r.error ?? "Failed to create.");
      } else if (r.data) {
        router.push(`/account/collectives/${r.data.slug}/manage`);
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 text-ink">
      <header className="mb-6">
        <Link
          href="/account/collectives"
          className="text-xs uppercase tracking-wider text-ink-faint hover:text-accent-strong"
        >
          ← Your collectives
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-2">Create a collective</h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          You will be the steward. You can invite members after creation. The
          collective starts private; flip it public when ready.{" "}
          <Link href="/methodology/collectives" className="text-accent-strong hover:text-accent-strong underline">
            How collectives work
          </Link>
        </p>
      </header>

      <form action={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Display name
          </label>
          <input
            name="display_name"
            required
            minLength={2}
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tokyo Card Lounge"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            URL slug — /c/<span className="text-ink-muted">{effectiveSlug || "your-slug"}</span>
          </label>
          <input
            name="slug_visible"
            required
            minLength={3}
            maxLength={48}
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugTouched(true);
            }}
            placeholder="tokyo-card-lounge"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
          {slugValid === false && (
            <p className="mt-1 text-xs text-red-400">
              Lowercase letters, digits, and hyphens only. 3–48 characters,
              starts and ends with a letter or digit.
            </p>
          )}
          {slugValid === true && (
            <p className="mt-1 text-xs text-secondary">Looks good.</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Kind
          </label>
          <select
            name="kind"
            required
            defaultValue="club"
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
            Region (free-form)
          </label>
          <input
            name="region"
            maxLength={120}
            placeholder="Shibuya, Tokyo, JP"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Languages (comma-separated, ISO codes preferred — en, ja, …)
          </label>
          <input
            name="languages"
            placeholder="ja, en"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Description
          </label>
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="What's the culture of this collective?"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            House rules (markdown welcome)
          </label>
          <textarea
            name="house_rules"
            rows={4}
            maxLength={4000}
            placeholder="Local format, prize structure, etiquette…"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder-neutral-600 focus:outline-none focus:border-accent"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="is_public"
            className="accent-amber-500"
          />
          Make public immediately (you can change this later)
        </label>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !displayName.trim() || slugValid === false}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-accent text-black hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? "Creating…" : "Create collective"}
          </button>
          <Link
            href="/account/collectives"
            className="text-sm text-ink-faint hover:text-ink-muted"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
