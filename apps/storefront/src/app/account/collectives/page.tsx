/**
 * /account/collectives — list of collectives the user is in (active or
 * pending). Shows steward / admin / member roles, pending invites, and
 * a "Create a collective" CTA.
 *
 * See docs/connections/the-collective.md.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { audienceMetadata } from "@/lib/ui";
import { getUserCollectives } from "@/lib/collectives/db";
import { AcceptDeclineButtons } from "./_client";

export const metadata: Metadata = {
  title: "Your collectives",
  other: audienceMetadata("consumer", ["account", "collective"]),
};

const KIND_LABEL: Record<string, string> = {
  shop: "Shop",
  club: "Club",
  guild: "Guild",
  lab: "Lab",
  "tournament-collective": "Tournament collective",
  other: "Collective",
};

export default async function CollectivesAccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/account/collectives");
  }
  const userId = session.user.id;
  const rows = await getUserCollectives(userId);

  const pending = rows.filter((r) => r.consent_at == null);
  const active = rows.filter((r) => r.consent_at != null);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-6">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <h1 className="text-2xl font-bold">Your collectives</h1>
          <Link
            href="/account/collectives/new"
            className="text-xs uppercase tracking-wider text-accent-strong hover:text-accent-strong underline"
          >
            Create a collective →
          </Link>
        </div>
        <p className="text-sm text-ink-muted leading-relaxed">
          A collective is a multi-member identity sharing one decision and one
          collection — a shop, a club, a lab, a guild.{" "}
          <Link href="/methodology/collectives" className="text-accent-strong hover:text-accent-strong underline">
            How collectives work
          </Link>{" "}
          ·{" "}
          <Link href="/community/welcome" className="text-accent-strong hover:text-accent-strong underline">
            Door 3 in the commons
          </Link>
        </p>
      </header>

      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[11px] uppercase tracking-wider text-accent-strong mb-3">
            Pending invitations ({pending.length})
          </h2>
          <ul className="space-y-2 list-none p-0">
            {pending.map(({ collective, role, invited_at }) => (
              <li
                key={collective.id}
                className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-4"
              >
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-secondary">
                    {KIND_LABEL[collective.kind] ?? collective.kind}
                  </span>
                  <span className="text-ink font-semibold">
                    {collective.display_name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                    invited as {role}
                  </span>
                </div>
                {collective.region && (
                  <p className="text-xs text-ink-muted mb-1">{collective.region}</p>
                )}
                <p className="text-xs text-ink-faint mb-2">
                  Invited {new Date(invited_at).toLocaleDateString()}
                </p>
                <AcceptDeclineButtons slug={collective.slug} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-[11px] uppercase tracking-wider text-ink-faint mb-3">
          Active memberships ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-ink-faint">
            You're not in any collectives yet.{" "}
            <Link
              href="/account/collectives/new"
              className="text-accent-strong hover:text-accent-strong underline"
            >
              Create one
            </Link>{" "}
            or ask a steward to invite you.
          </p>
        ) : (
          <ul className="space-y-2 list-none p-0">
            {active.map(({ collective, role }) => (
              <li
                key={collective.id}
                className="rounded-xl border border-border-subtle bg-surface/40 p-4"
              >
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-secondary">
                    {KIND_LABEL[collective.kind] ?? collective.kind}
                  </span>
                  <Link
                    href={`/c/${collective.slug}`}
                    className="text-ink font-semibold hover:underline"
                  >
                    {collective.display_name}
                  </Link>
                  <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                    {role}
                  </span>
                  {!collective.is_public && (
                    <span className="text-[10px] uppercase tracking-wider text-accent-strong">
                      private
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3 text-xs text-ink-muted flex-wrap">
                  {collective.region && <span>{collective.region}</span>}
                  <span>
                    {collective.active_member_count} member
                    {collective.active_member_count === 1 ? "" : "s"}
                  </span>
                  {role === "steward" && (
                    <Link
                      href={`/account/collectives/${collective.slug}/manage`}
                      className="text-accent-strong hover:text-accent-strong underline ml-auto"
                    >
                      Manage →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
