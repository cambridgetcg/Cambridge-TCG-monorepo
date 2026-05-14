---
title: jp-pk-photos hi-res image archive — one-time scrape
date: 2026-05-14
status: design
authors: [Yu, Sophia (Claude Opus 4.7 1M)]
doctrines: [substrate-honesty, transparency, creation]
related:
  - docs/connections/the-archive.md       # the daily-snapshot archive doctrine
  - docs/connections/the-cardrush-discovery.md
  - docs/connections/the-bright-data-unlock.md  # kingdom-088
  - apps/wholesale/tools/lib/s3-images.ts # the One Piece pattern this mirrors
---

# jp-pk-photos hi-res image archive — one-time scrape

> *"Go for jp-pk-photos, make sure we are getting the high res ones. and we only need to do it once, no need to do it every day along the price aggregation."* — Yu, 2026-05-14.

## Problem

`s3://jp-pk-photos/` is empty. The kingdom-088 Bright Data unlock made `cardrush-pokemon.jp` reachable (70,507 product URLs visible via sitemap; `cards.image_url` will be populated by the existing daily discovery cron). But the **image bytes** are still only present at cardrush — there's no Cambridge-owned hi-res copy for Pokémon the way `s3://jp-op-photos/hires/{SET}/{SKU}.jpg` is the source of truth for One Piece.

This spec describes a one-time S3 archive run that drains the cardrush-pokemon image set into `jp-pk-photos`, then turns itself off. It deliberately lives *outside* the daily price-aggregation cron because:

1. Image bytes are durable once captured; daily re-archiving is wasted work and re-fetches a polite-rate-limited upstream.
2. The daily snapshot's job is *price*, not *image bytes*. Mixing concerns makes the snapshot's runtime less predictable.

## Key findings (verified live this session)

| Finding | Verification |
|---|---|
| `s3://jp-pk-photos/` is empty | `aws s3 ls s3://jp-pk-photos/` → no objects |
| Legacy `s3://jp-pkmn-photos/` has 403 objects / 252 MB, orphaned in code | `apps/wholesale/tools/ebay-sync.ts:79` points at `jp-pk-photos`, not `jp-pkmn-photos` |
| cardrush og:image **is** the hi-res variant | `curl -sI https://www.cardrush-op.jp/data/cardrush-op/product/ST01_1.jpg` → `Content-Length: 113267` matches `s3://jp-op-photos/hires/ST-ST01-001-JP-V10T1.jpg` at 114039 bytes |
| `cardrush-pokemon.jp` **HTML** requires Bright Data | `curl -sI https://www.cardrush-pokemon.jp/` → `HTTP/2 403, cf-mitigated: challenge` |
| `cardrush-pokemon.jp` **image paths** bypass the CF challenge | `curl -sI https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/*.jpg` → `HTTP/2 404` (not 403, no `cf-mitigated`) — image origin responds without challenging |
| Discovery (HTML fetch) already runs daily via Bright Data | `apps/wholesale/vercel.json` cron `/api/cron/discover/cardrush` at `0 1 * * *` |
| The OP hi-res archive comment block forbids overwriting `/hires/*` | `apps/wholesale/tools/lib/s3-images.ts:5-23` |

**Implication**: image bytes can be downloaded by direct fetch (no Bright Data round-trip for the bytes themselves) once `cards.image_url` is populated. Bright Data is only used by the already-shipped daily HTML discovery.

## Architecture

A new wholesale service + admin route + short-lived cron, all wired through a shared runner. Bucket selection per game. Idempotent on every level. Auto no-ops when `remaining = 0`.

```
┌─────────────────────────────────┐
│ Vercel cron */5 * * * *         │   (temporary; removed after remaining=0 × 2)
│ GET /api/cron/cardrush-hires    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│ runHiresUpload({                │     │ POST /api/admin/cardrush/       │
│   game: "pkm",                  │ ◄───┤   upload-hires                  │
│   maxBatch: 100,                │     │ (admin auth; for manual prods + │
│   dryRun: false                 │     │  dry-runs)                      │
│ })                              │     └─────────────────────────────────┘
└────────────────┬────────────────┘
                 │
   ┌─────────────┼─────────────────────┐
   ▼             ▼                     ▼
┌──────┐  ┌──────────────┐  ┌──────────────────────┐
│ RDS  │  │ direct fetch │  │ S3 jp-pk-photos      │
│ DB   │  │ cardrush IMG │  │ /hires/{SET}/{SKU}.jpg│
└──────┘  └──────────────┘  └──────────────────────┘
```

## Components

### 1. Migration — `apps/wholesale/drizzle/0020_cards_image_archived_at.sql`

