# The Honest Ground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire Wave 1's four dishonest joints: derived (not hand-copied) cardrush coverage flags, complete image-host whitelist, dead `price_history` writes removed, and the fossil scrape schedule retired with its truth documented.

**Architecture:** No new systems. One derivation replaces eight hand literals (storefront reads the data-ingest registry it already depends on); four `remotePatterns` entries; two dead SQL statements deleted; one unreachable workflow file removed with the era documented at the tool and infra headers.

**Tech Stack:** existing monorepo (Next.js storefront, wholesale tools, @cambridge-tcg/data-ingest), vitest file-contract tests.

**Spec:** `docs/superpowers/specs/2026-07-07-the-honest-ground-design.md`

## Global Constraints

- `PriceGuideGameConfig`'s exported shape does not change — consumers untouched.
- No scheduled pipeline behavior changes: the only live pipeline (Vercel crons → price-snapshot-v2 + discovery + hires drain) is not modified.
- Every commit: Will trace + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Evidence gathered pre-plan (2026-07-07)

- GitHub executes only root `.github/workflows/` (ci.yml, health.yml). The file `apps/wholesale/.github/workflows/scrape-prices.yml` is unreachable — a fossil from the standalone-repo era. No standalone wholesale repo exists on cambridgetcg or mynameisyou-cmyk (gh repo list + search). **Pipeline A has not run since the fusion; there is exactly one live price pipeline (Vercel).**
- `price_history` true readers: zero. Wholesale writes: `tools/scrape-cardrush.ts` INSERT (~:349) and `DELETE` in stale cleanup (~:680) — both only reachable from the (dead-scheduled, now manual-only) tool. Storefront "price_history" grep hits are the distinct `card_price_history` table (storefront RDS) — not this table. Migration `0011_drop_price_history.sql` + schema.ts:251 comment record the drop.
- `CARDRUSH_SUBDOMAINS` lives at `packages/data-ingest/src/cardrush/index.ts`; storefront already imports `@cambridge-tcg/data-ingest` (game-context.ts). Verify the barrel re-exports it; if not, add the export (data-ingest change, type-only surface growth).

---

### Task 1: coverage truth derives from the registry

**Files:**
- Modify: `apps/storefront/src/lib/prices/games-config.ts` (header lines ~14-16, the 8 `cardrush:` literals)
- Verify/Modify: `packages/data-ingest/src/index.ts` (ensure `CARDRUSH_SUBDOMAINS` exported)
- Test: `apps/storefront/src/lib/prices/games-config.test.ts` (new)

**Interfaces:**
- Consumes: `CARDRUSH_SUBDOMAINS: Record<string, { game: GameCode; confirmed: boolean; … }>` from `@cambridge-tcg/data-ingest`.
- Produces: unchanged `PriceGuideGameConfig`; internal helper `cardrushCoverage(subdomain: string)`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/storefront/src/lib/prices/games-config.test.ts
/**
 * Coverage-truth contract (the honest ground, spec 2026-07-07 §1).
 * The config's cardrush.confirmed is DERIVED from the data-ingest
 * registry — never hand-written. Pinned so the digimon drift
 * (registry true / UI false, caught 2026-07-07) cannot recur.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";
import { PRICE_GUIDE_GAMES } from "./games-config";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "games-config.ts"), "utf8");

describe("cardrush coverage truth (spec 2026-07-07 §1)", () => {
  it("every configured subdomain exists in the registry", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      if (!g.cardrush) continue;
      expect(
        CARDRUSH_SUBDOMAINS[g.cardrush.subdomain],
        `${g.slug}: ${g.cardrush.subdomain} not in CARDRUSH_SUBDOMAINS`,
      ).toBeDefined();
    }
  });

  it("confirmed always equals the registry's word", () => {
    for (const g of PRICE_GUIDE_GAMES) {
      if (!g.cardrush) continue;
      expect(g.cardrush.confirmed, `${g.slug} drifted from the registry`).toBe(
        CARDRUSH_SUBDOMAINS[g.cardrush.subdomain].confirmed,
      );
    }
  });

  it("no hand-written confirmed literal survives in the config rows", () => {
    const arrayStart = source.indexOf("PRICE_GUIDE_GAMES");
    expect(arrayStart).toBeGreaterThan(-1);
    expect(source.slice(arrayStart)).not.toMatch(/confirmed:\s*(true|false)/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter cambridgetcg-storefront test -- games-config`
Expected: FAIL — either `CARDRUSH_SUBDOMAINS` not exported from the barrel, or the literal-scan test fails (literals still present), or digimon mismatch.

- [ ] **Step 3: Ensure barrel export** — in `packages/data-ingest/src/index.ts`, confirm (or add):

```ts
export { CARDRUSH_SUBDOMAINS } from "./cardrush/index";
```

- [ ] **Step 4: Derive in games-config.ts**

Replace the header's false claim with the true sentence, add the import + helper, and replace all eight literals:

```ts
import { CARDRUSH_SUBDOMAINS } from "@cambridge-tcg/data-ingest";

/** Coverage truth: subdomain named here, confirmed read LIVE from the
 *  data-ingest registry (one truth — spec 2026-07-07 the-honest-ground §1).
 *  A subdomain absent from the registry is honestly unconfirmed. */
