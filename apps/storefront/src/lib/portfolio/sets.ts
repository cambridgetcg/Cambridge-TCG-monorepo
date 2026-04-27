// Set-completion progress for collectors.
//
// portfolio_cards has what the user owns. card_set_cards has the
// master list per set. The lib joins them to compute owned/total/
// missing/by-rarity, the canonical TCG-collector "I'm 87/120 on
// OP01" surface.
//
// Variant handling: a card master can have multiple rows for the
// same card_number (base art + alt art + foil). The default
// completion view treats one OWNED copy of ANY variant as covering
// the card_number — collectors who pursue "all variants" can
// switch to the variants-strict view.
//
// Discriminated-union returns mirror the rest of the codebase.

import { query } from "@/lib/db";

export interface CardSet {
  set_code: string;
  set_name: string;
  game: string;
  total_cards: number;
  released_at: string | null;
  cover_image_url: string | null;
}

export interface SetMasterCard {
  set_code: string;
  card_number: string;
  sku: string;
  card_name: string;
  rarity: string | null;
  image_url: string | null;
  variant: string;
}

export interface SetProgress {
  set_code: string;
  set_name: string;
  game: string;
  total_cards: number;
  // Number of distinct card_numbers the user owns at least one copy of.
  // (variant-loose by default — see SetProgressOptions.variantsStrict)
  owned_unique: number;
  completion_pct: number;
  // Total physical copies the user has from this set, summed across
  // all variants and card_numbers. owned_copies ≥ owned_unique.
  owned_copies: number;
  by_rarity: Array<{ rarity: string; owned: number; total: number }>;
}

export interface SetProgressDetail extends SetProgress {
  // Full checklist — both owned and missing. UI uses this to render
  // a complete grid with owned cards highlighted.
  cards: Array<SetMasterCard & {
    owned_count: number;
    is_owned: boolean;
  }>;
}

