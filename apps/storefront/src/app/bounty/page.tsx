import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Bounty Board has been retired · Cambridge TCG",
  robots: { index: false, follow: true },
};

export default function BountyRetiredPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight mb-4">
          The Bounty Board has been retired
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted mb-4">
          We&rsquo;ve closed the Bounty Board and the draw mechanic behind it. There
          are no new pulls to open and no tokens to earn — Cambridge TCG doesn&rsquo;t
          run games of chance.
        </p>
        <p className="text-sm leading-relaxed text-ink-muted mb-8">
          Past draws stay honest: every historical pull keeps its published proof,
          and any card already held for you remains yours to redeem from your account.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/rewards"
            className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink"
          >
            Rewards &rarr;
          </Link>
          <Link
            href="/methodology/fees"
            className="inline-flex min-h-11 items-center rounded-lg border border-border-subtle bg-surface px-4 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink"
          >
            How fees work &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