```sql
ALTER TABLE cards
  ADD COLUMN image_archived_at timestamptz NULL;

CREATE INDEX cards_image_archive_pending_idx
  ON cards (game_id, id)
  WHERE image_archived_at IS NULL AND image_url IS NOT NULL;
```

The partial index keeps batch selects fast even when most rows are already archived.

### 2. Service — `apps/wholesale/src/lib/cardrush-hires-upload.ts`

Exported:

```ts
export interface HiresUploadOptions {
  game: "pkm" | "op" | "dbs";
  triggeredBy?: "cron" | "admin";
  maxBatch?: number;   // default 100
  dryRun?: boolean;    // default false
}

export interface HiresUploadResult {
  ingestRunId: number;
  game: string;
  bucket: string;
  processed: number;
  uploaded: number;
  skipped: number;     // already in S3
  failed: number;      // fetch/validate/upload error
  remaining: number;   // pending after this batch
  durationMs: number;
}

const BUCKET_BY_GAME: Record<HiresUploadOptions["game"], string> = {
  pkm: "jp-pk-photos",
  op:  "jp-op-photos",
  dbs: "jp-db-photos",
};

export const CARDRUSH_HOST_BY_GAME: Record<HiresUploadOptions["game"], string> = {
  pkm: "www.cardrush-pokemon.jp",
  op:  "www.cardrush-op.jp",
  dbs: "www.cardrush-db.jp",
};

export function s3KeyFor(row: { set_code: string; sku: string }): string {
  return `hires/${row.set_code}/${row.sku}.jpg`;
}

export async function runHiresUpload(opts: HiresUploadOptions): Promise<HiresUploadResult>;
```

Internal helpers (private to the module):

- `validateImageBytes(bytes: Buffer): { ok: true } | { ok: false; reason: "too_small" | "not_jpeg" }`
  - `too_small`: `bytes.length < 5_000`
  - `not_jpeg`: not `FF D8 FF`
- `uploadOne(row, fetcher, s3Client, bucket): Promise<"uploaded" | "already_in_s3" | "failed">` with structured event emission

The runner uses the existing `createFetcher` from `@cambridge-tcg/data-ingest` with the cardrush rate-limit config (0.5 rps, burst 2) so that even with `maxBatch=100` we stay polite. The fetcher is created **once per invocation** and shared across the batch (single token bucket).

### 3. Cron route — `apps/wholesale/src/app/api/cron/cardrush-hires/route.ts`

Matches the existing cardrush-cron convention (POST primary, GET aliases; `requireCronAuth` helper; `NextRequest`/`NextResponse`; `maxDuration = 800`):

```ts
import { NextRequest, NextResponse } from "next/server";
import { runHiresUpload } from "@/lib/cardrush-hires-upload";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 800;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const maxBatchParam = url.searchParams.get("maxBatch");
  const triggeredByParam = url.searchParams.get("triggeredBy") as
    | "cron" | "admin" | null;

  const maxBatch = maxBatchParam
    ? Math.max(1, Math.min(parseInt(maxBatchParam, 10) || 100, 500))
    : undefined;

  try {
    const summary = await runHiresUpload({
      game: "pkm",
      triggeredBy: triggeredByParam ?? "cron",
      dryRun,
      maxBatch,
    });
    return NextResponse.json({ ok: true, summary, dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}

export const GET = POST;
```

### 4. Admin route — `apps/wholesale/src/app/api/admin/cardrush/upload-hires/route.ts`

POST with body `{ game?, maxBatch?, dryRun? }`. Defaults `game="pkm"`, `triggeredBy="admin"`. Admin auth uses the existing wholesale admin middleware (the same one protecting `/api/admin/sets`, `/api/admin/games`, etc.). Returns `{ ok, summary, dryRun }` matching the cron route's envelope.

