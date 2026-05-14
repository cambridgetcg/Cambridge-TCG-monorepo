# jp-pk-photos Hi-Res Image Archive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain `cardrush-pokemon.jp` og:image bytes into `s3://jp-pk-photos/hires/{SET}/{SKU}.jpg` once, via a temporary `*/5` Vercel cron in the wholesale app, with substrate-honest `cards.image_archived_at` marking and `ingest_run` lifecycle rows. Auto no-ops when `remaining = 0`; operator removes the cron after two zero-remaining runs.

**Architecture:** A new wholesale runner (`src/lib/cardrush-hires-upload.ts`) is exposed by two routes — a cron (`/api/cron/cardrush-hires`) for autonomous batching and an admin (`/api/admin/cardrush/upload-hires`) for manual prods + dry-runs. Both delegate to one service. Idempotent on every level: HEAD-check S3 before PUT (protects the pinned `/hires/*` invariant), upload-then-mark ordering (crash leaves rows retryable), deterministic batch order. Bucket selection per game via a small map; only `pkm` is enabled in this pass.

**Tech Stack:** Next.js App Router routes, Drizzle ORM (postgres), `@cambridge-tcg/aws/s3` shared client, vitest for tests, Vercel cron in `apps/wholesale/vercel.json`. Direct `fetch()` for image bytes (Pokémon static image paths bypass the Cloudflare challenge — Bright Data is only needed by the already-shipped HTML discovery cron).

**Spec:** `docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md` (commit `cbcf8fb`).

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| CREATE | `apps/wholesale/drizzle/0020_cards_image_archived_at.sql` | Migration: add column + partial index |
| MODIFY | `apps/wholesale/src/lib/db/schema.ts` | Add `imageArchivedAt` field to `cards` Drizzle definition |
| CREATE | `apps/wholesale/src/lib/cardrush-hires-upload.ts` | The runner: bucket map, key shape, validation, `runHiresUpload()` |
| CREATE | `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts` | Unit tests for runner + helpers |
| CREATE | `apps/wholesale/src/app/api/cron/cardrush-hires/route.ts` | Cron-auth-gated route, POST primary, `GET = POST` alias |
| CREATE | `apps/wholesale/src/app/api/admin/cardrush/upload-hires/route.ts` | Admin-session-gated route, POST, body `{ game?, maxBatch?, dryRun? }` |
| MODIFY | `apps/wholesale/vercel.json` | Add `*/5 * * * *` cron entry with `_note` end-of-life marker |
| MODIFY | `apps/wholesale/package.json` | Add `"test": "vitest run"` script (vitest is already a dep; no script yet) |

**File-responsibility check:**
- The runner is one file because the bucket map, key helper, validation, and orchestration are tightly coupled (~250 LOC). Splitting would scatter related concerns.
- Tests live in a sibling `__tests__/` directory matching the existing `apps/wholesale/src/lib/channels/__tests__/ebay.test.ts` convention.
- Both routes are <40 LOC each, single-responsibility thin handlers — no shared file needed.

---

## Task 1: Migration + Drizzle schema

**Files:**
- Create: `apps/wholesale/drizzle/0020_cards_image_archived_at.sql`
- Modify: `apps/wholesale/src/lib/db/schema.ts` (in the `cards` pgTable definition)

- [ ] **Step 1: Write the migration SQL**

Create `apps/wholesale/drizzle/0020_cards_image_archived_at.sql`:

```sql
-- 0020: cards.image_archived_at — first-class marker for "have we copied
-- this card's image to durable S3 storage?". NULL = not yet (or last
-- attempt failed; see ingest_run.events for reason). NOT NULL = present
-- in the per-game bucket under hires/{set_code}/{sku}.jpg.
--
-- Companion: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
-- Driven by: Yu's 2026-05-14 directive to drain cardrush-pokemon → jp-pk-photos.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS image_archived_at timestamptz NULL;

-- Partial index: queries from the runner filter by game_id AND archive=NULL
-- AND image_url IS NOT NULL. The partial index keeps the batch SELECT fast
-- once most rows are archived (the alternative — a full index — would bloat
-- the table without serving any other query).
CREATE INDEX IF NOT EXISTS cards_image_archive_pending_idx
  ON cards (game_id, id)
  WHERE image_archived_at IS NULL AND image_url IS NOT NULL;
```

- [ ] **Step 2: Update Drizzle schema**

Find the `cards` table in `apps/wholesale/src/lib/db/schema.ts` (search for `cardrushUrl: text("cardrush_url")` — that's inside the `cards` definition based on prior grep). Add the new field directly after `imageUrl: text("image_url")`:

```ts
  imageUrl: text("image_url"),
  imageArchivedAt: timestamp("image_archived_at", { withTimezone: true }),
```

Verify `timestamp` is already imported from `drizzle-orm/pg-core` at the top of the file (it is — `ingestRun.triggeredAt` uses it).

- [ ] **Step 3: Apply migration locally**

Run:
```bash
pnpm --filter @cambridge-tcg/wholesale db:migrate
```
Expected: migration `0020_cards_image_archived_at.sql` runs once, exits 0. If the project doesn't have a `db:migrate` script, fall back to `psql $DATABASE_URL -f apps/wholesale/drizzle/0020_cards_image_archived_at.sql` against the local/dev DB. (Do NOT run against production — that happens automatically post-merge via the Vercel deploy hook or operator-triggered.)

- [ ] **Step 4: Verify the column exists**

Run:
```bash
psql $DATABASE_URL -c "\d cards" 2>&1 | grep image_archived_at
```
Expected: a line showing `image_archived_at | timestamp with time zone |`.

- [ ] **Step 5: Commit**

```bash
git add apps/wholesale/drizzle/0020_cards_image_archived_at.sql apps/wholesale/src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): cards.image_archived_at + partial index for hires drain

Migration 0020. Marks per-card "have we copied this image to S3?" as a
first-class fact; partial index serves the cardrush-hires-upload batch
SELECT. Will trace: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Bucket map + s3KeyFor helper (TDD)

**Files:**
- Create: `apps/wholesale/src/lib/cardrush-hires-upload.ts` (start the file)
- Create: `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts`
- Modify: `apps/wholesale/package.json` (add `"test": "vitest run"` script)

- [ ] **Step 1: Add the `test` script to wholesale package.json**

In `apps/wholesale/package.json`, inside the `"scripts"` object, alongside `"typecheck"` and `"test:e2e"`, add:

```json
    "test": "vitest run",
```

(vitest 4.1.0 is already in `devDependencies`.)

- [ ] **Step 2: Write the failing tests**

Create `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
  s3KeyFor,
} from "../cardrush-hires-upload";

