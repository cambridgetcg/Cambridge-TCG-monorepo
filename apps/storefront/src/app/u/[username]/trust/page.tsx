import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublishedTrustState } from "@/lib/trust/public";
import {
  Audience,
  Provenance,
  TrustTier,
  WhyLink,
  audienceMetadata,
} from "@/lib/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username} — Trust`,
    description:
      "Narrow public trust evidence for an explicitly-public profile: score, tier, completed trades and public-review aggregates.",
    other: audienceMetadata("consumer", ["trust", "user", "public-read"]),
  };
}

function monthYear(iso: string | null): string {
  if (!iso) return "Not available";
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export default async function PublicTrustPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const state = await loadPublishedTrustState(username);
  if (!state) notFound();

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trust", "user", "public-read"]} />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-6 text-sm text-ink-faint" aria-label="Breadcrumb">
          <Link href={`/u/${state.username}`} className="hover:text-accent">
            @{state.username}
          </Link>{" "}
          / Trust
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-muted">{state.display_name ?? `@${state.username}`}</p>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-semibold">
              Public trust evidence
              <TrustTier name={state.tier.name} score={state.trust_score} size="md" />
              <WhyLink href="/methodology/trust-score" />
            </h1>
          </div>
          <Provenance kind="live" />
        </header>

        <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
          This view is deliberately narrow. It helps a counterparty assess trading
          history without publishing a financial dossier, adverse-event ledger,
          account limits or internal identifiers.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border-subtle bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Completed trades</p>
            <p className="mt-2 font-mono text-3xl font-semibold">{state.completed_trades}</p>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface p-5">
            <p className="text-[11px] uppercase tracking-wider text-ink-faint">Public reviews</p>
            <p className="mt-2 font-mono text-3xl font-semibold">
              {state.reviews.average == null ? "—" : state.reviews.average.toFixed(1)}
              <span className="text-base text-ink-faint"> / 5</span>
            </p>
            <p className="mt-1 text-xs text-ink-faint">{state.reviews.total} total</p>
          </div>
        </section>

        <p className="mt-5 text-sm text-ink-faint">
          Member since {monthYear(state.member_since)}. Exact trade values,
          largest trade, cancellations, disputes, flags, suspension detail,
          commission, payout and account limits are not published here.
        </p>

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href={`/api/v1/users/${state.username}/trust`} className="rounded-lg border border-border-subtle px-4 py-2">
            JSON
          </Link>
          <Link href={`/api/v1/universal/users/${state.username}/trust`} className="rounded-lg border border-border-subtle px-4 py-2">
            Structural JSON
          </Link>
          <Link href="/methodology/community" className="rounded-lg border border-border-subtle px-4 py-2">
            Publication boundary
          </Link>
        </div>
      </div>
    </main>
  );
}