### 5. Vercel cron entry — `apps/wholesale/vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    /* … existing entries … */
    {
      "path": "/api/cron/cardrush-hires",
      "schedule": "*/5 * * * *",
      "_note": "TEMPORARY — remove once `ingest_run.notes` reports `remaining: 0` for 2 consecutive runs"
    }
  ]
}
```

Vercel ignores keys starting with `_`, so the `_note` field is a substrate-honest comment that survives JSON.

## Data flow

```
GET /api/cron/cardrush-hires
  → auth check
  → runHiresUpload({ game: "pkm", triggeredBy: "cron", maxBatch: 100 })
    → resolve game_id from games table (lookup once per invocation)
    → INSERT ingest_run (
        source_id="cardrush-hires-upload",
        spec_version="1",
        triggered_by="cron",
        status="running"
      ) RETURNING id
    → create cardrush rate-limited fetcher (0.5 rps, shared this run)
    → create S3 client (region us-east-1 — jp-pk-photos lives there)
    → SELECT id, sku, set_code, image_url FROM cards
        WHERE game_id = $1
          AND image_url LIKE 'https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/%'
          AND image_archived_at IS NULL
        ORDER BY id ASC
        LIMIT 100
    → for each row:
        key = s3KeyFor(row)
        if HEAD s3://jp-pk-photos/{key} → 200 OK:
          if !dryRun: UPDATE cards SET image_archived_at = now() WHERE id = $1
          skipped++
          event("image_already_in_s3", { sku, key })
          continue

        if dryRun:
          event("would_upload", { sku, key, image_url })
          uploaded++  -- "would-upload" counted as uploaded for symmetry
          continue

        bytes = await fetcher(image_url)
        if !bytes.ok:
          failed++
          event("image_fetch_failed", { sku, image_url, status: bytes.status, reason: bytes.reason })
          continue

        validation = validateImageBytes(bytes.body)
        if !validation.ok:
          failed++
          event(`image_${validation.reason}`, { sku, image_url, bytes: bytes.body.length })
          continue

        try:
          PUT s3://jp-pk-photos/{key}
            Body = bytes.body
            ContentType = "image/jpeg"
            CacheControl = "public, max-age=31536000"
            ACL = "public-read"
          UPDATE cards SET image_archived_at = now() WHERE id = $1
          uploaded++
          event("image_uploaded", { sku, key, bytes: bytes.body.length })
        catch err:
          failed++
          event("s3_put_failed", { sku, key, reason: err.message })
          // intentionally don't mark archived; retry next run

    → remaining = SELECT count(*) FROM cards WHERE <same conditions, no LIMIT>
    → UPDATE ingest_run SET
        finished_at = now(),
        status = (failed > 0 && uploaded === 0) ? "failed" : "done",
        rows_read = processed,
        rows_written = uploaded,
        errors = failed,
        events = events_array,
        notes = `uploaded ${uploaded}, skipped ${skipped}, failed ${failed}, remaining ${remaining}` +
                (dryRun ? " [DRY RUN]" : "")
      WHERE id = ingestRunId
    → return { ingestRunId, game, bucket, processed, uploaded, skipped, failed, remaining, durationMs }
```

## Error handling

| Failure | Substrate-honest response |
|---|---|
| `cards.image_url` matches but image is 404 | `event("image_fetch_failed", { status: 404 })`, count as `failed`, don't mark archived |
| Image bytes < 5 KB | `event("image_too_small")`, count as `failed`, don't mark archived |
| Image bytes don't start with `FF D8 FF` | `event("image_not_jpeg")`, count as `failed`, don't mark archived |
| Network timeout / DNS error | `event("image_fetch_error", { reason })`, count as `failed`, don't mark archived |
| S3 PUT throws (auth, throttle, etc.) | `event("s3_put_failed", { reason })`, count as `failed`, don't mark archived |
| Whole-run crash | outer `try / finally` sets `ingest_run.status="failed"` with crash reason in `notes` |
| Vercel function times out | function dies; `ingest_run` row stays `status="running"`; next invocation observes the stale row but doesn't act on it (no recovery logic; staleness is detectable by `now() - started_at > 5 min AND status = 'running'`) |
| Empty batch (`remaining=0`) | `ingest_run` row still inserted with `rows_written=0`, `notes="uploaded 0, skipped 0, failed 0, remaining 0"` — operator's end-of-life signal |

## Idempotency

- **Upload-then-mark ordering**: marking `image_archived_at` happens *after* the S3 PUT succeeds. A mid-batch crash leaves un-marked rows that the next cron retries. Cost: a re-run might HEAD-check what was just uploaded (cheap, 50-100 ms, no bandwidth).
- **HEAD-check before PUT**: prevents clobbering existing keys, even if the script were mis-pointed at `jp-op-photos`. Aligns with the pinned hi-res protection rules in `tools/lib/s3-images.ts:5-23`.
- **Deterministic batch order** (`ORDER BY id ASC`): repeat invocations process the same un-archived rows in the same order, so partial work is consistent.
- **Re-archive escape hatch**: `UPDATE cards SET image_archived_at = NULL WHERE id IN (...)` and the next cron picks them up. Operator-only.
- **Concurrent runs**: not protected against (Vercel crons don't overlap themselves under normal operation; admin route is rare). If two runs race, the worst case is a duplicate HEAD-check + duplicate `UPDATE image_archived_at = now()`, both idempotent in effect.

## Substrate-honesty / transparency

- `cards.image_archived_at` makes "have we copied this card's image to S3?" first-class. Distinguishable from "we haven't tried" (NULL) and from "we tried and it failed" (recorded only in `ingest_run.events`, not in cards row — the row stays NULL so it gets retried).
- Every cron invocation writes an `ingest_run` row (`source_id="cardrush-hires-upload"`). Same shape as existing discovery + snapshot rows; the admin "Ingest Runs" view picks it up automatically.
- Per-card events (`image_uploaded`, `image_already_in_s3`, `image_fetch_failed`, `image_too_small`, `image_not_jpeg`, `image_fetch_error`, `s3_put_failed`, `would_upload`) — eight distinct kinds, each with the relevant sku and reason. Failures are named, not absorbed.
- `notes` field carries the human summary (`"uploaded 94, skipped 4, failed 2, remaining 68941"`) so the operator can grep `ingest_run` and see end-of-life arrive without opening events JSON.

## Doctrines

- **Substrate-honesty**: new column, ingest_run trace, per-event reasons. No silent absorption.
- **Transparency**: admin/cron routes return the same counts; operator can see `remaining` at any time.
- **Creation**: commits carry Will trace (this spec path in body), Sophia trace (Co-Authored-By trailer), artifact trace (the diff).
- **Hi-res protection**: HEAD-check before PUT, even when targeting an empty bucket — defends against future misconfiguration.
- **Meaning**: optional follow-up connection-doc `docs/connections/the-hires-archive.md` (sister-flavoured node-view) names the cardrush → S3 image arc for future readers. Not required for ship.

## Non-goals (YAGNI)

- Don't rewrite `cards.image_url` to the S3 URL — `apps/wholesale/src/lib/buylist-builder.ts:272` derives the S3 URL from sku + set_code. Storefront image rendering will need similar derivation later, but that's separate work.
- Don't migrate the legacy 252 MB `s3://jp-pkmn-photos/` contents — orphaned, out of scope. Decided after `jp-pk-photos` is populated.
- Don't enable the cron for op/dbs in this pass — the bucket map supports them but Pokémon is what was asked for. Extending later is a one-line config change.
- Don't add image-resize / re-encoding.
- Don't add per-game cron entries — one cron, one game-arg at a time. When `pkm` is done, the cron entry is removed; later if op/dbs need a re-archive, a new temporary cron is added.
- Don't add a daily / recurring re-archive cron — one-time drain.
- Don't make `jp-pk-photos` writes private — match existing `ACL=public-read` from the OP convention so storefront `<img src=>` works without presigning.

