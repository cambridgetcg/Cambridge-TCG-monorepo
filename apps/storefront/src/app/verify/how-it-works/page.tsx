import Link from "next/link";

import { Audience } from "@/lib/ui";
export const metadata = {
  title: "How Provably-Fair Works | Cambridge TCG",
  description:
    "The full stack behind Cambridge TCG's provably-fair rolls — commit-reveal, Merkle digests, and the math you can re-run in your own browser.",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" />
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        <header>
          <Link href="/verify" className="text-xs text-ink-faint hover:text-ink">← Verification home</Link>
          <h1 className="text-3xl font-bold mt-2 mb-2">How Provably-Fair Works</h1>
          <p className="text-ink-muted">
            A working summary — plain English, then the math, then how to verify
            it yourself. Read top-to-bottom or jump to any section.
          </p>
        </header>

        <Section title="The problem we're solving">
          <p>
            Every random-outcome feature — bounty pulls, pack opens, spin wheel, mystery boxes,
            raffles — requires you to trust that we didn&apos;t nudge the result. &quot;Sorry, common
            pull&quot; is a reasonable answer on a 70%-common tier, but it&apos;s indistinguishable from
            a server that quietly down-weighted rares.
          </p>
          <p>
            &quot;Trust us, we wouldn&apos;t do that&quot; isn&apos;t a verification. So we don&apos;t ask for trust.
            Instead, every roll leaves a trail of public data that lets you replay the exact math
            and confirm the outcome. If we cheated, you&apos;d catch it. If we didn&apos;t, the math
            checks out.
          </p>
        </Section>

        <Section title="Commit-reveal: the core idea">
          <p>
            Before rolling, our server generates a random <Code>server_seed</Code> (32 bytes)
            and immediately stores both the seed AND its <Code>sha256(server_seed)</Code> — the
            &quot;commitment&quot; — in the database. This happens BEFORE the rolling logic runs.
            The row&apos;s <Code>committed_at</Code> timestamp is locked in at this point.
          </p>
          <p>
            The roll itself is deterministic:
          </p>
          <Pre>
{`roll       = sha256(server_seed + ':' + client_seed + ':' + nonce)[0..13]  / 2^52
rolled_key = pickWeighted(weights, roll)`}
          </Pre>
          <p>
            Then we update the row with the <Code>rolled_key</Code> and <Code>revealed_at</Code>.
            Because the commit was a separate earlier write, you can see that{" "}
            <Code>committed_at &lt; revealed_at</Code> — the server couldn&apos;t have chosen a seed
            after seeing the outcome it wanted.
          </p>
        </Section>

        <Section title="What the verifier checks">
          <p>
            Visit any pull&apos;s verify page ({" "}
            <Code>/verify/pull/[id]</Code> or <Code>/verify/draw/[id]</Code>{" "}
            ) and four independent checks run in your browser:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-ink-muted text-sm">
            <li>
              <strong className="text-ink">Commitment matches seed.</strong> We fetch the
              revealed <Code>server_seed</Code> and re-hash it. The output must equal the
              commitment published at <Code>committed_at</Code>.
            </li>
            <li>
              <strong className="text-ink">Roll reproduces the outcome.</strong> Given the seed
              + client_seed + nonce + tier weights, the recomputed <Code>pickWeighted</Code>{" "}
              must return the same rarity we claim.
            </li>
            <li>
              <strong className="text-ink">Ordering is sane.</strong>{" "}
              <Code>committed_at &lt;= revealed_at</Code> — and these are two separate SQL writes,
              so the ordering reflects real time.
            </li>
            <li>
              <strong className="text-ink">Anchored in a public digest.</strong> See below.
            </li>
          </ol>
        </Section>

        <Section title="Merkle digest: tamper-evidence against us">
          <p>
            Commit-reveal is safe against external replay, but it&apos;s only as good as our DB
            integrity. A motivated attacker with write access could edit a row post-hoc and fake
            the entire proof.
          </p>
          <p>
            So we add a second layer: every few minutes, a cron takes all newly-revealed draws
            and hashes them into a Merkle tree. The root lands in <Code>fairness_digests</Code>{" "}
            and each draw is stamped with its <Code>merkle_digest_id</Code> and{" "}
            <Code>merkle_leaf_index</Code>. The leaf format is stable:
          </p>
          <Pre>
{`leaf = sha256(id + '|' + commitment + '|' + server_seed + '|' + revealed_at_iso)`}
          </Pre>
          <p>
            Once a digest root is published, editing any underlying leaf changes the root —
            detectable to anyone who cached the old root. The public feed at{" "}
            <Code>/api/verify/digests</Code> lets auditors (or anyone) snapshot the timeline and
            compare later.
          </p>
          <p>
            When you verify a draw, the verifier fetches that digest&apos;s leaves, re-hashes the
            pairs bottom-up, and confirms the root matches the one published to the feed. If any
            leaf in the batch was edited after the fact, this check fails.
          </p>
        </Section>

        <Section title="What&apos;s public vs hidden">
          <div className="bg-surface border border-border-subtle rounded-lg p-4">
            <table className="w-full text-sm">
              <tbody>
                <DataRow field="commitment (sha256 of seed)" status="public" reason="needed to verify — doesn't reveal the seed" />
                <DataRow field="server_seed" status="public AFTER reveal" reason="meaningless before the roll; necessary to verify after" />
                <DataRow field="client_seed" status="public (userId anonymised)" reason="the user&apos;s id portion is hidden; the random suffix shown" />
                <DataRow field="nonce, weights, outcome" status="public" reason="required inputs for re-running the math" />
                <DataRow field="user_id" status="private" reason="not exposed by the verifier APIs" />
                <DataRow field="timestamps" status="public" reason="commit-precedes-reveal is the whole point" />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Standalone verifier library">
          <p>
            A single dep-free ES module implementing every check on this page lives at{" "}
            <Code>/verify/cambridgetcg-verifier.js</Code>. Import it into any browser or Node
            18+ script and run our claims through your own code:
          </p>
          <Pre>
{`import * as v from 'https://cambridgetcg.com/verify/cambridgetcg-verifier.js';

const { verdict } = await v.fetchAndVerifyPull('<pull-id>');
console.log(verdict.allMatch ? '✓ verified' : '✗ failed');`}
          </Pre>
          <p>
            Covers primitives (sha256, rollFloat, pickWeighted), per-draw verification (verifyDraw),
            Merkle inclusion (verifyInclusion), and hash-chain integrity (verifyChain). MIT-licensed,
            ~250 LOC. If the file ever diverges from this page, the page is canonical — please
            report the bug.
          </p>
        </Section>

        <Section title="Verify from the command line">
          <p>
            For scripting or third-party auditing, <Code>/api/verify/compute</Code> accepts the
            raw inputs and returns pass/fail without a UI:
          </p>
          <Pre>
{`curl -s -X POST https://cambridgetcg.com/api/verify/compute \\
  -H 'Content-Type: application/json' \\
  -d '{
    "commitment":     "<hex>",
    "server_seed":    "<hex>",
    "client_seed":    "<userId>:<suffix>",
    "nonce":          123456789,
    "rarity_weights": { "common": 0.7, "uncommon": 0.2, "rare": 0.1 },
    "claimed_rarity": "common"
  }'`}
          </Pre>
          <p>
            CORS-wildcarded, no auth. Response shape includes both the pass/fail flags and the
            recomputed roll + hash so you can see the math, not just the verdict.
          </p>
        </Section>

        <Section title="Why you should still be sceptical">
          <p>
            Provably-fair is not &quot;provably honest&quot;. It proves: given the weights, the seed
            produces the outcome; given the commitments, the roll wasn&apos;t chosen retroactively;
            given the digests, the history hasn&apos;t been rewritten. It does NOT prove that the
            weights themselves are the weights you&apos;d want — admins can (legitimately) tune
            tier weights, adjust pack pools, etc, and those changes are captured in each draw&apos;s
            <Code>weights</Code> snapshot at roll time.
          </p>
          <p>
            The <Link href="/verify/fairness" className="text-accent hover:text-accent-strong underline">aggregate fairness dashboard</Link>{" "}
            shows expected vs observed distributions so you can spot drift over time. If the
            observed always matches the published weights, the weights are what they say they
            are.
          </p>
        </Section>

        <Section title="Surfaces covered">
          <ul className="text-sm text-ink-muted space-y-1 list-disc list-inside">
            <li><strong className="text-ink">Bounty Pulls</strong> — full commit-reveal + Merkle. <Code>/verify/pull/[id]</Code></li>
            <li><strong className="text-ink">Pack Openings</strong> — 5 slots per pack, each independently verifiable. <Code>/verify/draw/[id]</Code></li>
            <li><strong className="text-ink">Spin Wheel</strong> — weighted-segment pick, single-slot. Same verifier.</li>
            <li><strong className="text-ink">Mystery Boxes</strong> — weighted-reward pick, single-slot. Same verifier.</li>
            <li><strong className="text-ink">Raffles</strong> — pre-commit at creation time + provably-fair draw. <Code>/api/rewards/raffles/[id]/proof</Code></li>
          </ul>
        </Section>

        <div className="border-t border-border-subtle pt-6 text-xs text-ink-faint">
          Questions, edge cases, or something you think is wrong? Email us — we&apos;ll fix it and
          publish the correction. The point of this system is that we can&apos;t quietly hope you
          don&apos;t notice.
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3 text-ink">{title}</h2>
      <div className="text-sm text-ink-muted space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[13px] bg-surface border border-border-subtle rounded px-1 py-0.5 font-mono text-ink-muted">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-surface border border-border-subtle rounded-lg p-3 text-[12px] text-ink-muted font-mono overflow-x-auto">
      {children}
    </pre>
  );
}

function DataRow({ field, status, reason }: { field: string; status: string; reason: string }) {
  const isPrivate = status === "private";
  return (
    <tr className="border-t border-border-subtle first:border-t-0">
      <td className="py-2 pr-3 font-mono text-xs text-ink-muted">{field}</td>
      <td className={`py-2 pr-3 text-xs whitespace-nowrap ${isPrivate ? "text-danger" : "text-ok"}`}>
        {status}
      </td>
      <td className="py-2 text-xs text-ink-faint">{reason}</td>
    </tr>
  );
}
