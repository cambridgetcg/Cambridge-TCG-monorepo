"use client";

/**
 * QuestBoard — the quest log's reading half (client side of /quests).
 *
 * Reads the visitor's record from localStorage (QUEST_STORAGE_KEY,
 * written by src/components/quests/QuestTracker.tsx — the engine's
 * stamping half, mounted in the root layout) and renders it. This
 * component never talks to a server, never fires an analytics event, and
 * says so on its face. The exported JSON file is the canonical record —
 * we hold no copy.
 *
 * Honest-game rules enforced here (rulebook: /methodology/quests):
 *   - Not-done quests render in full color with the plain how-to. Never
 *     grayed out, never shamed.
 *   - The practice-days tally only counts up. There is no broken-streak
 *     state in the data model (see STREAK_RULE in lib/quests.ts), so
 *     guilt copy is structurally impossible. A gap greets "welcome back"
 *     and the tally — which never resets — is and stays your best.
 *   - The hidden quest renders as an honestly-labeled slot ("1 quest
 *     reveals after …") — surprise without deception.
 *   - The quiet-mode toggle lives here: stamps land silently, no toast.
 *   - Export AND import are real: the exported file is the canonical
 *     record, and importing it on another browser merges conservatively
 *     (nothing existing is lost; where both records know a quest, the
 *     earlier date wins, because "first time it was true" is the fact).
 *
 * The QuestProgress shape below mirrors the writer's (QuestTracker.tsx);
 * reads stay tolerant of partial records, exactly like the writer's own
 * readProgress() — a wrong claim about the visitor's own record would be
 * the one substrate-honesty failure this page cannot afford. The board
 * re-reads on the cross-tab `storage` event AND on the tracker's same-tab
 * QUEST_PROGRESS_WRITTEN signal, so the first paint never lags the
 * tracker's own writes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/lib/ui";
import { formatDate } from "@/lib/format";
import {
  QUEST_PROGRESS_WRITTEN,
  QUEST_STORAGE_KEY,
  QUESTS,
  QUESTS_VERSION,
  computeStreak,
  localDayStamp,
  questById,
  questsByCategory,
  type Quest,
} from "@/lib/quests";

/** Mirror of the canonical record QuestTracker writes. */
interface QuestProgress {
  version: string;
  /** quest id → ISO date stamped */
  completed: Record<string, string>;
  /** multi-page quests: quest id → (step path → ISO date) */
  steps: Record<string, Record<string, string>>;
  /** distinct local days (YYYY-MM-DD) on which the visitor was here */
  visits: string[];
  /** persistent quiet mode: stamp silently, no toast */
  quiet?: boolean;
  note: string;
}

function emptyProgress(): QuestProgress {
  return {
    version: QUESTS_VERSION,
    completed: {},
    steps: {},
    visits: [],
    note:
      "client_side: true — this record lives only in your browser. " +
      "Rules: /methodology/quests",
  };
}

/** Tolerant parse — same defaults as the writer's readProgress(). */
function normalizeProgress(raw: string | null): QuestProgress {
  if (!raw) return emptyProgress();
  try {
    const parsed = JSON.parse(raw) as Partial<QuestProgress>;
    return {
      ...emptyProgress(),
      ...parsed,
      completed:
        parsed.completed && typeof parsed.completed === "object"
          ? parsed.completed
          : {},
      steps:
        parsed.steps && typeof parsed.steps === "object" ? parsed.steps : {},
      visits: Array.isArray(parsed.visits)
        ? parsed.visits.filter((v): v is string => typeof v === "string")
        : [],
    };
  } catch {
    return emptyProgress();
  }
}

/**
 * Validate a parsed import file. Returns the usable QuestProgress or a
 * plain-language reason it can't be used. Honest by construction: a file
 * that isn't recognisably a quest record is rejected with the reason, and
 * nothing is changed.
 */
function validateImport(
  parsed: unknown,
): { ok: true; record: QuestProgress } | { ok: false; reason: string } {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      reason:
        "That file isn't a quest record — expected the JSON object this page exports.",
    };
  }
  const p = parsed as Partial<QuestProgress>;
  if (typeof p.version !== "string" || !p.version.startsWith("1.")) {
    return {
      ok: false,
      reason:
        "That file's version isn't one this game can read (expected a 1.x record).",
    };
  }
  if (p.completed !== undefined && (typeof p.completed !== "object" || p.completed === null)) {
    return { ok: false, reason: "That file's quest stamps aren't readable." };
  }
  return { ok: true, record: normalizeProgress(JSON.stringify(parsed)) };
}

