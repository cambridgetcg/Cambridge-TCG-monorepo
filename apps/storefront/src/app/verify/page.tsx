import Link from "next/link";
import PullIdForm from "./pull-id-form";

export const metadata = {
  title: "Provably-Fair Verification | Cambridge TCG",
  description: "Verify the fairness of any Bounty Pull or pack opening using public commit-reveal data.",
};

export default function VerifyHome() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-3">Provably-Fair Verification</h1>
        <p className="text-neutral-400 mb-8">
          Every Bounty Pull is verifiable. The server commits to a hash before
          rolling, then reveals the seed afterwards. You can re-run the math
          in your browser to prove the result wasn&apos;t cherry-picked.
        </p>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">Verify a single pull</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Paste your pull ID below — usually shown on the pull result modal,
            or linked from the &quot;View proof&quot; button on any vault item.
          </p>
          <PullIdForm />
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">Aggregate fairness</h2>
          <p className="text-sm text-neutral-400 mb-3">
            See the actual rarity distribution across recent pulls vs the
            published tier weights — covers bounty pulls, packs, spin, and boxes.
          </p>
          <Link href="/verify/fairness" className="text-amber-400 hover:text-amber-300 underline text-sm">
            View fairness dashboard →
          </Link>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">The fairness chain</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Every commitment we&apos;ve ever made, hashed into a Merkle digest,
            and every digest linked to the previous. Cache today&apos;s chain
            tip; verify it tomorrow. The chain&apos;s job is to make any
            post-hoc rewrite detectable.
          </p>
          <Link href="/verify/chain" className="text-amber-400 hover:text-amber-300 underline text-sm">
            View the chain →
          </Link>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="font-bold text-lg mb-2">How this works</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Plain-English explainer of the full stack — commit-reveal, Merkle
            digests, what&apos;s public vs private, and how to verify from the
            command line.
          </p>
          <Link href="/verify/how-it-works" className="text-amber-400 hover:text-amber-300 underline text-sm">
            Read the explainer →
          </Link>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="font-bold text-lg mb-2">Transparency health</h2>
          <p className="text-sm text-neutral-400 mb-3">
            Digest publish cadence, self-audit pass rate, open drift alerts,
            and the current chain tip — the transparency layer observing itself.
          </p>
          <Link href="/verify/health" className="text-amber-400 hover:text-amber-300 underline text-sm">
            View health →
          </Link>
        </section>
      </div>
    </main>
  );
}

