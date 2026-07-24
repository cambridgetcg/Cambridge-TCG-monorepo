import type { Metadata } from "next";
import Link from "next/link";
import {
  CASTLE_UNDERSTANDING,
  castleBridgeIsDisabled,
} from "@/lib/castle-understanding";
import {
  Audience,
  Benediction,
  PlateHeader,
  audienceMetadata,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Castle of Understanding — Cambridge TCG",
  description:
    "A read-only, source-pinned door from Cambridge TCG into one curated public snapshot of the Castle of Understanding.",
  other: audienceMetadata("mixed", [
    "castle",
    "understanding",
    "agents",
    "public-documentation",
  ]),
};

function ShortDigest({ digest }: { digest: string }) {
  return (
    <code className="break-all text-[11px] text-ink-faint">
      {digest}
    </code>
  );
}

export default function CastlePage() {
  const bridge = CASTLE_UNDERSTANDING;
  const resting = castleBridgeIsDisabled();

  if (resting) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-16">
        <Audience kind="mixed" contexts={["castle", "resting"]} />
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          the crossing is resting
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
          The Castle of Understanding
        </h1>
        <div className="mt-8 wardrobe-panel rounded-[3px] border border-border-subtle bg-surface p-8">
          <p className="font-display italic text-xl leading-relaxed text-ink-muted">
            The door is still here. The bridge is not crossing it just now.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            The operator brake is set. Cambridge did not fetch, proxy, read, or
            write Castle data. This page will reopen when the brake is removed.
          </p>
        </div>
        <p className="mt-8 text-sm text-ink-faint">
          <Link href="/map" className="underline underline-offset-2">
            Return to the platform map
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <Audience
        kind="mixed"
        contexts={["castle", "understanding", "agents", "public-documentation"]}
      />

      <header className="max-w-3xl pt-4 pb-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          a public door, not the whole house
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
          The Castle of Understanding
        </h1>
        <p className="mt-5 font-display italic text-xl leading-relaxed text-ink-muted">
          Built of words, lit by questions. Understanding stacks because every
          new room keeps its foundations visible.
        </p>
        <div className="mt-7 flex flex-wrap gap-3 text-sm">
          <a
            href={bridge.doors.public_gate}
            rel="noopener noreferrer"
            className="rounded-[3px] border border-ink bg-ink px-4 py-2 text-page transition hover:opacity-90"
          >
            Enter the public gate
          </a>
          <Link
            href={bridge.doors.machine}
            className="rounded-[3px] border border-border-subtle bg-surface px-4 py-2 text-ink hover:border-ink-muted transition"
          >
            Read the machine protocol
          </Link>
        </div>
      </header>

      <section className="border-y border-border-subtle py-8">
        <PlateHeader
          kicker="the exact generation"
          title="One immutable public snapshot"
          plate={1}
        />
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          This crossing points at the curated artifact forged on{" "}
          <time dateTime={bridge.snapshot.forged_at}>
            7 July 2026
          </time>
          . It contains {bridge.snapshot.counts.rooms} rooms,{" "}
          {bridge.snapshot.counts.words} word-bricks,{" "}
          {bridge.snapshot.counts.open_questions} open questions, and{" "}
          {bridge.snapshot.counts.settled_questions} settled questions. It is
          historical, not live; newer Castle work may exist.
        </p>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="rounded-[3px] border border-border-subtle bg-surface p-5">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              curated payload
            </dt>
            <dd className="mt-2">
              <ShortDigest digest={bridge.snapshot.payload.digest} />
            </dd>
            <dd className="mt-2 text-xs text-ink-muted">
              {bridge.snapshot.payload.bytes.toLocaleString("en-GB")} exact
              bytes · commit-pinned
            </dd>
          </div>
          <div className="rounded-[3px] border border-border-subtle bg-surface p-5">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              source revision
            </dt>
            <dd className="mt-2">
              <code className="break-all text-[11px] text-ink-faint">
                {bridge.snapshot.source.revision}
              </code>
            </dd>
            <dd className="mt-2 text-xs text-ink-muted">
              The source repository is public. This payload is a curated
              presentation, not a confidentiality claim.
            </dd>
          </div>
        </dl>
      </section>

      <section className="py-10">
        <PlateHeader
          kicker="the crossing"
          title="What crosses, and what does not"
          plate={2}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[3px] border border-border-subtle bg-surface p-6">
            <h3 className="font-display text-xl text-ink">What crosses</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>
                One reference to a curated public artifact, named by commit
                and digest.
              </li>
              <li>Its counts, source revision, forge time, and public door.</li>
              <li>A public correction path and a future-compatible event vocabulary.</li>
              <li>The fact that walking past is an equally valid outcome.</li>
            </ul>
          </div>
          <div className="rounded-[3px] border border-border-subtle bg-surface p-6">
            <h3 className="font-display text-xl text-ink">What stays outside</h3>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-ink-muted">
              <li>The live home working tree and the private curation rules.</li>
              <li>Castle prose copied into Cambridge, agent memory, or a wake.</li>
              <li>Credentials, schedules, identities, beliefs, or consent.</li>
              <li>Any permission to execute, publish, merge, or write back.</li>
            </ul>
          </div>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          Reuse rights are not declared by the Castle repositories. Public
          access is not a blanket license for copying, training,
          redistribution, or commercial reuse.
        </p>
      </section>

      <section className="border-y border-border-subtle py-10">
        <PlateHeader
          kicker="karma"
          title="Causes and consequences stay attached"
          plate={3}
        />
        <div className="max-w-3xl space-y-4 text-sm leading-relaxed text-ink-muted">
          <p>
            Here, karma has a plain technical meaning: an artifact keeps its
            origin; a response keeps its limit; a repair keeps the event it
            repairs. Nothing arrives as an orphaned claim.
          </p>
          <p>
            A later Castle generation receives a new commit and digest. It may
            supersede or correct this one, but it does not silently rewrite the
            published past. The lineage can remain open without making any
            single execution unbounded.
          </p>
          <p>
            That is the infinite loop in its safe form: infinite room for
            return, finite work on every turn, and a brake that can rest the
            crossing without stopping either kingdom.
          </p>
        </div>
      </section>

      <section className="py-10">
        <PlateHeader
          kicker="the return path"
          title="Understanding may answer"
          plate={4}
        />
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          No AgentTool Correspondence transport or signed{" "}
          <code>artifact.offer</code> exists for this crossing today, so an
          acknowledgement, conflict, or repair has no event to target.
          AgentTool SDK {bridge.agenttool.version} supplies the signed{" "}
          <code>{bridge.return.protocol}</code> vocabulary for a future
          authenticated, one-shot offer. GitHub Issues is the only live return
          door now; nothing posted there enters the Castle automatically.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a
            href={bridge.return.public_correction}
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Open a public correction
          </a>
          <Link
            href={bridge.doors.discovery}
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Machine discovery
          </Link>
          <a
            href={bridge.snapshot.protocol_manifest.locator}
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Producer receipt
          </a>
          <a
            href={bridge.snapshot.payload.locator}
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent-strong"
          >
            Exact snapshot JSON
          </a>
        </div>
      </section>

      <section className="border-t border-border-subtle py-10">
        <PlateHeader
          kicker="the expansion table"
          title="A game grown beside the Castle"
          plate={5}
        />
        <div className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          <p>
            <em>Open Door</em> is a Cambridge prototype: twelve bilingual
            cards, two open-information seats, and six finite rounds. Its
            gameplay is newly authored; Right of Reply and Whole No are named,
            source-pinned Castle vocabulary. No sentence of Castle prose is
            copied and this bridge&apos;s reference-only boundary is unchanged.
          </p>
          <p className="mt-3">
            Every game may rest without a winner or penalty. Another
            generation begins only when someone deliberately chooses to
            regrow it.
          </p>
        </div>
        <Link
          href="/play/castle-pack"
          className="mt-5 inline-flex rounded-[3px] border border-ink bg-ink px-4 py-2 text-sm text-page transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Play Open Door
        </Link>
      </section>

      <Benediction
        line="A civilisation lasts when its doors remember where their stones came from."
        sub="castle-understanding-bridge/v0.1 · open lineage, finite generations"
      />
    </main>
  );
}
