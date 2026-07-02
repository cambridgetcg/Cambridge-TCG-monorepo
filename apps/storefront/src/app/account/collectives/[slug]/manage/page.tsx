/**
 * /account/collectives/[slug]/manage — steward-only management surface.
 *
 * Edit profile fields; invite + remove members. Non-stewards 404 (so
 * the existence of a private collective isn't leaked through this route
 * either).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { audienceMetadata } from "@/lib/ui";
import {
  getCollectiveBySlug,
  getActiveMembers,
  isSteward,
} from "@/lib/collectives/db";
import { ManageClient } from "./_client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(
  { params }: PageProps,
): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Manage ${slug}`,
    other: audienceMetadata("consumer", ["account", "collective", "manage"]),
  };
}

export default async function ManageCollectivePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/api/auth/signin?callbackUrl=/account/collectives/${slug}/manage`);
  }
  const userId = session.user.id;
  const collective = await getCollectiveBySlug(slug, userId);
  if (!collective) notFound();
  if (!(await isSteward(collective.id, userId))) notFound();

  const members = await getActiveMembers(collective.id, true);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-ink">
      <header className="mb-6">
        <Link
          href="/account/collectives"
          className="text-xs uppercase tracking-wider text-ink-faint hover:text-accent-strong"
        >
          ← Your collectives
        </Link>
        <div className="flex items-baseline gap-3 mt-2 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold">Manage {collective.display_name}</h1>
          <Link
            href={`/c/${collective.slug}`}
            className="text-xs uppercase tracking-wider text-accent-strong hover:text-accent-strong underline"
          >
            View public →
          </Link>
        </div>
        <p className="text-xs text-ink-faint">
          You are the steward. Only you can edit profile fields and manage
          members.
        </p>
      </header>

      <ManageClient collective={collective} members={members} />
    </div>
  );
}
