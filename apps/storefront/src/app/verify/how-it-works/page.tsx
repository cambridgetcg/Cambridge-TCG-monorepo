import Link from "next/link";

import { Audience } from "@/lib/ui";
export const metadata = {
  title: "How Draw Proof Verification Works | Cambridge TCG",
  description:
    "The guarantees and limits behind Cambridge TCG draw receipts, outcome replay, and Merkle digests.",
};

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" />
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
        <header>
          <Link href="/verify" className="text-xs text-ink-faint hover:text-ink">← Verification home</Link>
          <h1 className="text-3xl font-bold mt-2 mb-2">How Draw Proof Verification Works</h1>
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
            &quot;Trust us, we wouldn&apos;t do that&quot; isn&apos;t a verification. These receipts narrow the
            trust required; they do not eliminate it. Each listed flow leaves commitment and timing
            evidence after the roll. New generic draws use opaque public client seeds and store an
            explicit <Code>weight_order</Code> array, so the recorded inputs can reproduce the exact
            outcome. Older generic rows stored weights only as a JSON object; PostgreSQL
            <Code>jsonb</Code> did not preserve their original key order, so those rows remain partial
            even when an owner can see an older account-linked client seed.
          </p>
        </Section>

        <Section title="Commit-reveal: the core idea">
          <p>
            Before rolling, our server generates a random <Code>server_seed</Code> (32 bytes)
            and stores both the seed AND its <Code>sha256(server_seed)</Code> — the
            &quot;commitment&quot; — in the database. This happens BEFORE the rolling logic runs.
            The row&apos;s <Code>committed_at</Code> timestamp is recorded at this point; it is not an
            independent timestamp and a database administrator can rewrite it.
          </p>
          <p>
            The roll itself is deterministic:
          </p>
          <Pre>
{`roll       = sha256(server_seed + ':' + client_seed + ':' + nonce)[0..13]  / 2^52
rolled_key = pickWeighted(weights, weight_order, roll)`}
          </Pre>
          <p>
            Then we update the row with the <Code>rolled_key</Code> and <Code>revealed_at</Code>.
            The separate writes record that <Code>committed_at &lt; revealed_at</Code> in our
            database. Generic draws are not externally witnessed before the roll, and the server
            chooses every entropy input, so this sequence does not prove that no favorable tuple
            was selected before the commitment write.
          </p>
        </Section>

        <Section title="What the verifier checks">
          <p>
            Visit any pull&apos;s verify page ({" "}
            <Code>/verify/pull/[id]</Code> or <Code>/verify/draw/[id]</Code>{" "}
            ) and up to four separate checks run in your browser:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-ink-muted text-sm">
            <li>
              <strong className="text-ink">Commitment matches seed.</strong> We fetch the
              revealed <Code>server_seed</Code> and re-hash it. The output must equal the
              commitment stored at <Code>committed_at</Code>.
            </li>
            <li>
              <strong className="text-ink">Roll reproduces the outcome.</strong> When the client
              seed is available, the seed + client_seed + nonce + weights must reproduce the claimed
              <Code>pickWeighted</Code> result. Generic receipts also need a valid ordered-weight
              array. Legacy generic rows without that array are reported as partial rather than
              replayed in the database&apos;s present object order.
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
            The per-draw checks establish internal consistency, but they are only as good as our
            database integrity. A motivated attacker with write access could edit a row before
            any external observer captures later digest evidence.
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
            pairs bottom-up, and confirms the root matches the live feed. A changed leaf fails
            unless the feed is rewritten too; an externally saved earlier root is what exposes
            that second case.
          </p>
        </Section>

        <Section title="What&apos;s public vs hidden">
          <div className="bg-surface border border-border-subtle rounded-lg p-4">
            <table className="w-full text-sm">
              <tbody>
                <DataRow field="commitment (sha256 of seed)" status="public with receipt" reason="stored before the application roll step; generic draws have no external pre-roll publication" />
                <DataRow field="server_seed" status="public AFTER reveal" reason="meaningless before the roll; necessary to verify after" />
                <DataRow field="client_seed (new opaque format)" status="public" reason="needed for outcome replay and contains no account id" />
                <DataRow field="client_seed (legacy account-linked)" status="owner-only" reason="anonymous replay is partial rather than exposing the account UUID" />
                <DataRow field="nonce, weights, outcome" status="public" reason="required values for re-running the math" />
                <DataRow field="weight_order (new generic receipts)" status="public" reason="JSON arrays preserve the selection order that jsonb object keys do not" />
                <DataRow field="user_id" status="private" reason="not exposed by the verifier APIs" />
                <DataRow field="timestamps" status="public" reason="record application write order; they are not independently witnessed" />
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
console.log(verdict.allMatch === null ? 'partial' : verdict.allMatch ? 'verified' : 'failed');`}
          </Pre>
          <p>
            Covers primitives (sha256, rollFloat, pickWeighted), per-draw verification (verifyDraw),
            Merkle inclusion (verifyInclusion), and hash-chain integrity (verifyChain). MIT-licensed,
            ~250 LOC. <Code>verifyDraw</Code> reports <Code>allMatch: null</Code> when a client seed
            is withheld or a generic receipt lacks a valid <Code>weight_order</Code>; that means
            partial, not failed. If the file ever diverges from this page, please report the bug.
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
    "client_seed":    "<opaque-client-seed>",
    "nonce":          123456789,
    "rarity_weights": { "common": 0.7, "uncommon": 0.2, "rare": 0.1 },
    "claimed_rarity": "common"
  }'`}
          </Pre>
          <p>
            CORS-wildcarded, no auth. Supply only a client seed you are entitled to see. The
            response includes both pass/fail flags and the recomputed roll + hash.
          </p>
        </Section>

        <Section title="Why you should still be sceptical">
          <p>
            These receipts prove a narrower statement: the revealed seed hashes to the stored
            commitment, the available inputs reproduce the recorded outcome, and a digest can
            reveal later rewriting relative to a copy held outside our control. They do not prove
            unbiased seed selection: generic draws use server-generated server seed, client seed,
            and nonce, with no external pre-roll witness. A stronger design needs entropy supplied
            by the participant or an external randomness beacon committed before selection.
          </p>
          <p>
            They also do not prove that the weights are the weights you would want. Admins can
            tune tier weights and pools; each receipt records the weights used for that draw.
          </p>
          <p>
            The <Link href="/verify/fairness" className="text-accent hover:text-accent-strong underline">observed distribution dashboard</Link>{" "}
            compares recorded outcomes with recorded or configured weights. It can flag drift;
            it cannot establish unbiased seed selection for an individual draw.
          </p>
        </Section>

        <Section title="Surfaces covered">
          <ul className="text-sm text-ink-muted space-y-1 list-disc list-inside">
            <li><strong className="text-ink">Bounty Pulls</strong> — commit-reveal + Merkle; legacy anonymous replay may be partial. <Code>/verify/pull/[id]</Code></li>
            <li><strong className="text-ink">Pack Openings</strong> — 5 reproducible slots for newer receipts with a visible client seed and ordered-weight array. <Code>/verify/draw/[id]</Code></li>
            <li><strong className="text-ink">Spin Wheel</strong> — weighted-segment pick, single-slot. Same verifier.</li>
            <li><strong className="text-ink">Mystery Boxes</strong> — weighted-reward pick, single-slot. Same verifier.</li>
            <li><strong className="text-ink">Raffles</strong> — commitment stored at creation when that write succeeds; active raffle listings expose the hash before entry, but it is not externally anchored. <Code>/api/rewards/raffles/[id]/proof</Code></li>
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
  const isPrivate = status === "private" || status === "owner-only";
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