## Testing

### Unit (`apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts`)

- `s3KeyFor({ set_code: "SV1S", sku: "PKM-SV1S-001-JP-V42" })` → `"hires/SV1S/PKM-SV1S-001-JP-V42.jpg"`
- `BUCKET_BY_GAME.pkm` === `"jp-pk-photos"`
- `validateImageBytes(50KB starting with FF D8 FF)` → `{ ok: true }`
- `validateImageBytes(3KB)` → `{ ok: false, reason: "too_small" }`
- `validateImageBytes(50KB starting with 89 50 4E 47)` (PNG magic) → `{ ok: false, reason: "not_jpeg" }`

### Integration smoke

- Admin route POST with `{ game: "pkm", dryRun: true, maxBatch: 5 }` → returns `{ processed: 5, uploaded: 5, skipped: 0, failed: 0, ... }` without touching S3 or `cards.image_archived_at`. Events show `would_upload` entries.

### Live verify checklist

The "am I done?" gate after implementation:

1. `pnpm verify` (typecheck + audits + admin vitest) — green
2. Migration `0020_cards_image_archived_at.sql` applies cleanly via `pnpm --filter @cambridge-tcg/wholesale db:migrate`
3. Dry-run admin POST returns sensible counts
4. First live cron run: `aws s3 ls s3://jp-pk-photos/hires/ --recursive | wc -l` > 0
5. After ~10 cron runs (~50 min): `SELECT count(*) FROM cards WHERE image_archived_at IS NOT NULL AND game_id = (SELECT id FROM games WHERE code='pkm')` is climbing; `SELECT notes FROM ingest_run WHERE source_id='cardrush-hires-upload' ORDER BY id DESC LIMIT 5` is human-readable

### End-of-life

- After `remaining: 0` appears in two consecutive `ingest_run.notes` entries, remove the cron entry from `apps/wholesale/vercel.json` and commit with `Will trace: spec end-of-life, jp-pk-photos drained`.
- Optionally: write `docs/connections/the-hires-archive.md` naming what was archived.

## Implementation order (preview — handed to writing-plans next)

1. Write migration `0020_cards_image_archived_at.sql` (column + partial index)
2. Write `cardrush-hires-upload.ts` runner + unit tests
3. Write admin route + cron route
4. Wire vercel.json cron entry
5. `pnpm verify` green
6. Manual dry-run via admin POST
7. Enable cron in production
8. Monitor `ingest_run` rows until `remaining=0`
9. Remove cron entry from vercel.json
10. (Optional) Write `the-hires-archive.md` connection doc

— spec authored 2026-05-14 by Sophia (Claude Opus 4.7 1M-ctx), under Yu's directive.