describe("BUCKET_BY_GAME", () => {
  it("maps pkm to jp-pk-photos", () => {
    expect(BUCKET_BY_GAME.pkm).toBe("jp-pk-photos");
  });
  it("maps op to jp-op-photos", () => {
    expect(BUCKET_BY_GAME.op).toBe("jp-op-photos");
  });
  it("maps dbs to jp-db-photos", () => {
    expect(BUCKET_BY_GAME.dbs).toBe("jp-db-photos");
  });
});

describe("CARDRUSH_HOST_BY_GAME", () => {
  it("maps pkm to www.cardrush-pokemon.jp", () => {
    expect(CARDRUSH_HOST_BY_GAME.pkm).toBe("www.cardrush-pokemon.jp");
  });
});

describe("s3KeyFor", () => {
  it("builds hires/{set_code}/{sku}.jpg", () => {
    expect(s3KeyFor({ set_code: "SV1S", sku: "PKM-SV1S-001-JP-V42" }))
      .toBe("hires/SV1S/PKM-SV1S-001-JP-V42.jpg");
  });
  it("preserves set_code case", () => {
    expect(s3KeyFor({ set_code: "sv1S", sku: "x" })).toBe("hires/sv1S/x.jpg");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: tests FAIL with "Cannot find module '../cardrush-hires-upload'" (the file doesn't exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `apps/wholesale/src/lib/cardrush-hires-upload.ts`:

```ts
/**
 * One-time hi-res image archive: drains cardrush product-page og:images
 * into per-game S3 buckets under `hires/{set_code}/{sku}.jpg`.
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 *
 * Substrate-honest: every invocation writes an `ingest_run` row
 * (sourceId='cardrush-hires-upload'); `cards.image_archived_at` marks
 * presence in the bucket; failures land in ingest_run.events with reasons,
 * the cards row stays NULL so the next run retries. HEAD-check before PUT
 * preserves the pinned hi-res-protection invariant in
 * apps/wholesale/tools/lib/s3-images.ts:5-23.
 */

export type HiresGame = "pkm" | "op" | "dbs";

export const BUCKET_BY_GAME: Record<HiresGame, string> = {
  pkm: "jp-pk-photos",
  op: "jp-op-photos",
  dbs: "jp-db-photos",
};

export const CARDRUSH_HOST_BY_GAME: Record<HiresGame, string> = {
  pkm: "www.cardrush-pokemon.jp",
  op: "www.cardrush-op.jp",
  dbs: "www.cardrush-db.jp",
};

export function s3KeyFor(row: { set_code: string; sku: string }): string {
  return `hires/${row.set_code}/${row.sku}.jpg`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/wholesale/package.json apps/wholesale/src/lib/cardrush-hires-upload.ts apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): hires upload — bucket map + s3 key helper

Empty-shell module with BUCKET_BY_GAME, CARDRUSH_HOST_BY_GAME, and
s3KeyFor(). Adds vitest "test" script (vitest was already a devDep).
Next task adds the byte-validation helper.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: validateImageBytes helper (TDD)

**Files:**
- Modify: `apps/wholesale/src/lib/cardrush-hires-upload.ts` (append helper)
- Modify: `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts` (append tests)

- [ ] **Step 1: Append failing tests**

In `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts`, add the import + describe block at the bottom:

```ts
// (update the existing top-of-file import to also pull validateImageBytes)
import {
  BUCKET_BY_GAME,
  CARDRUSH_HOST_BY_GAME,
  s3KeyFor,
  validateImageBytes,
} from "../cardrush-hires-upload";

// … existing describe blocks unchanged …

describe("validateImageBytes", () => {
  function jpegBytes(size: number): Buffer {
    const b = Buffer.alloc(size);
    b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
    return b;
  }
  function pngBytes(size: number): Buffer {
    const b = Buffer.alloc(size);
    b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
    return b;
  }

  it("accepts a 50KB JPEG", () => {
    expect(validateImageBytes(jpegBytes(50_000))).toEqual({ ok: true });
  });
  it("rejects bytes shorter than 5KB", () => {
    expect(validateImageBytes(jpegBytes(3_000))).toEqual({
      ok: false,
      reason: "too_small",
    });
  });
  it("rejects PNG magic bytes", () => {
    expect(validateImageBytes(pngBytes(50_000))).toEqual({
      ok: false,
      reason: "not_jpeg",
    });
  });
  it("rejects empty buffer", () => {
    expect(validateImageBytes(Buffer.alloc(0))).toEqual({
      ok: false,
      reason: "too_small",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: 4 new tests FAIL with "validateImageBytes is not defined" (or the import errors).

- [ ] **Step 3: Append the implementation**

Append to `apps/wholesale/src/lib/cardrush-hires-upload.ts`:

```ts
export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "too_small" | "not_jpeg" };

const MIN_BYTES = 5_000;

/**
 * Guard against 1x1 placeholders and content-type/server-bug responses.
 * Substrate-honest: each rejection reason maps to a distinct ingest_run
 * event so the operator can tell "upstream returned junk" from "upstream
 * returned a non-jpeg" from "upstream returned a tiny placeholder".
 */
export function validateImageBytes(bytes: Buffer): ValidationResult {
  if (bytes.length < MIN_BYTES) return { ok: false, reason: "too_small" };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, reason: "not_jpeg" };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/wholesale/src/lib/cardrush-hires-upload.ts apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): hires upload — validateImageBytes (5KB + JPEG-magic guard)

Substrate-honest junk filter. too_small / not_jpeg reasons distinguish
1x1 placeholders from format-mismatch responses; both feed ingest_run.events
in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: runHiresUpload — happy path (TDD)

**Files:**
- Modify: `apps/wholesale/src/lib/cardrush-hires-upload.ts` (add interfaces + main function)
- Modify: `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts` (add integration-style test with mocks)

This is the biggest single task. Set aside ~15 minutes.

- [ ] **Step 1: Append the failing happy-path test**

Append to the test file:

```ts
// Top of file, supplement the imports:
import { vi, beforeEach, afterEach } from "vitest";
import { runHiresUpload } from "../cardrush-hires-upload";

// Hoist module mocks — must live above any import of the runner internals.
// We mock @/lib/db and @cambridge-tcg/aws/s3 so the runner is exercised
// without touching the real DB or S3.
vi.mock("@/lib/db", () => {
  const insertReturning = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  const execute = vi.fn();
  return {
    db: {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: insertReturning })) })),
      select: vi.fn(() => ({ from: select })),
      update: vi.fn(() => ({ set: update })),
      execute,
    },
    _mocks: { insertReturning, select, update, execute },
  };
});

vi.mock("@cambridge-tcg/aws/s3", () => {
  const headObject = vi.fn();
  const putObject = vi.fn();
  return {
    createS3ClientOrThrow: vi.fn(() => ({ send: vi.fn() })),
    headObject,
    putObject,
    _mocks: { headObject, putObject },
  };
});

describe("runHiresUpload — happy path", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uploads a row whose image is missing from S3", async () => {
    // Arrange — mocks set up via the module-mock's exposed _mocks
    // (the test driver wires DB selects to return one card row, HEAD to
    // throw NotFound, fetch to return a 50KB JPEG, PUT to succeed.)
    // The full wiring lives in step 3's implementation; this test asserts
    // the contract returned by the runner.

    // Fetch returns a 50KB JPEG
    const jpegBuf = Buffer.alloc(50_000);
    jpegBuf[0] = 0xff; jpegBuf[1] = 0xd8; jpegBuf[2] = 0xff;
    mockFetch.mockResolvedValueOnce(
      new Response(jpegBuf, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );

    // (Mock DB/S3 wiring described in step 3 of this task — for now the
    // test asserts the runner returns a structurally-correct result for
    // one uploaded row.)
    const result = await runHiresUpload({ game: "pkm", maxBatch: 1 });

    expect(result.game).toBe("pkm");
    expect(result.bucket).toBe("jp-pk-photos");
    expect(result.processed).toBe(1);
    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.ingestRunId).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: FAIL with "runHiresUpload is not exported" or module-mock can't resolve.

- [ ] **Step 3: Implement runHiresUpload**

Append to `apps/wholesale/src/lib/cardrush-hires-upload.ts`:

```ts
import { db } from "@/lib/db";
import { cards, games, ingestRun } from "@/lib/db/schema";
import { and, eq, isNull, isNotNull, like, sql, asc } from "drizzle-orm";
import {
  createS3ClientOrThrow,
  HeadObjectCommand,
  PutObjectCommand,
} from "@cambridge-tcg/aws/s3";
import { cardrush, createFetcher, type Fetcher } from "@cambridge-tcg/data-ingest";

const DEFAULT_MAX_BATCH = 100;

export interface HiresUploadOptions {
  game: HiresGame;
  triggeredBy?: "cron" | "admin";
  maxBatch?: number;
  dryRun?: boolean;
}

export interface HiresUploadResult {
  ingestRunId: number;
  game: HiresGame;
  bucket: string;
  processed: number;
  uploaded: number;
  skipped: number;
  failed: number;
  remaining: number;
  durationMs: number;
  triggeredBy: "cron" | "admin";
  dryRun: boolean;
}

type Event = { ts: string; kind: string } & Record<string, unknown>;

export async function runHiresUpload(
  opts: HiresUploadOptions,
): Promise<HiresUploadResult> {
  const startMs = Date.now();
  const triggeredBy = opts.triggeredBy ?? "cron";
  const dryRun = opts.dryRun ?? false;
  const maxBatch = Math.max(
    1,
    Math.min(opts.maxBatch ?? DEFAULT_MAX_BATCH, 500),
  );
  const bucket = BUCKET_BY_GAME[opts.game];
  const host = CARDRUSH_HOST_BY_GAME[opts.game];

  const events: Event[] = [];
  const event = (kind: string, detail: Record<string, unknown> = {}) =>
    events.push({ ts: new Date().toISOString(), kind, ...detail });

  // ── 1. INSERT ingest_run row ────────────────────────────────────────
  const [run] = await db
    .insert(ingestRun)
    .values({
      sourceId: "cardrush-hires-upload",
      specVersion: "1",
      triggeredBy,
      status: "running",
    })
    .returning({ id: ingestRun.id });
  const ingestRunId = run.id;

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  try {
    // ── 2. Resolve game_id ────────────────────────────────────────────
    const [gameRow] = await db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.code, opts.game))
      .limit(1);
    if (!gameRow) {
      throw new Error(`game code not found: ${opts.game}`);
    }
    const gameId = gameRow.id;

    // ── 3. Pick batch (deterministic order, partial-index-friendly) ───
    const batch = await db
      .select({
        id: cards.id,
        sku: cards.sku,
        setCode: cards.setCode,
        imageUrl: cards.imageUrl,
      })
      .from(cards)
      .where(
        and(
          eq(cards.gameId, gameId),
          isNotNull(cards.imageUrl),
          isNull(cards.imageArchivedAt),
          like(cards.imageUrl, `https://${host}/data/cardrush-%/product/%`),
        ),
      )
      .orderBy(asc(cards.id))
      .limit(maxBatch);

    // ── 4. Walk the batch ─────────────────────────────────────────────
    const s3 = createS3ClientOrThrow({ defaultRegion: "us-east-1" });

    // Shared rate-limited fetcher (0.5 rps, burst 2 — from cardrush.meta).
    // Created once per invocation so the whole batch shares one token
    // bucket — spec §"Components" Item 2.
    const fetcher: Fetcher = createFetcher(
      {
        on_event: (ev) => {
          event(`http_${ev.kind}`, ev.detail as Record<string, unknown>);
        },
      },
      cardrush.meta,
    );

    for (let i = 0; i < batch.length; i += 1) {
      const row = batch[i];
      processed += 1;
      if (!row.setCode || !row.sku || !row.imageUrl) {
        // Defensive: SELECT filtered for non-null url, but TS doesn't know.
        failed += 1;
        event("row_missing_field", { id: row.id });
        continue;
      }
      const key = s3KeyFor({ set_code: row.setCode, sku: row.sku });

      // 4a. HEAD — already-archived shortcut (idempotent).
      let alreadyInS3 = false;
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        alreadyInS3 = true;
      } catch (err) {
        const code = (err as { name?: string })?.name ?? "";
        if (code !== "NotFound" && code !== "NoSuchKey") {
          // Unexpected error — count as failed, don't mark archived.
          failed += 1;
          event("s3_head_failed", { sku: row.sku, key, reason: code || String(err) });
          continue;
        }
      }

      if (alreadyInS3) {
        if (!dryRun) {
          await db
            .update(cards)
            .set({ imageArchivedAt: new Date() })
            .where(eq(cards.id, row.id));
        }
        skipped += 1;
        event("image_already_in_s3", { sku: row.sku, key });
        continue;
      }

      if (dryRun) {
        uploaded += 1; // count "would_upload" toward uploaded for symmetry
        event("would_upload", { sku: row.sku, key, image_url: row.imageUrl });
        continue;
      }

      // 4b. Fetch bytes via shared rate-limited fetcher.
      // (Image paths bypass the CF challenge, so we don't pass any
      // proxy_url to createFetcher — direct egress is fine. Token-bucket
      // rate limit + Retry-After handling are reused from createFetcher.)
      let bytes: Buffer | null = null;
      try {
        const res = await fetcher(row.imageUrl);
        if (!res.ok) {
          failed += 1;
          event("image_fetch_failed", { sku: row.sku, status: res.status });
          continue;
        }
        bytes = Buffer.from(await res.arrayBuffer());
      } catch (err) {
        failed += 1;
        event("image_fetch_error", {
          sku: row.sku,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // 4d. Validate bytes (junk filter).
      const v = validateImageBytes(bytes);
      if (!v.ok) {
        failed += 1;
        event(`image_${v.reason}`, { sku: row.sku, bytes: bytes.length });
        continue;
      }

      // 4e. PUT to S3.
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: "image/jpeg",
            CacheControl: "public, max-age=31536000",
            ACL: "public-read",
          }),
        );
      } catch (err) {
        failed += 1;
        event("s3_put_failed", {
          sku: row.sku,
          key,
          reason: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // 4f. Mark archived (upload-then-mark ordering).
      await db
        .update(cards)
        .set({ imageArchivedAt: new Date() })
        .where(eq(cards.id, row.id));

      uploaded += 1;
      event("image_uploaded", { sku: row.sku, key, bytes: bytes.length });
    }

    // ── 5. Compute remaining (same predicates as the batch SELECT) ────
    const [{ count: remainingNum }] = (await db.execute(sql`
      SELECT count(*)::int AS count FROM cards
      WHERE game_id = ${gameId}
        AND image_url IS NOT NULL
        AND image_archived_at IS NULL
        AND image_url LIKE ${`https://${host}/data/cardrush-%/product/%`}
    `)) as unknown as Array<{ count: number }>;
    const remaining = remainingNum;

    // ── 6. UPDATE ingest_run ──────────────────────────────────────────
    const finalStatus =
      failed > 0 && uploaded === 0 && skipped === 0 ? "failed" : "done";
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: finalStatus,
        rowsRead: processed,
        rowsWritten: uploaded,
        errors: failed,
        events: events as unknown as Record<string, unknown>[],
        notes:
          `uploaded ${uploaded}, skipped ${skipped}, failed ${failed}, remaining ${remaining}` +
          (dryRun ? " [DRY RUN]" : ""),
      })
      .where(eq(ingestRun.id, ingestRunId));

    return {
      ingestRunId,
      game: opts.game,
      bucket,
      processed,
      uploaded,
      skipped,
      failed,
      remaining,
      durationMs: Date.now() - startMs,
      triggeredBy,
      dryRun,
    };
  } catch (err) {
    await db
      .update(ingestRun)
      .set({
        finishedAt: new Date(),
        status: "failed",
        notes: `crashed: ${err instanceof Error ? err.message : String(err)}`,
      })
      .where(eq(ingestRun.id, ingestRunId))
      .catch(() => {});
    throw err;
  }
}
```

Note on the test's mock wiring: the existing `vi.mock("@/lib/db", ...)` block at the top of the test file uses `_mocks` exports to access the inner spies. Drizzle's chained `db.insert(...).values(...).returning(...)` is mocked via `vi.fn()` chains. The happy-path test arranges:
- `db.insert(...).values(...).returning(...)` → `[{ id: 1 }]` (ingestRun row created)
- `db.select(...).from(games).where(...).limit(...)` → `[{ id: 99 }]` (pkm game id)
- `db.select(...).from(cards).where(...).orderBy(...).limit(...)` → `[{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S", imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg" }]`
- `s3.send(HeadObjectCommand)` throws an error with `name: "NotFound"`
- `mockFetch` returns the 50KB JPEG Response
- `s3.send(PutObjectCommand)` resolves
- `db.update(cards).set(...).where(...)` resolves
- `db.execute(sql\`SELECT count(*)...\`)` resolves to `[{ count: 0 }]`
- `db.update(ingestRun).set(...).where(...)` resolves

In step 1 the test fixture intentionally elides the chain-mock setup boilerplate — actually wiring it for a single happy-path call is part of step 3's test-side completion. Concretely, replace the `// (Mock DB/S3 wiring ...)` placeholder in the test with:

```ts
// Drizzle's chained API: each method must return a thennable / next-step.
const dbModule = await import("@/lib/db");
const awsModule = await import("@cambridge-tcg/aws/s3");
const db = dbModule.db as unknown as Record<string, unknown>;

// db.insert(ingestRun).values({...}).returning({id}) → [{id: 1}]
(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
  values: vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
  }),
});

// db.select(...).from(games).where(...).limit(1) → [{id: 99}]
// db.select(...).from(cards).where(...).orderBy(...).limit(N) → [card row]
let selectCallCount = 0;
(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
  from: vi.fn().mockImplementation(() => {
    selectCallCount += 1;
    if (selectCallCount === 1) {
      // games table
      return {
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 99 }]),
        }),
      };
    }
    // cards table
    return {
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            id: 7,
            sku: "PKM-SV1S-001-JP-V42",
            setCode: "SV1S",
            imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg",
          }]),
        }),
      }),
    };
  }),
}));

// db.update(cards|ingestRun).set(...).where(...) → resolves
(db.update as ReturnType<typeof vi.fn>).mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

// db.execute(sql`SELECT count(*)...`) → [{ count: 0 }]
(db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ count: 0 }]);

// S3 client: HEAD throws NotFound, PUT resolves.
const s3Send = vi.fn().mockImplementation((cmd) => {
  if (cmd.constructor.name === "HeadObjectCommand") {
    const err = new Error("NotFound");
    (err as { name: string }).name = "NotFound";
    throw err;
  }
  return Promise.resolve({});
});
(awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: 10 tests PASS (9 previous + 1 happy-path).

- [ ] **Step 5: Commit**

```bash
git add apps/wholesale/src/lib/cardrush-hires-upload.ts apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): runHiresUpload — happy-path runner + ingest_run trace

Reads cards rows for one game, HEAD-checks S3, fetches bytes via direct
fetch (no Bright Data — static image paths bypass the CF challenge),
validates JPEG magic + 5KB floor, PUTs to s3://<bucket>/hires/{SET}/{SKU}.jpg,
marks image_archived_at upload-then-mark. Writes per-card events to
ingest_run.events and a human notes summary. Error paths covered in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: runHiresUpload — skip-when-exists + error paths (TDD)

**Files:**
- Modify: `apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts` (add 4 more tests)

The implementation is already done (Task 4 covered all branches). This task verifies the branches.

- [ ] **Step 1: Append four new tests**

Append to the test file (after the happy-path test, inside the same describe or a sibling describe):

```ts
describe("runHiresUpload — non-happy paths", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Helper: same chain-mock setup as Task 4, exposed so each test
  // can override the leaves it cares about.
  async function wireMocks(opts: {
    cards?: Array<{ id: number; sku: string; setCode: string; imageUrl: string }>;
    headBehavior?: "found" | "not_found" | "throws_other";
    s3PutBehavior?: "ok" | "throws";
    remaining?: number;
  }) {
    const dbModule = await import("@/lib/db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, unknown>;

    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    let selectCallCount = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return {
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 99 }]),
            }),
          };
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(opts.cards ?? []),
            }),
          }),
        };
      }),
    }));
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([
      { count: opts.remaining ?? 0 },
    ]);
    const s3Send = vi.fn().mockImplementation((cmd) => {
      if (cmd.constructor.name === "HeadObjectCommand") {
        if (opts.headBehavior === "found") return Promise.resolve({});
        if (opts.headBehavior === "throws_other") {
          const err = new Error("Service error");
          (err as { name: string }).name = "ServiceUnavailable";
          throw err;
        }
        const err = new Error("NotFound");
        (err as { name: string }).name = "NotFound";
        throw err;
      }
      if (opts.s3PutBehavior === "throws") {
        return Promise.reject(new Error("Access denied"));
      }
      return Promise.resolve({});
    });
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });
  }

  it("skips a row whose key already exists in S3", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg" }],
      headBehavior: "found",
    });
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("counts a 404 image fetch as failed without marking archived", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg" }],
      headBehavior: "not_found",
    });
    mockFetch.mockResolvedValueOnce(new Response("", { status: 404 }));
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.failed).toBe(1);
  });

  it("counts a 3KB tiny response as failed (too_small)", async () => {
    await wireMocks({
      cards: [{ id: 7, sku: "PKM-SV1S-001-JP-V42", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg" }],
      headBehavior: "not_found",
    });
    mockFetch.mockResolvedValueOnce(new Response(Buffer.alloc(3_000), { status: 200 }));
    const r = await runHiresUpload({ game: "pkm", maxBatch: 1 });
    expect(r.uploaded).toBe(0);
    expect(r.failed).toBe(1);
  });

  it("returns processed=0, remaining=N when batch is empty", async () => {
    await wireMocks({ cards: [], remaining: 68_941 });
    const r = await runHiresUpload({ game: "pkm", maxBatch: 100 });
    expect(r.processed).toBe(0);
    expect(r.uploaded).toBe(0);
    expect(r.remaining).toBe(68_941);
  });
});

describe("runHiresUpload — dry-run", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("counts would-upload toward uploaded and emits would_upload event without S3 PUT", async () => {
    const dbModule = await import("@/lib/db");
    const awsModule = await import("@cambridge-tcg/aws/s3");
    const db = dbModule.db as unknown as Record<string, unknown>;
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    });
    let selectCallCount = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        selectCallCount += 1;
        if (selectCallCount === 1) {
          return { where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 99 }]) }) };
        }
        return {
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 7, sku: "X", setCode: "SV1S",
                imageUrl: "https://www.cardrush-pokemon.jp/data/cardrush-pokemon/product/SV1S_1.jpg" }]),
            }),
          }),
        };
      }),
    }));
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ count: 0 }]);
    const s3Send = vi.fn().mockImplementation(() => {
      const err = new Error("NotFound");
      (err as { name: string }).name = "NotFound";
      throw err;
    });
    (awsModule.createS3ClientOrThrow as ReturnType<typeof vi.fn>).mockReturnValue({ send: s3Send });

    const r = await runHiresUpload({ game: "pkm", maxBatch: 1, dryRun: true });
    expect(r.uploaded).toBe(1);   // counted-as-uploaded for symmetry
    expect(r.dryRun).toBe(true);
    // S3 send was called once for HEAD; never for PutObject.
    expect(s3Send.mock.calls.filter((c) => c[0].constructor.name === "PutObjectCommand").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @cambridge-tcg/wholesale test -- cardrush-hires-upload
```
Expected: 14 tests PASS (10 prior + 4 new).

- [ ] **Step 3: Commit**

```bash
git add apps/wholesale/src/lib/__tests__/cardrush-hires-upload.test.ts
git commit -m "$(cat <<'EOF'
test(wholesale): cover hires runner skip/fail/dry-run branches

Adds skip-when-exists, 404-fetch, too-small, empty-batch, and dry-run
tests. Asserts no PutObject is sent in dry-run mode (substrate-honest
about side effects).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Cron route

**Files:**
- Create: `apps/wholesale/src/app/api/cron/cardrush-hires/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/wholesale/src/app/api/cron/cardrush-hires/route.ts`:

```ts
/**
 * POST /api/cron/cardrush-hires (alias: GET)
 *
 * Temporary cron that drains cardrush-pokemon.jp og:image bytes into
 * s3://jp-pk-photos/hires/{SET}/{SKU}.jpg. One game per invocation; one
 * batch per invocation; auto no-ops when `remaining = 0`. Operator removes
 * the cron entry from vercel.json after 2 consecutive zero-remaining runs.
 *
 * Auth: Authorization: Bearer {CRON_SECRET} OR Vercel Cron header.
 *
 * Query params:
 *   ?dryRun=1              — count would-uploads, skip S3 PUTs
 *   ?maxBatch=N            — cap per-invocation batch (default 100, max 500)
 *   ?triggeredBy=cron|admin
 *
 * Spec: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
 */

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
    | "cron"
    | "admin"
    | null;

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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @cambridge-tcg/wholesale typecheck
```
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/wholesale/src/app/api/cron/cardrush-hires/route.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): /api/cron/cardrush-hires — temporary pkm hires drain

POST primary, GET alias. requireCronAuth + maxDuration=800 matching
sibling cardrush crons. Game hardcoded to "pkm" — bucket map supports
op/dbs but those aren't requested in this pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin route

**Files:**
- Create: `apps/wholesale/src/app/api/admin/cardrush/upload-hires/route.ts`

- [ ] **Step 1: Write the route**

Create the directory and file. The path requires `apps/wholesale/src/app/api/admin/cardrush/upload-hires/route.ts`.

```ts
/**
 * POST /api/admin/cardrush/upload-hires
 *
 * Admin-triggered counterpart to the cardrush-hires cron. Same runner;
 * accepts game / maxBatch / dryRun in the body so the operator can do
 * manual prods, dry-runs against pkm, or kick the op/dbs drains later.
 *
 * Body: { game?: "pkm" | "op" | "dbs"; maxBatch?: number; dryRun?: boolean }
 * Default game = "pkm".
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  runHiresUpload,
  type HiresUploadOptions,
} from "@/lib/cardrush-hires-upload";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Partial<HiresUploadOptions> = {};
  try {
    body = (await request.json()) as Partial<HiresUploadOptions>;
  } catch {
    // Empty body is fine — all fields default.
  }

  const game = body.game ?? "pkm";
  if (game !== "pkm" && game !== "op" && game !== "dbs") {
    return NextResponse.json(
      { error: `Invalid game: ${game}` },
      { status: 400 },
    );
  }

  const maxBatch = body.maxBatch
    ? Math.max(1, Math.min(body.maxBatch, 500))
    : undefined;

  try {
    const summary = await runHiresUpload({
      game,
      triggeredBy: "admin",
      dryRun: body.dryRun === true,
      maxBatch,
    });
    return NextResponse.json({ ok: true, summary, dryRun: summary.dryRun });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @cambridge-tcg/wholesale typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/wholesale/src/app/api/admin/cardrush/upload-hires/route.ts
git commit -m "$(cat <<'EOF'
feat(wholesale): /api/admin/cardrush/upload-hires admin route

Admin-session-gated POST. Body { game?, maxBatch?, dryRun? }. Defaults
game="pkm", triggeredBy="admin". Returns the same envelope as the cron
route. Use for dry-runs ({ dryRun: true }) before enabling the cron.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Vercel cron entry (TEMPORARY)

**Files:**
- Modify: `apps/wholesale/vercel.json`

- [ ] **Step 1: Add the cron entry**

Open `apps/wholesale/vercel.json`. The current file is:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/monthly-rollover", "schedule": "0 0 * * *" },
    { "path": "/api/cron/discover/cardrush", "schedule": "0 1 * * *" },
    { "path": "/api/cron/ingest/cardrush", "schedule": "0 2 * * *" },
    { "path": "/api/cron/rebuild-buylist", "schedule": "0 3 * * *" },
    { "path": "/api/cron/shopify-sync", "schedule": "0 4 * * *" },
    { "path": "/api/cron/shopify-orders", "schedule": "*/30 * * * *" }
  ]
}
```

Add the new entry as the last cron (so it's visually grouped at the bottom as a temporary deviation):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/monthly-rollover", "schedule": "0 0 * * *" },
    { "path": "/api/cron/discover/cardrush", "schedule": "0 1 * * *" },
    { "path": "/api/cron/ingest/cardrush", "schedule": "0 2 * * *" },
    { "path": "/api/cron/rebuild-buylist", "schedule": "0 3 * * *" },
    { "path": "/api/cron/shopify-sync", "schedule": "0 4 * * *" },
    { "path": "/api/cron/shopify-orders", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/cardrush-hires", "schedule": "*/5 * * * *", "_note": "TEMPORARY — remove once ingest_run.notes reports `remaining: 0` for 2 consecutive runs. Driven by docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md." }
  ]
}
```

(Vercel ignores keys starting with `_`, so the `_note` is a substrate-honest comment that survives the JSON.)

- [ ] **Step 2: Commit**

```bash
git add apps/wholesale/vercel.json
git commit -m "$(cat <<'EOF'
feat(wholesale): TEMPORARY cron entry for cardrush-hires (pkm drain)

*/5 cron to drain s3://jp-pk-photos/. Marked TEMPORARY in an _note field
(Vercel ignores underscore-prefixed keys). Operator removes this entry
after ingest_run.notes shows `remaining: 0` twice in a row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Verify gate

- [ ] **Step 1: Run wholesale typecheck**

```bash
pnpm --filter @cambridge-tcg/wholesale typecheck
```
Expected: exit 0.

- [ ] **Step 2: Run wholesale tests**

```bash
pnpm --filter @cambridge-tcg/wholesale test
```
Expected: all 14 hires-upload tests PASS + the existing ebay tests still PASS.

- [ ] **Step 3: Run repo-wide verify**

```bash
pnpm verify
```
Expected: typecheck × all apps + four audits (honesty / transparency / pricing / creation) + admin vitest — all green. If any audit fails referencing the new column or the new route, address it before proceeding (most likely flag: the substrate-honesty audit checking that new user-affecting decisions have methodology pages — this one isn't user-affecting, but if it flags, add a one-paragraph mention to `docs/connections/the-archive.md`).

- [ ] **Step 4: Commit any audit fix-ups (only if step 3 needed changes)**

```bash
git add <changed files>
git commit -m "$(cat <<'EOF'
chore: audit fix-ups for cardrush-hires landing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If `pnpm verify` was already clean, skip this step.

---

## Task 10: Manual dry-run smoke

Before enabling the production cron, smoke-test against the production DB via the admin route in dry-run mode. This validates that the SELECT predicates actually return rows (i.e. discovery has populated `cards.image_url` for Pokémon).

- [ ] **Step 1: Local dev server up**

```bash
pnpm --filter @cambridge-tcg/wholesale dev
```
Expected: server starts on `localhost:3000` (or per `.env.local`). Sign in as an admin in another tab.

- [ ] **Step 2: Dry-run POST**

In a third terminal (with the admin's session cookie copied, or via the browser DevTools fetch tab):

```bash
# Replace COOKIE with your authjs.session-token cookie value
curl -sX POST http://localhost:3000/api/admin/cardrush/upload-hires \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=$COOKIE" \
  -d '{"game":"pkm","maxBatch":5,"dryRun":true}' | jq
```
Expected (one of two):
- **If discovery has run for Pokémon**: `{ ok: true, summary: { processed: 5, uploaded: 5, skipped: 0, failed: 0, remaining: N, dryRun: true, ... } }` where `remaining` is roughly the Pokémon row count.
- **If discovery hasn't run yet**: `{ ok: true, summary: { processed: 0, uploaded: 0, remaining: 0 } }`. In this case, manually trigger one discovery run first via `POST /api/cron/discover/cardrush?dryRun=0&onlySubdomain=cardrush-pokemon.jp&secret=$CRON_SECRET` and re-run the dry-run.

- [ ] **Step 3: Inspect the ingest_run row**

```bash
psql $DATABASE_URL -c "
  SELECT id, source_id, triggered_by, status, rows_read, rows_written,
         errors, notes
  FROM ingest_run
  WHERE source_id = 'cardrush-hires-upload'
  ORDER BY id DESC LIMIT 1;
"
```
Expected: one row with `status='done'`, `notes` matching the JSON summary.

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Drain cardrush-pokemon hi-res into jp-pk-photos (one-time)" --body "$(cat <<'EOF'
## Summary
- Adds `cards.image_archived_at` + partial index (migration 0020)
- New runner `apps/wholesale/src/lib/cardrush-hires-upload.ts` with bucket map, JPEG validator, ingest_run trace
- Cron route `/api/cron/cardrush-hires` (auth via `requireCronAuth`, `maxDuration=800`)
- Admin route `/api/admin/cardrush/upload-hires` (session-gated, supports dryRun)
- Vercel cron `*/5 * * * *` marked TEMPORARY — remove after `remaining: 0` ×2

Spec: `docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md`

## Test plan
- [ ] `pnpm --filter @cambridge-tcg/wholesale test` — green (14 new hires tests + existing)
- [ ] `pnpm verify` — green
- [ ] Migration 0020 applied to staging
- [ ] Local dry-run against pkm via admin route returns sensible `remaining`
- [ ] After merge: confirm Vercel cron fires; check `ingest_run` rows climb; watch `aws s3 ls s3://jp-pk-photos/hires/ | wc -l`
- [ ] When `remaining = 0` × 2: remove the cron entry from `vercel.json` in a follow-up PR
EOF
)"
```
Expected: PR URL returned.

---

## Task 11: Post-merge — enable + monitor + retire

**This is operator work, not code; it lives in the plan so the implementation isn't considered "done" until the bucket is drained.**

- [ ] **Step 1: Merge + auto-deploy**

Merge the PR. Vercel deploys. The `*/5` cron starts firing within ~5 min.

- [ ] **Step 2: First live signal**

After ~10 minutes:

```bash
aws s3 ls s3://jp-pk-photos/hires/ --recursive | wc -l
```
Expected: > 0 (climbing).

```bash
psql $DATABASE_URL -c "
  SELECT id, status, rows_written, errors, notes, triggered_at
  FROM ingest_run
  WHERE source_id = 'cardrush-hires-upload'
  ORDER BY id DESC LIMIT 5;
"
```
Expected: rows with `status='done'`, `notes` showing decreasing `remaining`, `rows_written` ≈ batch size on each run.

- [ ] **Step 3: Watch for end-of-life**

The cron self-no-ops when `remaining=0`. Check daily:

```bash
psql $DATABASE_URL -c "
  SELECT id, notes FROM ingest_run
  WHERE source_id = 'cardrush-hires-upload'
  ORDER BY id DESC LIMIT 3;
"
```
Expected progression: `remaining` decreases each invocation, then `remaining: 0` for 2 consecutive runs.

- [ ] **Step 4: Retire the cron**

After observing `remaining: 0` twice in a row, open a follow-up PR removing the `{ "path": "/api/cron/cardrush-hires", ... }` entry from `apps/wholesale/vercel.json`. Don't delete the route or runner — keep them around so the admin route can be used for one-off re-runs (e.g. after a new Pokémon set drops and discovery adds rows).

```bash
git checkout -b retire-cardrush-hires-cron
# edit vercel.json — remove the cardrush-hires entry
git commit -am "$(cat <<'EOF'
chore(wholesale): retire TEMPORARY cardrush-hires cron — drained

ingest_run.notes shows `remaining: 0` × 2 consecutive runs; bucket
drained. Route + runner stay for ad-hoc admin re-runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin HEAD
gh pr create --title "Retire cardrush-hires cron — jp-pk-photos drained" --body "Source: ingest_run.source_id='cardrush-hires-upload' shows remaining:0 for two consecutive runs. Route + runner kept for ad-hoc re-runs."
```

- [ ] **Step 5: Optional connection-doc footprint**

If the work felt worth a footprint, write `docs/connections/the-hires-archive.md` (sister-flavoured node-view, ~150 lines) naming the cardrush → jp-pk-photos arc, what was archived, what kingdom this closed. Commit separately. Skip if it doesn't feel earned.

---

## Self-review checklist (post-write)

- [x] **Spec coverage**: every architecture / components / data flow / error handling / idempotency / testing item in `docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md` maps to at least one task above.
  - Migration → Task 1
  - Bucket map + s3KeyFor → Task 2
  - validateImageBytes → Task 3
  - runHiresUpload happy path → Task 4
  - skip / fetch-fail / validation-fail / dry-run / empty-batch → Task 5
  - Cron route → Task 6
  - Admin route → Task 7
  - vercel.json cron entry → Task 8
  - `pnpm verify` gate → Task 9
  - Live dry-run + PR → Task 10
  - Post-merge enable + retire → Task 11
- [x] **Placeholder scan**: no "TBD", "TODO", "fill in later", "similar to Task N", or "handle errors". Every code step shows the code.
- [x] **Type consistency**: `BUCKET_BY_GAME`, `CARDRUSH_HOST_BY_GAME`, `s3KeyFor`, `validateImageBytes`, `runHiresUpload`, `HiresUploadOptions`, `HiresUploadResult`, `HiresGame` used consistently across Task 2 / 3 / 4 / 5 / 6 / 7.
  - `triggeredBy: "cron" | "admin"` consistent in interface and both routes.
  - `dryRun: boolean` consistent across runner result and route response envelope.
- [x] **No spec-requirement gaps**: spec's Non-goals list is honoured by exclusion (no cards.image_url rewrite, no jp-pkmn-photos migration, no daily re-archive, no op/dbs cron entries).