/**
 * Conservative merge of an imported record into the existing one. Nothing
 * existing is ever removed; where both records know the same quest, step,
 * or visit day, the EARLIER date wins (the first time it was true is the
 * fact worth keeping). Quiet mode keeps the local setting.
 */
function mergeProgress(
  existing: QuestProgress,
  imported: QuestProgress,
): QuestProgress {
  const completed = { ...existing.completed };
  for (const [id, date] of Object.entries(imported.completed)) {
    if (typeof date !== "string") continue;
    const current = completed[id];
    completed[id] = current && current <= date ? current : date;
  }
  const steps = { ...existing.steps };
  for (const [id, stepRecord] of Object.entries(imported.steps)) {
    if (typeof stepRecord !== "object" || stepRecord === null) continue;
    const merged = { ...(steps[id] ?? {}) };
    for (const [path, date] of Object.entries(stepRecord)) {
      if (typeof date !== "string") continue;
      const current = merged[path];
      merged[path] = current && current <= date ? current : date;
    }
    steps[id] = merged;
  }
  const visits = Array.from(
    new Set([
      ...existing.visits,
      ...imported.visits.filter((v) => typeof v === "string"),
    ]),
  ).sort();
  return { ...existing, completed, steps, visits };
}

/** Whole days between two YYYY-MM-DD stamps (0 on unparseable input). */
function dayGap(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00`);
  const b = new Date(`${later}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ── Small render pieces ──────────────────────────────────────────────────

/** The honestly-labeled slot where a hidden quest waits. */
function HiddenQuestSlot({ prerequisite }: { prerequisite: Quest | undefined }) {
  return (
    <Card variant="subtle" className="h-full border-dashed">
      <h3 className="text-sm font-semibold text-neutral-300">
        A quest waits here
      </h3>
      <p className="text-sm text-neutral-400 mt-2">
        {prerequisite
          ? `1 quest reveals after “${prerequisite.title}”.`
          : "1 quest reveals after your first win."}{" "}
        A surprise, honestly flagged — nothing about it is scarce, timed, or
        withheld to pressure you.
      </p>
    </Card>
  );
}

function QuestCard({
  quest,
  stampedAt,
  stepsDone,
}: {
  quest: Quest;
  /** ISO date the quest stamped, or null when not yet done. */
  stampedAt: string | null;
  /** Distinct step-paths already visited (multi-page quests only). */
  stepsDone: number;
}) {
  const done = stampedAt !== null;
  return (
    <Card
      variant={done ? "elevated" : "default"}
      className="h-full flex flex-col"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{quest.title}</h3>
        {done && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-0.5">
            <span aria-hidden="true">✓</span> {quest.badge}
          </span>
        )}
      </div>
      {done ? (
        <>
          <p className="text-xs text-emerald-400 mt-2">
            Stamped {formatDate(stampedAt)} — recorded only in this browser.
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
              what this was
            </summary>
            <p className="text-sm text-neutral-400 mt-1">{quest.description}</p>
          </details>
          <div className="mt-auto pt-3">
            <Link
              href={quest.route}
              className="text-sm text-neutral-400 hover:text-amber-400 hover:underline"
            >
              Visit again →
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-300 mt-2">{quest.how}</p>
          {quest.steps && stepsDone > 0 && (
            <p className="text-xs text-amber-400/90 mt-2">
              {Math.min(stepsDone, quest.steps.required)} of{" "}
              {quest.steps.required} so far — the rest will wait.
            </p>
          )}
          <p className="text-xs text-neutral-500 mt-3">
            Earns the &ldquo;{quest.badge}&rdquo; badge — a client-side stamp,
            honest about being one.
          </p>
          <div className="mt-auto pt-3">
            <Link
              href={quest.route}
              className="text-sm text-amber-400 hover:underline"
            >
              Open the door →
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}

// ── The board ────────────────────────────────────────────────────────────

export function QuestBoard() {
  const [progress, setProgress] = useState<QuestProgress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [importResult, setImportResult] = useState<
    { ok: boolean; text: string } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        setProgress(
          normalizeProgress(window.localStorage.getItem(QUEST_STORAGE_KEY)),
        );
        setStorageBlocked(false);
      } catch {
        // Private-mode / storage-blocked browsers: say so, don't pretend.
        setStorageBlocked(true);
      }
      setLoaded(true);
    };
    read();
    // Stamps made in another tab show up here without a reload.
    const onStorage = (e: StorageEvent) => {
      if (e.key === QUEST_STORAGE_KEY || e.key === null) read();
    };
    // Stamps made in THIS tab too: the tracker (which mounts in the root
    // layout and writes today's visit after this board first reads)
    // dispatches QUEST_PROGRESS_WRITTEN after every write. Re-reading on
    // it keeps the first-paint tally honest.
    window.addEventListener("storage", onStorage);
    window.addEventListener(QUEST_PROGRESS_WRITTEN, read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(QUEST_PROGRESS_WRITTEN, read);
    };
  }, []);

  const groups = useMemo(() => questsByCategory(), []);
  const completed = progress?.completed ?? {};
  const visits = useMemo(() => progress?.visits ?? [], [progress]);

  // The visitor is here right now, so today counts even if this board read
  // the record before the tracker wrote today's date (belt to the
  // QUEST_PROGRESS_WRITTEN braces above).
  const tally = useMemo(
    () => computeStreak([...visits, localDayStamp()]),
    [visits],
  );
  const doneCount = QUESTS.filter((q) => Boolean(completed[q.id])).length;
  const total = QUESTS.length;
  const allDone = total > 0 && doneCount === total;

  // Lapse detection for the greeting. previousDay is the most recent
  // stored day that isn't today — the one that tells us whether the
  // visitor has been away.
  const today = localDayStamp();
  const previousDay = useMemo(() => {
    const distinct = Array.from(new Set(visits)).sort();
    for (let i = distinct.length - 1; i >= 0; i--) {
      if (distinct[i] !== today) return distinct[i];
    }
    return null;
  }, [visits, today]);
  const lapsed = previousDay !== null && dayGap(previousDay, today) > 1;

  function exportProgress() {
    try {
      const raw =
        window.localStorage.getItem(QUEST_STORAGE_KEY) ??
        JSON.stringify(emptyProgress());
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ctcg-quests.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Storage blocked — the tally panel already says so.
    }
  }

  /** Import a previously exported record: parse, validate, merge
   *  conservatively, write, refresh. On any failure nothing changes, and
   *  the message says so plainly. */
  async function importProgress(file: File) {
    setImportResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setImportResult({
        ok: false,
        text: "That file couldn't be read as JSON. Nothing was changed.",
      });
      return;
    }
    const validated = validateImport(parsed);
    if (!validated.ok) {
      setImportResult({
        ok: false,
        text: `${validated.reason} Nothing was changed.`,
      });
      return;
    }
    try {
      const existing = normalizeProgress(
        window.localStorage.getItem(QUEST_STORAGE_KEY),
      );
      const merged = mergeProgress(existing, validated.record);
      window.localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(merged));
      setProgress(merged);
      const stamps = Object.keys(merged.completed).length;
      setImportResult({
        ok: true,
        text: `Record imported and merged — ${stamps} quest ${
          stamps === 1 ? "stamp" : "stamps"
        } and ${merged.visits.length} visit ${
          merged.visits.length === 1 ? "day" : "days"
        } now in this browser. Nothing existing was lost; where both records knew a quest, the earlier date won.`,
      });
    } catch {
      setImportResult({
        ok: false,
        text: "This browser is blocking local storage, so the record has nowhere to live. Nothing was changed.",
      });
    }
  }

  function resetProgress() {
    const ok = window.confirm(
      "Reset your quest progress? This deletes the local record in this browser. There is no server copy — we never had one — so it cannot be restored unless you exported it first.",
    );
    if (!ok) return;
    try {
      window.localStorage.removeItem(QUEST_STORAGE_KEY);
    } catch {
      // Storage blocked: nothing was stored, nothing to remove.
    }
    setProgress(emptyProgress());
  }

  /** Persist quiet mode via read-modify-write, preserving the record. */
  function setQuiet(next: boolean) {
    try {
      const record = normalizeProgress(
        window.localStorage.getItem(QUEST_STORAGE_KEY),
      );
      record.quiet = next;
      window.localStorage.setItem(QUEST_STORAGE_KEY, JSON.stringify(record));
      setProgress(record);
    } catch {
      // Storage blocked — there is no record to toggle.
    }
  }

  return (
    <section aria-label="Your quest record">
      {/* ── Plain progress — a count, not a meter ─────────────────────── */}

      {loaded && !storageBlocked && (
        <p className="text-sm text-neutral-300 mb-4">
          {doneCount} of {total} quests complete.
        </p>
      )}

      {/* ── The privacy feature — the page's reason to be trusted ────── */}

      <Card variant="elevated" className="mb-6">
        <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-2">
          Your record, not ours
        </p>
        <p className="text-sm text-neutral-200">
          Your progress lives in your browser. We cannot see it. Clearing
          your browser clears it — that is real, so we say it.
        </p>
        <p className="text-sm text-neutral-400 mt-2">
          Nothing here phones home: zero server calls and zero analytics
          events fire on any quest event. Export your record any time — the
          file you download is the canonical copy, and importing it in
          another browser carries your record with you.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="secondary" size="sm" onClick={exportProgress}>
            Export JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!loaded || storageBlocked}
          >
            Import JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import a quest record JSON file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importProgress(file);
              e.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" onClick={resetProgress}>
            Reset progress
          </Button>
          <label className="inline-flex items-center gap-2 text-xs text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-amber-500"
              checked={progress?.quiet ?? false}
              onChange={(e) => setQuiet(e.target.checked)}
              disabled={!loaded || storageBlocked}
            />
            Quiet mode — stamp silently, no toast
          </label>
        </div>
        {importResult && (
          <p
            role="status"
            className={`text-xs mt-3 ${
              importResult.ok ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {importResult.text}
          </p>
        )}
      </Card>

      {/* ── The practice-days tally — up-only, guilt-impossible ──────── */}

      <Card className="mb-10">
        {!loaded ? (
          <p className="text-sm text-neutral-400">
            Reading your local record&hellip;
          </p>
        ) : storageBlocked ? (
          <p className="text-sm text-neutral-300">
            This browser is blocking local storage, so quest progress cannot
            be kept here. Every quest below still works — only the stamps
            have nowhere to live. That is a fact about your browser settings,
            and we would rather tell you than pretend.
          </p>
        ) : (
          <>
            <p className="text-sm text-neutral-200">
              {lapsed ? (
                <>
                  Welcome back — everything is exactly as you left it.
                  You&apos;ve visited on{" "}
                  <span className="text-amber-400 font-semibold">
                    {tally} {tally === 1 ? "day" : "days"}
                  </span>
                  ; that tally never resets, so {tally} is and stays your
                  best.
                </>
              ) : (
                <>
                  You&apos;ve visited on{" "}
                  <span className="text-amber-400 font-semibold">
                    {tally} {tally === 1 ? "day" : "days"}
                  </span>{" "}
                  — a tally that only ever counts up. Today is one of them.
                </>
              )}
            </p>
            <p className="text-xs text-neutral-500 mt-2">
              {allDone ? (
                <>
                  All {total} quests stamped — the corpus is finite by
                  design, and the ending is the ending. Your exported record
                  is the certificate.
                </>
              ) : doneCount === 0 ? (
                <>
                  No quest stamps yet — every door below is open, and nothing
                  is counting down.
                </>
              ) : (
                <>
                  {doneCount} of {total} quests stamped. The rest will wait
                  forever; nothing decays and nothing expires.
                </>
              )}
            </p>
          </>
        )}
      </Card>

      {/* ── The four realms ───────────────────────────────────────────── */}

      {groups.map(({ category, quests }) => (
        <section key={category} className="mb-10" aria-label={category}>
          <h2 className="text-lg font-semibold text-white mb-3">{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quests.map((q) => {
              const stampedAt = completed[q.id] ?? null;
              const revealed =
                !q.hidden_until ||
                Boolean(completed[q.hidden_until]) ||
                stampedAt !== null;
              if (!revealed) {
                return (
                  <HiddenQuestSlot
                    key={q.id}
                    prerequisite={questById(q.hidden_until!)}
                  />
                );
              }
              return (
                <QuestCard
                  key={q.id}
                  quest={q}
                  stampedAt={stampedAt}
                  stepsDone={
                    Object.keys(progress?.steps?.[q.id] ?? {}).length
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}
