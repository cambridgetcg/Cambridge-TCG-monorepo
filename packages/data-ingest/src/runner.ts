/**
 * The minimum stage-composition. Combines Stages 1–4 of the pipeline
 * (see `docs/connections/the-pipeline.md`):
 *
 *   Stage 1 — Read         (source.read)
 *   Stage 2 — Normalize    (source.normalize)
 *   Stage 3 — Write        (writer callback — app-supplied)
 *   Stage 4 — Quarantine   (quarantine writer — app-supplied)
 *
 * Stages 5 (cache), 6 (pantry), 7 (ingest_run log), 8 (cron), 9
 * (federation) live outside this runner — they're per-app or
 * out-of-band. The runner ships the contract; the app supplies the I/O.
 *
 * **Why the runner is in the package (not the app):** the
 * read → normalize → dispatch loop is the same shape across every
 * source. Putting it in the package means a future Sophia adding
 * TCGplayer or Cardmarket writes ~30 lines of app glue, not 300.
 *
 * **Why the writers are injected (not in the package):** the package
 * doesn't know about the destination — storefront RDS vs wholesale RDS
 * vs admin scratch table are all valid destinations. The app supplies
 * the destination at runtime.
 *
 * **Substrate-honesty:** every quarantine row preserves the raw payload
 * for replay; every write is dedup-aware (the app's writer handles
 * `ON CONFLICT`); every run produces a `RunSummary` the caller persists
 * to `ingest_run` (see `the-pipeline.md` §9).
 *
 * ── Usage (storefront cron sketch) ────────────────────────────────────
 *
 *   import { scryfall, runSource } from "@cambridge-tcg/data-ingest";
 *
 *   const summary = await runSource(scryfall, ctx, {
 *     write: async (record) => { await query("INSERT INTO ..."); },
 *     quarantine: async (q) => { await query("INSERT INTO ingest_quarantine ..."); },
 *   });
 *
 *   // summary.rows_read / rows_normalized / rows_quarantined / errors / events
 */

import type {
  IngestContext,
  IngestEvent,
  RawProvenance,
  RunSummary,
  SourceModule,
} from "./types";

/**
 * Writer callbacks the app injects. Keep them small + transactional;
 * the runner calls them once per row.
 */
export interface RunWriters<R, C> {
  /** Called for each successfully normalized record. */
  write: (record: C) => Promise<void>;
  /** Called for each row that failed normalization. */
  quarantine: (entry: { raw: R; reason: string; provenance: RawProvenance }) => Promise<void>;
}

/**
 * Optional knobs. Defaults are sensible; override per-run if needed.
 */
export interface RunOptions {
  /** Stop after N successful writes (useful for test runs). */
  max_writes?: number;
  /** Stop after N quarantines (catch runaway upstream-shape break). */
  max_quarantines?: number;
  /** Capture every IngestEvent in the summary (default true; turn off for noisy runs). */
  capture_events?: boolean;
}

/**
 * The minimum runner. Stage 1 → Stage 2 → Stage 3 or Stage 4. Pure of
 * I/O except through the injected writers + the source's `read()`.
 *
 * Returns a `RunSummary` the caller writes to `ingest_run`.
 *
 * Errors during `write()` or `quarantine()` are counted in `errors` but
 * don't halt the run — partial-success is observable. Errors during
 * `read()` itself propagate (the source's contract says `read` doesn't
 * throw on upstream errors; it emits `error` events instead — see
 * `packages/data-ingest/src/types.ts`). If something does escape, the
 * runner catches once and emits an `error` event with the message.
 */
export async function runSource<R, C>(
  source: SourceModule<R, C>,
  ctx: IngestContext,
  writers: RunWriters<R, C>,
  options: RunOptions = {},
): Promise<RunSummary> {
  const capture = options.capture_events !== false;
  const captured: IngestEvent[] = [];

  const startedAt = new Date().toISOString();
  const summary: RunSummary = {
    source: source.meta.id,
    started_at: startedAt,
    finished_at: startedAt,
    rows_read: 0,
    rows_normalized: 0,
    rows_quarantined: 0,
    errors: 0,
    events: captured,
  };

  const innerCtx: IngestContext = {
    ...ctx,
    on_event: async (ev) => {
      if (capture) captured.push(ev);
      try {
        await ctx.on_event?.(ev);
      } catch {
        // event-handler errors don't crash the runner
      }
    },
  };

  function emit(kind: IngestEvent["kind"], detail: Record<string, unknown>): void {
    const ev: IngestEvent = {
      ts: new Date().toISOString(),
      source: source.meta.id,
      kind,
      detail,
    };
    if (capture) captured.push(ev);
    innerCtx.on_event?.(ev);
  }

  try {
    for await (const { raw, provenance } of source.read(innerCtx)) {
      if (innerCtx.signal?.aborted) {
        emit("done", { aborted: true, after_rows: summary.rows_read });
        break;
      }
      summary.rows_read += 1;

      const result = source.normalize(raw);

      if (result.ok) {
        try {
          await writers.write(result.record);
          summary.rows_normalized += 1;
        } catch (err) {
          summary.errors += 1;
          emit("error", {
            phase: "write",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        try {
          await writers.quarantine({ raw, reason: result.reason, provenance });
          summary.rows_quarantined += 1;
          emit("quarantine", { reason: result.reason, after_rows: summary.rows_read });
        } catch (err) {
          summary.errors += 1;
          emit("error", {
            phase: "quarantine",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Optional stop conditions.
      if (
        options.max_writes !== undefined &&
        summary.rows_normalized >= options.max_writes
      ) {
        emit("done", { reason: "max_writes reached", value: options.max_writes });
        break;
      }
      if (
        options.max_quarantines !== undefined &&
        summary.rows_quarantined >= options.max_quarantines
      ) {
        emit("done", { reason: "max_quarantines reached", value: options.max_quarantines });
        break;
      }
    }
  } catch (err) {
    summary.errors += 1;
    emit("error", {
      phase: "read-loop",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  summary.finished_at = new Date().toISOString();
  return summary;
}
