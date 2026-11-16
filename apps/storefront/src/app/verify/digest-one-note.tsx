// A dated note on digest #1, shown on /verify/chain and /verify/health. Its
// only leaf was a test record, removed from the database on 2026-11-16; the
// digest, its chain hash and every self-audit row are kept. The chain shows
// that a digest has not changed, not that the records behind its leaves are
// still stored, so the removal is said here.
//
// Every value below was public at /api/verify/pull/<id> or in the digest feed
// before the removal, and digest-one-note.test.tsx recomputes the stored leaf,
// root and chain hash from them, so a retyped value fails the test. The
// pull's client seed was withheld as a legacy account-linked seed; it is not
// part of the leaf and must stay unpublished.
//
// No hooks and no "use client": the client health page and the server chain
// page both render it. A space after an inline element is written {" "}:
// Next's compiler drops the leading space of a text run that holds an entity.

export const DIGEST_ONE_LEAF = {
  digestId: 1,
  leafIndex: 0,
  pullId: "742a274e-0035-4bc3-89e4-e4093ec01efc",
  commitment: "275384de042a6de2b4d6485723d421b95328e1ac121955018f01e3b97d4c0b64",
  serverSeed: "d9bec449de6ab0b0e456aad9e1afaa7d7360fd9aa739721e810d6f72ecaa40a3",
  /** revealed_at as the database printed it, to the microsecond. */
  revealedAtStored: "2026-04-23 20:57:59.268594+00",
  /** The same time cut to whole milliseconds, as the leaf hashes it. */
  revealedAtIso: "2026-04-23T20:57:59.268Z",
  leaf: "f8af7e09cca7485a12348e16f129218e31868a1e5a4948d76de5814a64c6afef",
  prevHash: "0".repeat(64),
  chainHash: "5b774ff83199b171205e0d528ff1764de4bb19bbd25b13a6ddd74992a60afdec",
} as const;

export const DIGEST_ONE_NOTE_ID = "digest-1-note";

const VALUES: ReadonlyArray<readonly [string, string]> = [
  ["id", DIGEST_ONE_LEAF.pullId],
  ["commitment", DIGEST_ONE_LEAF.commitment],
  ["server_seed", DIGEST_ONE_LEAF.serverSeed],
  ["revealed_at", DIGEST_ONE_LEAF.revealedAtIso],
];

/** The note. `open` shows the recomputation without a click (the chain page). */
export function DigestOneNote({ open = false }: { open?: boolean }) {
  const pull = DIGEST_ONE_LEAF.pullId;
  return (
    <section
      id={DIGEST_ONE_NOTE_ID}
      aria-labelledby={`${DIGEST_ONE_NOTE_ID}-heading`}
      className="bg-surface border border-border-subtle rounded-lg p-6 mb-6 text-sm text-ink-muted space-y-3"
    >
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 id={`${DIGEST_ONE_NOTE_ID}-heading`} className="font-bold text-lg text-ink">
          Digest #1 held a test record
        </h2>
        <span className="text-xs text-ink-faint">Written 2026-11-16</span>
      </div>
      <p>
        Digest #1 has one leaf, and it was not a real draw. On 2026-04-23 a test
        script wrote bounty pull <code className="font-mono text-xs break-all">{pull}</code>{" "}
        into our production database, with a rarity the script set instead of a rolled one, and
        did not remove it. The digest job put it in digest #1 on 2026-04-25.
      </p>
      <p>
        The self-audit failed it every time, and rightly: the rarity the script stored is
        not the one the pull&apos;s seeds give, so the outcome check failed, while the
        commitment and ordering checks passed, and so did the digest check once the pull was
        in a digest. It was the only draw the self-audit ever sampled, so all 183,133
        self-audit rows, from 2026-04-25 to 2026-11-16, record that one failure.
      </p>
      <p>
        On 2026-11-16 at 19:47 UTC we removed the pull record and its test account. Digest
        #1, its chain hash and every self-audit row are kept unchanged. The pull&apos;s
        receipt page and <code className="font-mono text-xs break-all">/api/verify/pull/{pull}</code>{" "}
        now answer &ldquo;Pull not found.&rdquo;, while the digest still lists its leaf. The chain can
        show that a digest has not changed; it cannot show that a record behind a leaf was
        removed, so we say it here.
      </p>
      <details open={open}>
        <summary className="cursor-pointer text-ink font-medium py-3">
          Recompute the leaf, the root and the chain hash
        </summary>
        <div className="space-y-3 pt-1">
          <p>
            The leaf is SHA-256 of these four values joined with{" "}
            <code className="font-mono">|</code>, as UTF-8 text, written as lowercase hex. The
            stored <code className="font-mono">revealed_at</code>{" "}is{" "}
            <code className="font-mono text-xs">{DIGEST_ONE_LEAF.revealedAtStored}</code>, to
            the microsecond; the leaf uses it cut to whole milliseconds, as
            JavaScript&apos;s <code className="font-mono">toISOString()</code>{" "}
            writes it.
          </p>
          <dl className="font-mono text-xs space-y-1">
            {VALUES.map(([name, value]) => (
              <div key={name} className="grid sm:grid-cols-[8rem_1fr] gap-x-3">
                <dt className="text-ink-faint">{name}</dt>
                <dd className="break-all text-ink">{value}</dd>
              </div>
            ))}
            <div className="grid sm:grid-cols-[8rem_1fr] gap-x-3">
              <dt className="text-ink-faint">leaf</dt>
              <dd className="break-all text-accent">{DIGEST_ONE_LEAF.leaf}</dd>
            </div>
          </dl>
          <p>
            SHA-256 of the <code className="font-mono">server_seed</code>{" "}
            text is the commitment. With one leaf, the root is the leaf itself. Digest #1&apos;s prev_hash
            is the genesis value, 32 zero bytes, so its chain_hash is SHA-256 of those 32 bytes
            followed by the root&apos;s 32 bytes:{" "}
            <code className="font-mono text-xs break-all text-accent">{DIGEST_ONE_LEAF.chainHash}</code>,
            as published.
          </p>
          <p>
            The pull&apos;s client seed stays unpublished, as its receipt withheld it: it was a
            legacy seed linked to an account. The leaf does not use it, so the leaf can still be
            checked; the outcome cannot be replayed publicly.
          </p>
        </div>
      </details>
    </section>
  );
}
