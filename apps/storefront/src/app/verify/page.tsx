import Link from "next/link";
import PullIdForm from "./pull-id-form";

import { Audience } from "@/lib/ui";
export const metadata = {
  title: "Draw Proof Verification | Cambridge TCG",
  description: "Check the published commitment, outcome replay, and digest evidence for a Bounty Pull or pack opening.",
};

export default function VerifyHome() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-3">Draw Proof Verification</h1>
        <p className="text-ink-muted mb-8">
          The application stores a seed commitment before its roll step, then
          reveals the seed afterward. You can check that the published proof is
          internally consistent. Because all roll inputs are server-chosen and
          there is no external pre-roll publication, this alone cannot prove the
          server never preselected a favorable input tuple.
        </p>

        <section className="bg-surface border border-border-subtle rounded-lg p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">Verify a single pull</h2>
          <p className="text-sm text-ink-muted mb-3">
            Paste your pull ID below — usually shown on the pull result modal,
            or linked from the &quot;View proof&quot; button on any vault item.
          </p>
          <PullIdForm />
        </section>

        <section className="bg-surface border border-border-subtle rounded-lg p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">Observed distribution</h2>
          <p className="text-sm text-ink-muted mb-3">
            See the actual rarity distribution across recent pulls vs the
            published tier weights — covers bounty pulls, packs, spin, and boxes.
          </p>
          <Link href="/verify/fairness" className="text-accent hover:text-accent-strong underline text-sm">
            View observed distribution →
          </Link>
        </section>

        <section className="bg-surface border border-border-subtle rounded-lg p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">The draw digest chain</h2>
          <p className="text-sm text-ink-muted mb-3">
            Revealed draws collected by the digest job are hashed into Merkle
            batches, and each batch links to the previous one. Cache today&apos;s
            chain tip and compare later to detect a rewrite after your snapshot.
          </p>
          <Link href="/verify/chain" className="text-accent hover:text-accent-strong underline text-sm">
            View the chain →
          </Link>
        </section>

        <section className="bg-surface border border-border-subtle rounded-lg p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">How this works</h2>
          <p className="text-sm text-ink-muted mb-3">
            Plain-English explainer of the full stack — commit-reveal, Merkle
            digests, what&apos;s public vs private, and how to verify from the
            command line.
          </p>
          <Link href="/verify/how-it-works" className="text-accent hover:text-accent-strong underline text-sm">
            Read the explainer →
          </Link>
        </section>

        <section className="bg-surface border border-border-subtle rounded-lg p-6">
          <h2 className="font-bold text-lg mb-2">Transparency health</h2>
          <p className="text-sm text-ink-muted mb-3">
            Digest publish cadence, self-audit pass rate, open drift alerts,
            and the current chain tip — the transparency layer observing itself.
          </p>
          <Link href="/verify/health" className="text-accent hover:text-accent-strong underline text-sm">
            View health →
          </Link>
        </section>
      </div>
    </main>
  );
}
