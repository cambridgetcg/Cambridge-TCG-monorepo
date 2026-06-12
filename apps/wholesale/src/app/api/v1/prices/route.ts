import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, games, sets } from "@/lib/db/schema";
import { eq, gte, and, sql, gt, ilike, or, asc, desc, type SQL } from "drizzle-orm";
import { authenticateApiKey } from "../auth";
import { priceForChannel } from "@/lib/channel-pricing";

/**
 * Escape LIKE/ILIKE pattern metacharacters in user input. Without this,
 * q="L%ffy" matches "Luffy" and q="%" matches the entire catalog —
 * Postgres treats backslash as the default escape character, so escaping
 * \ % _ makes the parameter literal. (Parameterization already prevents
 * SQL injection; this prevents *pattern* injection.)
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => "\\" + m);
}

/**
 * pg_trgm availability, checked once per process. The similarity()
 * relevance path needs the extension (infra/migrations/001_enable_trgm.sql,
 * applied out-of-band) — when it's absent we degrade to card_number
 * ordering instead of throwing on every search.
 */
let trgmAvailable: boolean | null = null;
async function hasTrgm(): Promise<boolean> {
  if (trgmAvailable !== null) return trgmAvailable;
  try {
    const result = await db.execute(
      sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`,
    );
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    trgmAvailable = rows.length > 0;
    return trgmAvailable;
  } catch {
    // Transient probe failure (connection blip) — answer false for THIS
    // request but don't cache it, or one blip would silently disable
    // relevance + typo tolerance until the next deploy.
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const params = req.nextUrl.searchParams;

    // Pagination
    const limit = Math.min(Math.max(parseInt(params.get("limit") || "48", 10) || 48, 1), 500);
    const offset = Math.max(parseInt(params.get("offset") || "0", 10) || 0, 0);

    // Channel is determined by the authenticating API key; the `?channel`
    // query param is no longer honoured. A key issued for channel X can
    // only read channel X's pricing. If a caller passes `?channel=Y` we
    // log the mismatch (deprecation signal) and proceed with apiKey.channel.
    const queryChannel = params.get("channel");
    if (queryChannel && queryChannel !== apiKey.channel) {
      console.warn(
        `[/api/v1/prices] Ignoring ?channel=${queryChannel} for key with channel=${apiKey.channel}. ` +
        `Channel is now sourced from the API key; rotate the key if a different channel is needed.`,
      );
    }
    const channel = apiKey.channel;

    // Existing filters
    const gameCode = params.get("game");
    const updatedSince = params.get("updated_since");

    // New filters — q/number are pattern inputs; cap their length so a
    // pathological query can't burn planner time (the partner API has no
    // other guard on these).
    const MAX_PATTERN_LENGTH = 200;
    const q = params.get("q");
    if (q && q.length > MAX_PATTERN_LENGTH) {
      return NextResponse.json(
        { error: `q is capped at ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }
    // Exact card-number mode (kingdom-090 search fast path). Carries
    // the publisher form "<SET>-<NUMBER>" ("OP01-001"); matched on
    // case-insensitive equality (no substring wildcards) against both
    // storage shapes — card_number holding the full form, or set_code +
    // bare number. Indexed: card_number trgm GIN serves wildcard-free
    // ILIKE; set_code btree serves the split arm. Takes precedence
    // over ?q when both are sent.
    const numberEq = params.get("number");
    if (numberEq && numberEq.length > MAX_PATTERN_LENGTH) {
      return NextResponse.json(
        { error: `number is capped at ${MAX_PATTERN_LENGTH} characters` },
        { status: 400 },
      );
    }
    const sort = params.get("sort") || "card_number";
    const inStock = params.get("in_stock");
    const setCode = params.get("set");
    const category = params.get("category");
    const rarity = params.get("rarity");
    // ?skip_count=1 — callers that never read `total` (the storefront
    // search fold path) opt out of the count(*) scan; `total` comes
    // back null, substrate-honest about not having counted.
    const skipCount = params.get("skip_count") === "1";
    // ?fuzzy=1 — opt INTO the typo-tolerant similarity retry on zero
    // substring hits. Opt-in by design: existing consumers (catalog,
    // B2B partners) rely on exact zero-hit semantics, and a surprise
    // page of "closest names" rendered unlabeled would be dishonest.
    const fuzzyOptIn = params.get("fuzzy") === "1";

    const conditions = [];
    // Track the resolved gameId so subsequent filters (set lookup) can
    // scope by game. Set once when ?game is provided.
    let resolvedGameId: number | null = null;

    if (gameCode) {
      const game = await db
        .select({ id: games.id })
        .from(games)
        .where(or(eq(games.code, gameCode), eq(games.slug, gameCode)))
        .limit(1);
      if (!game.length) {
        return NextResponse.json({ error: `Game not found: ${gameCode}` }, { status: 404 });
      }
      resolvedGameId = game[0].id;
      conditions.push(eq(cards.gameId, resolvedGameId));
    }

    if (updatedSince) {
      const since = new Date(updatedSince);
      if (isNaN(since.getTime())) {
        return NextResponse.json({ error: "Invalid updated_since timestamp" }, { status: 400 });
      }
      conditions.push(gte(cards.lastSyncedAt, since));
    }

    // The q-derived condition is kept separate from `conditions` so the
    // zero-hit similarity retry below can swap it out while keeping
    // every other filter (game, set, stock, category) in place.
    let qCondition: SQL | undefined;
    if (numberEq) {
      const exact = escapeLike(numberEq);
      const lastDash = numberEq.lastIndexOf("-");
      const arms: SQL[] = [ilike(cards.cardNumber, exact)];
      if (lastDash > 0) {
        const setPart = numberEq.slice(0, lastDash);
        const numPart = escapeLike(numberEq.slice(lastDash + 1));
        // set_code is stored uppercase today; eq on upper(input) hits the
        // btree, with an ILIKE-on-number arm for case drift.
        arms.push(
          and(
            eq(cards.setCode, setPart.toUpperCase()),
            ilike(cards.cardNumber, numPart),
          )!,
        );
      }
      qCondition = or(...arms);
    } else if (q) {
      const escaped = escapeLike(q);
      qCondition = or(
        ilike(cards.cardNumber, `%${escaped}%`),
        ilike(cards.name, `%${escaped}%`),
        ilike(cards.nameEn, `%${escaped}%`),
      );
    }

    if (inStock === "true") {
      conditions.push(gt(cards.stock, 0));
    }

    if (setCode) {
      // kingdom-086 substrate fix: prefer the canonical FK (cards.set_id)
      // over the denormalized text (cards.set_code). Resolve the URL's
      // setCode to a sets.id via the (sets.code, sets.game_id) tuple, then
      // filter cards by set_id. Fall back to set_code text-match when
      // either: (a) no sets row matches (orphan-code case), or (b) the
      // backfill migration 0017 hasn't been applied yet and cards still
      // have set_id IS NULL. The OR keeps the route forward-compatible
      // with the migration and backward-compatible with pre-migration data.
      //
      // Scoping: when ?game is also provided we use that game_id; otherwise
      // we accept any sets.code match across games (rare; partner-API edge case).
      // Scope the set lookup by gameId when ?game is provided; otherwise
      // accept any sets.code match across games (partner-API edge case).
      const setWhere =
        resolvedGameId !== null
          ? and(eq(sets.code, setCode), eq(sets.gameId, resolvedGameId))
          : eq(sets.code, setCode);
      const setRow = await db
        .select({ id: sets.id })
        .from(sets)
        .where(setWhere)
        .limit(1);

      if (setRow.length > 0) {
        // Canonical FK + text fallback. Transition-safe: covers both
        // post-migration (set_id populated, fast path) and pre-migration
        // (set_id NULL, set_code text-match works).
        const sid = setRow[0].id;
        conditions.push(
          or(eq(cards.setId, sid), eq(cards.setCode, setCode))!,
        );
      } else {
        // No sets row for this code; the only path that returns rows is
        // orphan cards keyed by set_code. Substrate-honest: this means
        // either the URL was bogus or the set isn't registered. Both
        // legitimate; the per-set page renders empty either way.
        conditions.push(eq(cards.setCode, setCode));
      }
    }

    if (category === "singles" || category === "sealed") {
      conditions.push(eq(cards.category, category));
    }

    if (rarity) {
      conditions.push(eq(cards.rarity, rarity));
    }

    const allConditions = qCondition ? [...conditions, qCondition] : conditions;
    const where = allConditions.length ? and(...allConditions) : undefined;

    // Sorting
    let orderBy;
    switch (sort) {
      case "price_asc":
        orderBy = asc(cards.price);
        break;
      case "price_desc":
        orderBy = desc(cards.price);
        break;
      case "name_asc":
        orderBy = asc(cards.nameEn);
        break;
      case "relevance":
        // Trigram closeness to the query across number + both names —
        // a name search ranks "Monkey.D.Luffy" above an incidental
        // substring hit. Needs pg_trgm; degrades to card_number order.
        if (q && (await hasTrgm())) {
          orderBy = sql`GREATEST(
            similarity(${cards.cardNumber}, ${q}),
            similarity(${cards.name}, ${q}),
            similarity(coalesce(${cards.nameEn}, ''), ${q})
          ) DESC, ${cards.cardNumber} ASC`;
        } else {
          orderBy = asc(cards.cardNumber);
        }
        break;
      case "card_number":
      default:
        orderBy = asc(cards.cardNumber);
        break;
    }

    // Count total matching rows (skippable — see ?skip_count above).
    let total: number | null = null;
    if (!skipCount) {
      const [{ count }] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(cards)
        .where(where);
      total = count;
    }

    // Fetch page (include cardrushJpy + gbpJpyRate for channel pricing)
    const selection = {
      sku: cards.sku,
      cardNumber: cards.cardNumber,
      priceGbp: cards.price,
      cardrushJpy: cards.cardrushJpy,
      gbpJpyRate: cards.gbpJpyRate,
      cardCategory: cards.category,
      stock: cards.stock,
      pendingStock: cards.pendingStock,
      imageUrl: cards.imageUrl,
      name: cards.name,
      nameEn: cards.nameEn,
      updatedAt: cards.lastSyncedAt,
      setCode: cards.setCode,
      setName: cards.setName,
      rarity: cards.rarity,
      category: cards.category,
    };
    let rows = await db
      .select(selection)
      .from(cards)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Typo-tolerant retry: when a NAME-ish substring search found
    // nothing, rerun the q arm as a pg_trgm similarity match ("lufy" →
    // "Luffy"). Same non-q filters; ordered by closeness. The response
    // declares match_mode="similarity" so downstream resolvers can label
    // the reason honestly instead of claiming a substring hit.
    //
    // FIRST PAGE ONLY (offset === 0): an offset past the last substring
    // row must keep returning items: [] — paginate-until-empty consumers
    // (the catalog page, B2B partners) terminate on that, and the retry
    // has no offset of its own, so firing it there would replay page-one
    // rows at every offset forever.
    let matchMode: "substring" | "similarity" = "substring";
    if (
      rows.length === 0 &&
      offset === 0 &&
      fuzzyOptIn &&
      q &&
      !numberEq &&
      q.trim().length >= 3 &&
      (await hasTrgm())
    ) {
      try {
        // The % operator (similarity over pg_trgm.similarity_threshold,
        // default 0.3) is what the GIN trgm indexes can serve — a bare
        // similarity(...) > x call in WHERE cannot use them.
        const simCondition = sql`(
          ${cards.name} % ${q} OR
          coalesce(${cards.nameEn}, '') % ${q}
        )`;
        const simWhere = conditions.length
          ? and(...conditions, simCondition)
          : simCondition;
        const simRows = await db
          .select(selection)
          .from(cards)
          .where(simWhere)
          .orderBy(sql`GREATEST(
            similarity(${cards.name}, ${q}),
            similarity(coalesce(${cards.nameEn}, ''), ${q})
          ) DESC, ${cards.cardNumber} ASC`)
          .limit(limit);
        if (simRows.length > 0) {
          rows = simRows;
          matchMode = "similarity";
          if (!skipCount) {
            // A full page means simRows.length is a floor, not a count —
            // count the similarity predicate for a truthful total.
            if (simRows.length === limit) {
              const [{ count: simTotal }] = await db
                .select({ count: sql<number>`cast(count(*) as integer)` })
                .from(cards)
                .where(simWhere);
              total = simTotal;
            } else {
              total = simRows.length;
            }
          } else {
            total = null;
          }
        }
      } catch (err) {
        // Similarity is an enhancement, never a failure mode.
        console.warn("[/api/v1/prices] similarity retry failed:", err);
      }
    }

    // Compute channel prices if non-wholesale channel requested
    const needsChannelPrice = channel !== "wholesale";
    const items = await Promise.all(
      rows.map(async (r) => {
        let channelPrice: number | null = null;
        if (needsChannelPrice && r.cardrushJpy && r.gbpJpyRate) {
          const breakdown = await priceForChannel(r.cardrushJpy, r.gbpJpyRate, channel, r.cardCategory);
          channelPrice = breakdown.price;
        }

        return {
          sku: r.sku,
          card_number: r.cardNumber,
          price_gbp: r.priceGbp,
          ...(needsChannelPrice && { channel_price: channelPrice ?? r.priceGbp }),
          ...(needsChannelPrice && { channel }),
          stock: r.stock,
          pending_stock: r.pendingStock,
          image_url: r.imageUrl,
          name: r.nameEn || r.name,
          name_en: r.nameEn,
          set_code: r.setCode,
          set_name: r.setName,
          rarity: r.rarity,
          category: r.category,
          updated_at: r.updatedAt,
        };
      }),
    );

    return NextResponse.json({
      total,
      count: rows.length,
      limit,
      offset,
      channel: apiKey.channel,
      match_mode: matchMode,
      items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/prices] Error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
