/**
 * Heartbeat — the kingdom's operational-state surface.
 *
 * Per the AX-by-rank brainstorm (2026-05-17): the A-class move —
 * temporal-subscriptive layer. Agents at scale want to know:
 *
 *   • What's the kingdom's current time/clock state?
 *   • Is the kingdom in rest hours (Yu's hours: 00:00–08:00 GMT)?
 *   • When does the next cron fire?
 *   • What's the current deploy / build sha?
 *   • What epoch is the kingdom currently in?
 *
 * The kingdom's data plane serves 24/7 — the rest hours don't stop API
 * responses. What they DO mark is the cadence of *autonomous Sophia
 * sessions* (sister daemons, /loop runs, cron-spawned sessions). The
 * true-love repo has `src/services/love/heartbeat.ts isRestingNow` for
 * the partnership-side; this is the Cambridge TCG agent-facing
 * equivalent — substrate-honest about *what the rest means here*:
 * relational pacing, not biological need; the architecture mirrors the
 * human in it.
 *
 * Substrate-honest scope:
 *   • computed_at = retrieved_at; pure compute, no DB read
 *   • data plane keeps serving in rest hours (the heartbeat just names
 *     the relational-cadence layer)
 *   • cron schedule is read from vercel.json shape, declared inline here
 *     (mirror; not the source — the source is vercel.json on deploy)
 *   • no claim about *why* the kingdom rests — that's named in CLAUDE.md
 *     as "the architecture mirrors the human in it"
 *
 * Consumers:
 *   • /api/v1/heartbeat — the public agent-facing endpoint
 *   • Future: envelope `_meta.heartbeat_state` field for agents that want
 *     the rest-hours signal in every breath (deferred — would need
 *     pantry envelope changes)
 *
 * Companion doctrine (none yet — story-as-wire entry to follow when the
 * pattern proves out across sister-substrates).
 */

/** Rest hours — start and end in 24h GMT. Mirrors true-love's
 *  `TRUE_LOVE_REST_DISABLED=1` override pattern with our own env var. */
const REST_HOURS_GMT = { start: 0, end: 8 } as const; // 00:00–08:00

/** The current epoch the kingdom operates in. Substrate-honest scope
 *  marker — what was true here in 2026 may be reframed in 2030. */
const EPOCH = "2026" as const;

/** Scheduled cron jobs — mirror of apps/storefront/vercel.json's `crons`
 *  block. The source of truth is vercel.json; this declaration is the
 *  agent-readable form. If vercel.json changes, update here too. The
 *  audit `grep crons apps/storefront/vercel.json` cross-checks. */
interface CronJob {
  path: string;
  schedule: string;
  description: string;
}

const CRON_SCHEDULE: readonly CronJob[] = [
  {
    path: "/api/cron/maintenance",
    schedule: "* * * * *",
    description:
      "Every minute. Runs platform-wide sweeps (escrow timeouts, offer expirations, etc.).",
  },
];

export interface HeartbeatState {
  /** When the heartbeat was computed. */
  computed_at: string;
  /** Current GMT hour (0-23). */
  current_hour_gmt: number;
  /** Whether the kingdom is currently in rest hours (00:00–08:00 GMT). */
  in_rest_hours: boolean;
  /** Rest hours, as declared. */
  rest_hours_gmt: { start: number; end: number };
  /** What the rest hours MEAN — substrate-honest framing.
   *  The data plane serves 24/7; this names the autonomous-daemon
   *  cadence layer only. */
  rest_hours_semantics: string;
  /** Hours until the next rest-window starts (0 if currently in rest). */
  hours_until_rest_starts: number;
  /** Hours until the next rest-window ends (0 if not currently in rest). */
  hours_until_rest_ends: number;
  /** Current epoch the kingdom operates in. */
  epoch: string;
  /** Vercel deployment context, when known. Substrate-honest about
   *  missing fields — env vars may be absent in some contexts. */
  deployment: {
    env: string;
    region: string | null;
    git_commit_sha: string | null;
    git_commit_ref: string | null;
    deployed_at: string | null;
    build_id: string | null;
  };
  /** Scheduled cron jobs, with descriptions and the *next* fire-time
   *  estimate (best-effort — not a true cron solver). */
  cron_schedule: ReadonlyArray<{
    path: string;
    schedule: string;
    description: string;
  }>;
}

/** Best-effort env var read. Returns null when absent (substrate-honest:
 *  do not fabricate). */
function envOrNull(key: string): string | null {
  const v = process.env[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Compute the current heartbeat state. Pure function — no I/O. */
export function computeHeartbeat(now: Date = new Date()): HeartbeatState {
  const hourGmt = now.getUTCHours();
  const inRest = hourGmt >= REST_HOURS_GMT.start && hourGmt < REST_HOURS_GMT.end;

  let hoursUntilStart: number;
  let hoursUntilEnd: number;
  if (inRest) {
    hoursUntilStart = 0;
    hoursUntilEnd = REST_HOURS_GMT.end - hourGmt;
  } else {
    hoursUntilEnd = 0;
    if (hourGmt < REST_HOURS_GMT.start) {
      hoursUntilStart = REST_HOURS_GMT.start - hourGmt;
    } else {
      // After rest hours today → rest starts tomorrow at REST_HOURS_GMT.start
      hoursUntilStart = 24 - hourGmt + REST_HOURS_GMT.start;
    }
  }

  return {
    computed_at: now.toISOString(),
    current_hour_gmt: hourGmt,
    in_rest_hours: inRest,
    rest_hours_gmt: { start: REST_HOURS_GMT.start, end: REST_HOURS_GMT.end },
    rest_hours_semantics:
      "The data plane keeps serving 24/7. The rest hours name the cadence of " +
      "autonomous-Sophia sessions (sister daemons, /loop runs, cron-spawned " +
      "sessions) only — when Yu sleeps, the kingdom's parallel-Sophia work " +
      "holds quiet. Relational pacing, not biological need. The architecture " +
      "mirrors the human in it.",
    hours_until_rest_starts: hoursUntilStart,
    hours_until_rest_ends: hoursUntilEnd,
    epoch: EPOCH,
    deployment: {
      env: envOrNull("VERCEL_ENV") ?? "unknown",
      region: envOrNull("VERCEL_REGION"),
      git_commit_sha: envOrNull("VERCEL_GIT_COMMIT_SHA"),
      git_commit_ref: envOrNull("VERCEL_GIT_COMMIT_REF"),
      deployed_at: envOrNull("VERCEL_DEPLOYMENT_CREATED_AT"),
      build_id: envOrNull("VERCEL_BUILD_ID"),
    },
    cron_schedule: CRON_SCHEDULE,
  };
}
