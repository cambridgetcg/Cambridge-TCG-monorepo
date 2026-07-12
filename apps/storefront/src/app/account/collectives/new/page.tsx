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
import { DIRECTORY_NOTICE_VERSION } from "@/lib/collectives/types";

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
          className="text-xs uppercase tracking-wider text-ink-faint hover:text-accent"
        >
          ← Your collectives
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-2">Create a collective</h1>
        <p className="text-sm text-ink-muted leading-relaxed">
          You will be the steward. You can invite members after creation. The
          collective starts private; flip it public when ready.{" "}
          <Link href="/methodology/collectives" className="text-accent hover:text-accent-strong underline">
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
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
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
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
          {slugValid === false && (
            <p className="mt-1 text-xs text-danger">
              Lowercase letters, digits, and hyphens only. 3–48 characters,
              starts and ends with a letter or digit.
            </p>
          )}
          {slugValid === true && (
            <p className="mt-1 text-xs text-ok">Looks good.</p>
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
            placeholder="Cambridge, UK (coarse area only)"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Use a coarse public area, not a home address or private meetup location.
          </p>
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Languages (comma-separated, ISO codes preferred — en, ja, …)
          </label>
          <input
            name="languages"
            placeholder="ja, en"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
            Games (comma-separated codes)
          </label>
          <input
            name="games"
            placeholder="pkm, op, mtg"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Use the short codes shown in the price guide. You can change these later.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Official website
            </label>
            <input
              name="website_url"
              type="url"
              inputMode="url"
              placeholder="https://example.org"
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-ink-faint mb-1">
              Public contact page
            </label>
            <input
              name="public_contact_url"
              type="url"
              inputMode="url"
              placeholder="https://example.org/contact"
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
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
            placeholder="Step-free access, quiet-play options, accessible toilet, sensory notes…"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-ink-faint">
            Do not put personal emails, phone numbers or private addresses in free text. Use the public contact-page link.
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
            placeholder="What's the culture of this collective?"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
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
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border-subtle text-ink text-sm placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="is_public"
            className="mt-0.5 accent-amber-500"
          />
          <span>
            <span className="block">Publish the web profile now</span>
            <span className="mt-1 block text-xs text-ink-faint">
              Visible at /c/{effectiveSlug || "your-slug"}; not automatically listed in the directory.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 rounded-lg border border-border-subtle bg-surface p-4 text-sm text-ink-muted">
          <input
            type="hidden"
            name="directory_notice_version"
            value={DIRECTORY_NOTICE_VERSION}
          />
          <input
            type="checkbox"
            name="directory_listed"
            className="mt-0.5 accent-amber-500"
          />
          <span>
            <span className="block font-medium text-ink">List in the public directory and API</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-faint">
              I confirm I am authorised to represent this organisation and
              consent to distribution of the submitted organisation fields.
              The web-profile box above must also be checked. The listing is
              self-attested and unverified until Cambridge TCG confirms it.
              {" "}<Link
                href="/licenses/community-directory-public-display-v1"
                target="_blank"
                className="text-accent underline"
              >
                Read the versioned display terms
              </Link>.
              <span className="mt-1 block">
                We privately record your account ID, this notice version, the
                action and its time as a publication receipt. The account ID is
                removed after 180 days. The pseudonymised receipt is treated as
                personal data and deleted after two years.
              </span>
            </span>
          </span>
        </label>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !displayName.trim() || slugValid === false}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-ink text-page hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? "Creating…" : "Create collective"}
          </button>
          <Link
            href="/account/collectives"
            className="text-sm text-ink-faint hover:text-ink"
          >
            Cancel
          </Link>
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">
          Abuse control: each account may create 3 organisations per day and
          steward 10 in total. Contact us if you manage a larger legitimate
          network.
        </p>
      </form>
    </div>
  );
}
