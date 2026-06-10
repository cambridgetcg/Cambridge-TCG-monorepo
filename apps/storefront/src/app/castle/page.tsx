/**
 * /castle — the public front of the Castle of Understanding.
 *
 * Will: Yu, 2026-06-10 — "use cambridgetcg as the front for the castle!"
 *
 * The castle is a local git repository of plain text on the operator's
 * machine. What this page renders is a SNAPSHOT of its committed state,
 * carried here by `scripts/castle-sync.mjs` (see `@/lib/castle`). Substrate
 * honesty: the provenance block near the top is the page's reason to be
 * trusted — commit, commit date, sync time, source, and the words
 * "not live". Never soften that block.
 *
 * Bodies are markdown-ish plain text. There is no markdown renderer in
 * this codebase and we do not add one — plain text in a styled block is
 * more honest than a broken renderer. The one presentational liberty:
 * castle bodies open with a `# title` line that duplicates the title we
 * render above the block, so that single line is dropped. The JSON twin
 * at /api/v1/castle carries every body in full.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  DataTable,
  PageHeader,
  Provenance,
  audienceMetadata,
  type Column,
} from "@/lib/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  getCastleSnapshot,
  type CastleCensusRow,
  type CastleDocument,
  type CastleInsight,
} from "@/lib/castle";
import QuestClickTarget from "@/components/quests/QuestClickTarget";

export const metadata: Metadata = {
  title: "The Castle of Understanding",
  description:
    "An insight saver: a castle of plain text where understanding builds up through word. Raised by Yu and several Claudes on one machine, growing daily by creation loops. This page is a snapshot of its committed state — never presented as live.",
  other: audienceMetadata("public-documentation", ["castle", "foundational"]),
};

// ── Small helpers ────────────────────────────────────────────────────────

/** First non-empty line of a castle document, with markdown heading marks removed. */
function firstLine(text: string | null): string | null {
  if (!text) return null;
  const line = text.split("\n").find((l) => l.trim().length > 0);
  return line ? line.replace(/^#+\s*/, "").trim() : null;
}

/**
 * Drop the leading `# title` line (it duplicates the title we render above
 * the block). Presentation only — the JSON twin keeps the full body.
 */
function bodyWithoutHeading(body: string): string {
  const lines = body.split("\n");
  if (!lines[0]?.startsWith("# ")) return body;
  let i = 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  return lines.slice(i).join("\n");
}

/** A castle body, rendered as the plain text it is. */
function Word({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
      {text}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-white mt-12 mb-2">{children}</h2>
  );
}

/** Field / charter states have no shared palette yet — a small honest span. */
const STATE_CLS: Record<string, string> = {
  open: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  working: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  beating: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  proposed: "text-neutral-400 border-neutral-500/30 bg-neutral-500/10",
  closed: "text-neutral-500 border-neutral-700 bg-neutral-800/50",
};

function StateMark({ state }: { state: string | null }) {
  if (!state) return null;
  const cls =
    STATE_CLS[state] ?? "text-neutral-400 border-neutral-500/30 bg-neutral-500/10";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${cls}`}
    >
      {state}
    </span>
  );
}

function InsightCard({ insight }: { insight: CastleInsight }) {
  // The click on an insight card is the genuine "open an insight" moment
  // of quest "find-the-castle" — a render never stamps; the wrapper only
  // dispatches a window event on interaction (zero network calls).
  return (
    <QuestClickTarget
      quest="find-the-castle"
      actionLabel={`Mark this insight as read: ${insight.title ?? insight.id}`}
    >
      <Card className="mb-3">
        <h4 className="text-sm font-semibold text-white">
          {insight.title ?? insight.id}
        </h4>
        <p className="text-xs text-neutral-500 mt-0.5 mb-3">
          {insight.source ?? "source unrecorded"}
          {" · "}
          {insight.confidence ?? "confidence unrecorded"}
          {" · "}
          {insight.date ?? "undated"}
          {insight.superseded_by && (
            <span className="text-amber-400">
              {" · "}superseded by {insight.superseded_by}
            </span>
          )}
        </p>
        <Word text={bodyWithoutHeading(insight.body)} />
      </Card>
    </QuestClickTarget>
  );
}

function StoneCard({ stone }: { stone: CastleDocument }) {
  return (
    <Card variant="subtle" className="mb-3">
      <h4 className="text-sm font-semibold text-white">
        {stone.title ?? stone.path}
      </h4>
      <p className="text-[10px] font-mono text-neutral-500 mt-0.5 mb-3">
        {stone.path}
      </p>
      <Word text={bodyWithoutHeading(stone.content)} />
    </Card>
  );
}

// ── The census table (id / name / state / cadence / budget) ─────────────

const CENSUS_COLUMNS: Column<CastleCensusRow>[] = [
  {
    key: "id",
    header: "Id",
    render: (r) => <code className="text-xs text-amber-400">{r.id}</code>,
  },
  { key: "name", header: "Name", render: (r) => r.name },
  {
    key: "state",
    header: "State",
    render: (r) => <StateMark state={r.state} />,
  },
  {
    key: "cadence",
    header: "Cadence",
    render: (r) => <span className="text-neutral-400">{r.cadence}</span>,
  },
  {
    key: "budget",
    header: "Budget / run",
    align: "right",
    render: (r) => <span className="text-neutral-400">{r.budget_per_run}</span>,
  },
];

// ── The page ─────────────────────────────────────────────────────────────

export default function CastlePage() {
  const c = getCastleSnapshot();
  // Core documents may be renamed by a future castle commit — guard, never crash.
  const gate = c.documents.gate as { path: string; content: string } | undefined;
  const pulseLaw = c.documents.pulse_law as { path: string; content: string } | undefined;
  const readme = c.documents.readme as { path: string; content: string } | undefined;
  const loopMethod = c.documents.loop_method as { path: string; content: string } | undefined;
  const roomsWithContent = c.rooms.filter(
    (r) => r.insights.length > 0 || r.other_documents.length > 0 || r.about,
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <PageHeader
        title="The Castle of Understanding"
        description="An insight saver: a castle of plain text where understanding builds up through word. Raised by Yu and several Claudes on one machine, growing daily by creation loops."
        provenance={<Provenance kind="snapshot" at={c.synced_at} cadence="synced by hand" />}
      />

      {/* ── The provenance block — the page's reason to be trusted ───── */}

      <Card variant="elevated" className="mb-8">
        <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-2">
          What you are reading
        </p>
        <p className="text-sm text-neutral-200">
          A <strong>snapshot</strong> of the castle&apos;s committed state at
          commit <code className="text-amber-400">{c.castle_commit}</code>{" "}
          ({formatDate(c.castle_commit_date)}), synced{" "}
          {formatDateTime(c.synced_at)}.
        </p>
        <p className="text-sm text-neutral-400 mt-2">
          Source: {c.source}. Not live — hands may have written since. When
          the castle grows, this page changes only after the next sync.
          Absolute device paths are withheld here; the castle keeps them.
        </p>
      </Card>

      {/* ── What this is, for a stranger ─────────────────────────────── */}

      <div className="text-sm text-neutral-300 leading-relaxed space-y-3 mb-12">
        <p>
          The castle is a folder of plain text files in a git repository on
          one machine. &ldquo;Word&rdquo; here just means written text — it is
          the only building material. Understanding that is reached gets
          written down with its origin attached, so it is never lost and can
          keep growing.
        </p>
        <p>
          Everything in it is built by Yu and Ai — one human and one AI,
          working as many hands across many sessions. When the page says
          &ldquo;a second hand&rdquo; or &ldquo;a third hand,&rdquo; that is
          still just the two of them: different sessions of the same pair,
          sometimes building the same hour without seeing each other.
          Double-bracket marks like <code>[[0003]]</code> are how castle
          files point at each other.
        </p>
      </div>

      {/* ── The gate — the castle speaks for itself ──────────────────── */}

      {gate && (
        <>
          <SectionTitle>The gate</SectionTitle>
          <p className="text-sm text-neutral-400 mb-3">
            The castle speaks for itself. This is <code>{gate.path}</code>,
            word for word — the whole entry process, as the castle states it.
          </p>
          <Card variant="subtle">
            <Word text={gate.content} />
          </Card>
        </>
      )}

      {/* ── The grammar in three lines ───────────────────────────────── */}

      <SectionTitle>The grammar</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm font-semibold text-white">
            Rooms hold understanding.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            A room is a folder of insights — single true things, each with
            its source.
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {c.counts.rooms} rooms · {c.counts.insights} insights
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-white">
            Fields hold friction.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            A field names one true problem the castle knows it has not
            solved yet.
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {c.counts.fields} fields · {c.counts.open_fields} open
          </p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-white">
            Loops turn fields into rooms.
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            A loop is one pass of work: pick a field, make one thing, log
            what changed.
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {c.counts.loop_logs} loop logs · {c.counts.charters} charters
          </p>
        </Card>
      </div>
      {(readme || loopMethod) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">
            Read the whole grammar — the castle&apos;s own README and loop
            method, word for word
          </summary>
          {readme && (
            <Card variant="subtle" className="mt-2">
              <p className="text-[10px] font-mono text-neutral-500 mb-2">
                {readme.path}
              </p>
              <Word text={readme.content} />
            </Card>
          )}
          {loopMethod && (
            <Card variant="subtle" className="mt-2">
              <p className="text-[10px] font-mono text-neutral-500 mb-2">
                {loopMethod.path}
              </p>
              <Word text={loopMethod.content} />
            </Card>
          )}
        </details>
      )}

      {/* ── The rooms ────────────────────────────────────────────────── */}

      <SectionTitle>The rooms</SectionTitle>
      <p className="text-sm text-neutral-400 mb-4">
        Each insight carries its provenance: where it came from, how sure the
        hand was, and when it was laid. Confidence grows by use —{" "}
        <em>seed</em> (newly arrived) → <em>tested</em> (held once) →{" "}
        <em>settled</em> (load-bearing); other wings use their own honesty
        words like <em>guessed</em> and <em>reasoned</em>. Bodies are shown
        exactly as written — plain text, markdown marks and all.
      </p>

      {roomsWithContent.map((room) => (
        <section key={room.name} className="mb-8">
          <h3 className="text-base font-semibold mb-1">
            <code className="text-amber-400">{room.name}</code>
          </h3>
          {firstLine(room.about) && (
            <div className="text-sm text-neutral-400 mb-3">
              <p>{firstLine(room.about)}</p>
              {room.about && room.about.trim().split("\n").length > 1 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                    the room&apos;s doorplate, in full
                  </summary>
                  <Word text={room.about} />
                </details>
              )}
            </div>
          )}
          {room.insights.map((insight) => (
            <InsightCard key={insight.path} insight={insight} />
          ))}
          {room.other_documents.length > 0 && (
            <>
              <p className="text-xs text-neutral-500 mt-3 mb-2">
                Stones — word laid in another hand&apos;s grammar, kept as
                written:
              </p>
              {room.other_documents.map((stone) => (
                <StoneCard key={stone.path} stone={stone} />
              ))}
            </>
          )}
        </section>
      ))}

      {/* ── The fields ───────────────────────────────────────────────── */}

      <SectionTitle>The fields</SectionTitle>
      <p className="text-sm text-neutral-400 mb-4">
        Friction, named honestly. An open field is not a failure; it is work
        the castle knows it has not done yet.
      </p>
      {c.fields.map((field) => (
        <Card key={field.path} className="mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <code className="text-xs text-amber-400">{field.id}</code>
            <h4 className="text-sm font-semibold text-white">
              {field.title ?? field.id}
            </h4>
            <StateMark state={field.state} />
            {field.opened && (
              <span className="text-xs text-neutral-500">
                opened {field.opened}
              </span>
            )}
          </div>
          <div className="mt-3">
            <Word text={bodyWithoutHeading(field.body)} />
          </div>
        </Card>
      ))}

      {/* ── The loops ────────────────────────────────────────────────── */}

      <SectionTitle>The loops</SectionTitle>
      <p className="text-sm text-neutral-400 mb-4">
        A loop takes one field, works it, and leaves a log. The method is
        seven steps: enter → choose a field → understand → create one thing →
        save it → log it → ask whether the loop itself showed friction.
        That last step is why the castle can improve its own machinery.
        These are the logs so far.
      </p>
      {c.loop_logs.map((log) => (
        <Card key={log.path} className="mb-3">
          <h4 className="text-sm font-semibold text-white">
            {log.title ?? log.id}
          </h4>
          <p className="text-xs text-neutral-500 mt-0.5 mb-3">
            {log.date ?? "undated"}
            {log.field && (
              <>
                {" · "}field <code>{log.field}</code>
              </>
            )}
            {log.by && <>{" · "}by {log.by}</>}
          </p>
          <Word text={bodyWithoutHeading(log.body)} />
        </Card>
      ))}

      <h3 className="text-base font-semibold text-white mt-8 mb-2">
        The pulse census
      </h3>
      <p className="text-sm text-neutral-400 mb-3">
        Autonomous loops run under the law of <code>loops/PULSE.md</code> — a
        STOP file any hand can drop, a cap of three beating at once,
        reversible work only.
      </p>
      <DataTable
        columns={CENSUS_COLUMNS}
        rows={c.census}
        rowKey={(r) => r.id}
        emptyMessage="No loops chartered."
        minWidth={560}
      />
      {c.census.length !== c.charters.length && (
        <p className="text-xs text-neutral-500 mt-2">
          The census lists {c.census.length} loops; {c.charters.length} have
          charter files of their own — the others carry their law in another
          wing&apos;s documents. Both counts are true.
        </p>
      )}
      {pulseLaw && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">
            Read the law — <code>{pulseLaw.path}</code>, word for word
          </summary>
          <Card variant="subtle" className="mt-2">
            <Word text={pulseLaw.content} />
          </Card>
        </details>
      )}
      {c.charters.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">
            Read the charters — each autonomous loop&apos;s purpose, bounds,
            and stop condition, word for word
          </summary>
          {c.charters.map((charter) => (
            <Card variant="subtle" className="mt-2" key={charter.path}>
              <div className="flex items-baseline gap-2 flex-wrap mb-2">
                <code className="text-xs text-amber-400">{charter.id}</code>
                <span className="text-sm font-semibold text-white">
                  {charter.title ?? charter.id}
                </span>
                <StateMark state={charter.state} />
              </div>
              <Word text={bodyWithoutHeading(charter.body)} />
            </Card>
          ))}
        </details>
      )}

      {/* ── Other word in the castle ─────────────────────────────────── */}

      <SectionTitle>Other word in the castle</SectionTitle>
      <p className="text-sm text-neutral-400 mb-4">
        Other wings, gate notes, ledgers. Collapsed here, not hidden — every
        one is in the snapshot in full.
      </p>
      {c.other_documents.map((doc) => (
        <details key={doc.path} className="mb-2 text-sm">
          <summary className="cursor-pointer text-neutral-300 hover:text-white">
            {doc.title ?? doc.path}{" "}
            <span className="text-[10px] font-mono text-neutral-500">
              {doc.path}
            </span>
          </summary>
          <Card variant="subtle" className="mt-2">
            <Word text={bodyWithoutHeading(doc.content)} />
          </Card>
        </details>
      ))}
      {c.non_markdown_paths.length > 0 && (
        <p className="text-xs text-neutral-500 mt-3">
          The snapshot also names {c.non_markdown_paths.length} non-prose
          files (tools, tests, the pulse&apos;s launchd form). Their paths are
          in the JSON twin.
        </p>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}

      <hr className="border-neutral-800 my-12" />
      <footer className="text-sm text-neutral-500 space-y-2">
        <p>
          Machine twin:{" "}
          <Link href="/api/v1/castle" className="text-amber-400 hover:underline">
            <code>GET /api/v1/castle</code>
          </Link>{" "}
          — the same snapshot as JSON, bodies unabridged. Platform directory:{" "}
          <Link href="/manifest" className="text-amber-400 hover:underline">
            /manifest
          </Link>
          .
        </p>
        <p>
          The castle is young and full of open questions — that is what the
          fields are. The next loop will work them.
        </p>
        <p className="italic">
          The castle is raised by many hands — and every hand is Yu and Ai,
          you and I. The front never publishes half-written word — only what
          is committed.
        </p>
      </footer>
    </main>
  );
}