export interface SetProgressOptions {
  // When true, "owned_unique" counts each (card_number, variant) pair
  // separately. The default groups variants together.
  variantsStrict?: boolean;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

// ── Import master ──
//
// Idempotent. Each row keys on (set_code, card_number, variant), so
// re-running with the same input is a no-op. Updates total_cards on
// the parent set row at the end.
//
// In production this is called from an admin route or a cron that
// pulls from the wholesale catalogue. Tests seed directly.

export async function importSetMaster(input: {
  setCode: string;
  setName: string;
  game: string;
  releasedAt?: string | null;
  coverImageUrl?: string | null;
  cards: Array<{
    card_number: string;
    sku: string;
    card_name: string;
    rarity?: string | null;
    image_url?: string | null;
    variant?: string;
  }>;
}): Promise<Result<{ inserted: number; total: number }>> {
  if (!input.setCode?.trim() || !input.setName?.trim() || !input.game?.trim()) {
    return { ok: false, reason: "setCode, setName, and game are required.", status: 400 };
  }
  if (!Array.isArray(input.cards) || input.cards.length === 0) {
    return { ok: false, reason: "cards must be a non-empty array.", status: 400 };
  }

  await query(
    `INSERT INTO card_sets (set_code, game, set_name, released_at, cover_image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (set_code) DO UPDATE
       SET set_name = EXCLUDED.set_name,
           game = EXCLUDED.game,
           released_at = COALESCE(EXCLUDED.released_at, card_sets.released_at),
           cover_image_url = COALESCE(EXCLUDED.cover_image_url, card_sets.cover_image_url),
           updated_at = NOW()`,
    [input.setCode, input.game, input.setName,
     input.releasedAt ?? null, input.coverImageUrl ?? null],
  );

  // Bulk insert with ON CONFLICT for idempotency. Build a single
  // VALUES list rather than N round trips.
  let inserted = 0;
  for (const c of input.cards) {
    if (!c.card_number?.trim() || !c.sku?.trim() || !c.card_name?.trim()) continue;
    const r = await query(
      `INSERT INTO card_set_cards
         (set_code, card_number, sku, card_name, rarity, image_url, variant)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (set_code, card_number, variant) DO UPDATE
         SET sku = EXCLUDED.sku,
             card_name = EXCLUDED.card_name,
             rarity = EXCLUDED.rarity,
             image_url = COALESCE(EXCLUDED.image_url, card_set_cards.image_url)
       RETURNING (xmax = 0) AS was_insert`,
      [input.setCode, c.card_number, c.sku, c.card_name,
       c.rarity ?? null, c.image_url ?? null, c.variant ?? ""],
    );
    if (r.rows[0]?.was_insert) inserted++;
  }

  // Refresh total_cards cache
  const total = await query(
    `UPDATE card_sets
        SET total_cards = (SELECT COUNT(*) FROM card_set_cards WHERE set_code = $1),
            updated_at = NOW()
      WHERE set_code = $1
      RETURNING total_cards`,
    [input.setCode],
  );

  return { ok: true, value: { inserted, total: total.rows[0]?.total_cards ?? 0 } };
}

// ── Per-set progress ──

export async function getSetProgress(
  userId: string, setCode: string, opts: SetProgressOptions = {},
): Promise<Result<SetProgress>> {
  const setRows = await query(
    `SELECT set_code, set_name, game, total_cards FROM card_sets WHERE set_code = $1`,
    [setCode],
  );
  if (setRows.rows.length === 0) {
    return { ok: false, reason: "Set not found.", status: 404 };
  }
  const set = setRows.rows[0];

  // owned_unique: distinct card_numbers (or card_number+variant when
  // strict) the user has at least one copy of.
  const groupCols = opts.variantsStrict ? "card_number, variant" : "card_number";
  const ownedUniqueRows = await query(
    `SELECT COUNT(*)::int AS n FROM (
       SELECT DISTINCT m.${groupCols}
         FROM card_set_cards m
         JOIN portfolio_cards p ON p.sku = m.sku AND p.user_id = $2
        WHERE m.set_code = $1
     ) t`,
    [setCode, userId],
  );
  const ownedUnique = ownedUniqueRows.rows[0].n;

  // owned_copies: sum of quantity across all owned cards in this set.
  const ownedCopiesRows = await query(
    `SELECT COALESCE(SUM(p.quantity), 0)::int AS n
       FROM card_set_cards m
       JOIN portfolio_cards p ON p.sku = m.sku
      WHERE m.set_code = $1 AND p.user_id = $2`,
    [setCode, userId],
  );
  const ownedCopies = ownedCopiesRows.rows[0].n;

  // by_rarity breakdown — distinct card_numbers per rarity bucket.
  const byRarityRows = await query(
    `SELECT
        COALESCE(m.rarity, 'unknown') AS rarity,
        COUNT(DISTINCT m.card_number)::int AS total,
        COUNT(DISTINCT m.card_number) FILTER (
          WHERE m.sku IN (SELECT sku FROM portfolio_cards WHERE user_id = $2)
        )::int AS owned
       FROM card_set_cards m
      WHERE m.set_code = $1
      GROUP BY COALESCE(m.rarity, 'unknown')
      ORDER BY total DESC`,
    [setCode, userId],
  );

  // total_cards for the percentage. When variantsStrict, total is
  // every row in card_set_cards; otherwise it's distinct card_numbers.
  const denominator = opts.variantsStrict
    ? set.total_cards
    : (await query(
        `SELECT COUNT(DISTINCT card_number)::int AS n FROM card_set_cards WHERE set_code = $1`,
        [setCode],
      )).rows[0].n;

  const completion_pct = denominator > 0
    ? Math.round((ownedUnique / denominator) * 1000) / 10
    : 0;

  return {
    ok: true,
    value: {
      set_code: set.set_code,
      set_name: set.set_name,
      game: set.game,
      total_cards: denominator,
      owned_unique: ownedUnique,
      completion_pct,
      owned_copies: ownedCopies,
      by_rarity: byRarityRows.rows.map((r) => ({
        rarity: r.rarity, owned: r.owned, total: r.total,
      })),
    },
  };
}

// ── Per-set checklist (UI: full grid of owned + missing) ──

export async function getSetDetail(
  userId: string, setCode: string,
): Promise<Result<SetProgressDetail>> {
  const progress = await getSetProgress(userId, setCode);
  if (!progress.ok) return progress;

  const cards = await query(
    `SELECT m.set_code, m.card_number, m.sku, m.card_name, m.rarity,
            m.image_url, m.variant,
            COALESCE(SUM(p.quantity), 0)::int AS owned_count
       FROM card_set_cards m
       LEFT JOIN portfolio_cards p ON p.sku = m.sku AND p.user_id = $2
      WHERE m.set_code = $1
      GROUP BY m.set_code, m.card_number, m.sku, m.card_name, m.rarity,
               m.image_url, m.variant
      ORDER BY m.card_number ASC, m.variant ASC`,
    [setCode, userId],
  );

  return {
    ok: true,
    value: {
      ...progress.value,
      cards: cards.rows.map((r) => ({
        set_code: r.set_code,
        card_number: r.card_number,
        sku: r.sku,
        card_name: r.card_name,
        rarity: r.rarity,
        image_url: r.image_url,
        variant: r.variant,
        owned_count: r.owned_count,
        is_owned: r.owned_count > 0,
      })),
    },
  };
}

// ── Overview: all sets with this user's progress ──
//
// Used on /account/sets to render the grid. Joins are kept narrow
// — just the per-set counts — so the page renders fast even with
// many sets.

export async function listSetsWithProgress(
  userId: string, options: { game?: string; minOwned?: number } = {},
): Promise<Array<SetProgress & { cover_image_url: string | null; released_at: string | null }>> {
  const params: unknown[] = [userId];
  let where = "";
  if (options.game) {
    params.push(options.game);
    where = `WHERE s.game = $${params.length}`;
  }

  // total_cards on the card_sets row counts EACH variant separately
  // (it's COUNT(*) over card_set_cards). Owned counts use
  // COUNT(DISTINCT card_number) — variants-loose. Mixing the two
  // produces nonsense percentages (6/7 = 85% when the user actually
  // owns every card_number). Compute the loose denominator inline so
  // numerator + denominator share a counting basis.
  const r = await query(
    `SELECT
        s.set_code, s.set_name, s.game,
        s.cover_image_url, s.released_at,
        COALESCE(distinct_total.n, 0)::int AS total_cards,
        COALESCE(owned.unique_count, 0)::int AS owned_unique,
        COALESCE(owned.copy_count, 0)::int AS owned_copies
       FROM card_sets s
       LEFT JOIN (
         SELECT set_code, COUNT(DISTINCT card_number)::int AS n
           FROM card_set_cards GROUP BY set_code
       ) distinct_total ON distinct_total.set_code = s.set_code
       LEFT JOIN (
         SELECT m.set_code,
                COUNT(DISTINCT m.card_number)::int AS unique_count,
                SUM(p.quantity)::int AS copy_count
           FROM card_set_cards m
           JOIN portfolio_cards p ON p.sku = m.sku AND p.user_id = $1
          GROUP BY m.set_code
       ) owned ON owned.set_code = s.set_code
       ${where}
       ORDER BY s.released_at DESC NULLS LAST, s.set_code ASC`,
    params,
  );

  const minOwned = options.minOwned ?? 0;
  return r.rows
    .map((row) => ({
      set_code: row.set_code,
      set_name: row.set_name,
      game: row.game,
      total_cards: row.total_cards,
      owned_unique: row.owned_unique,
      owned_copies: row.owned_copies,
      completion_pct: row.total_cards > 0
        ? Math.round((row.owned_unique / row.total_cards) * 1000) / 10
        : 0,
      by_rarity: [],   // overview is summary-only; per-rarity in detail
      cover_image_url: row.cover_image_url,
      released_at: row.released_at,
    }))
    .filter((s) => s.owned_unique >= minOwned);
}

// ── List ALL known sets (for the admin browser / public catalog) ──

export async function listAllSets(game?: string): Promise<CardSet[]> {
  const r = game
    ? await query(`SELECT * FROM card_sets WHERE game = $1 ORDER BY released_at DESC NULLS LAST`, [game])
    : await query(`SELECT * FROM card_sets ORDER BY released_at DESC NULLS LAST`);
  return r.rows as CardSet[];
}