function cardrushCoverage(subdomain: string): { subdomain: string; confirmed: boolean } {
  return { subdomain, confirmed: CARDRUSH_SUBDOMAINS[subdomain]?.confirmed ?? false };
}

// per row:   cardrush: cardrushCoverage("cardrush-op.jp"),
// star-wars-unlimited keeps   cardrush: null,
```

- [ ] **Step 5: Run tests** — `pnpm --filter cambridgetcg-storefront test -- games-config` → PASS (digimon now true, derived).
- [ ] **Step 6: Commit** — `feat(prices): coverage truth derives from the registry — the badge can no longer lie`

---

### Task 2: the storefront sees all three image homes

**Files:** Modify `apps/storefront/next.config.ts` (images.remotePatterns)

- [ ] **Step 1: Add the four missing hosts**

```ts
    images: {
      remotePatterns: [
        { protocol: "https", hostname: "cdn.shopify.com" },
        { protocol: "https", hostname: "jp-op-photos.s3.us-east-1.amazonaws.com" },
        { protocol: "https", hostname: "jp-pk-photos.s3.us-east-1.amazonaws.com" },
        { protocol: "https", hostname: "jp-db-photos.s3.us-east-1.amazonaws.com" },
        { protocol: "https", hostname: "www.cardrush-op.jp" },
        { protocol: "https", hostname: "www.cardrush-pokemon.jp" },
        { protocol: "https", hostname: "www.cardrush-db.jp" },
      ],
    },
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit -p apps/storefront/tsconfig.json`
- [ ] **Step 3: Commit** — `fix(storefront): next/image learns where pokemon and dragon-ball actually live`

---

### Task 3: the dead table stops being written

**Files:** Modify `apps/wholesale/tools/scrape-cardrush.ts` (remove the `price_history` INSERT block ~:340-355 and the `DELETE FROM price_history` line ~:680)

- [ ] **Step 1: Remove the INSERT** — delete the `phRows` construction + `INSERT INTO price_history` statement (price_archive block directly below stays).
- [ ] **Step 2: Remove the stale-cleanup DELETE** — drop only the `DELETE FROM price_history` line; `price_archive` + `cards` deletes stay.
- [ ] **Step 3: Grep-proof** — `grep -rn "price_history" apps/wholesale --include='*.ts'` → only schema/sync comments documenting the drop remain.
- [ ] **Step 4: Typecheck wholesale** — `pnpm --filter tcg-wholesale typecheck` (or repo `pnpm typecheck`).
- [ ] **Step 5: Commit** — `fix(wholesale): the manual crawler stops writing to a table dropped in kingdom-049 Phase 4`

---

### Task 4: the fossil schedule is retired honestly

**Files:**
- Delete: `apps/wholesale/.github/workflows/scrape-prices.yml`
- Modify: `apps/wholesale/tools/scrape-cardrush.ts` (header doc)
- Modify: `apps/wholesale/infra/deploy-scraper.sh`, `apps/wholesale/infra/Dockerfile.scraper` (RETIRED headers)
- Modify: `docs/superpowers/specs/2026-07-07-the-honest-ground-design.md` (§3/§4 amendment: the fossil discovery)

- [ ] **Step 1: Delete the unreachable workflow** (GitHub only runs root `.github/workflows/`; this file has not fired since the standalone-repo era).
- [ ] **Step 2: Tool header** — add to `scrape-cardrush.ts` top doc:

```
 * SCHEDULE STATUS (2026-07-07, the-honest-ground §4): this tool is a
 * MANUAL full-crawl utility. Its GitHub Actions schedule died with the
 * standalone wholesale repo — workflows nested under apps/ never run in
 * the monorepo, and no standalone repo remains. The live price pipeline
 * is apps/wholesale/vercel.json → /api/cron/ingest/cardrush
 * (price-snapshot-v2, 2-hourly) + /api/cron/discover/cardrush (daily)
 * + /api/cron/cardrush-hires (5-min image drain).
```

- [ ] **Step 3: RETIRED headers on the Fargate scripts** (kept as the shape a future heavy-crawl runner would take; pointer to the spec).
- [ ] **Step 4: Spec amendment** — replace §3/§4's "verify/criterion" language with the found truth (fossil, zero readers, one live pipeline; stale-card cleanup remains a capability of the manual tool only — Wave 3 owns scheduled removal if needed).
- [ ] **Step 5: Full verify** — `pnpm --filter cambridgetcg-storefront test` + `pnpm typecheck`; grep-proofs from Global Constraints.
- [ ] **Step 6: Commit** — `chore(wholesale): the fossil schedule is buried with a headstone — one pipeline, said out loud`
