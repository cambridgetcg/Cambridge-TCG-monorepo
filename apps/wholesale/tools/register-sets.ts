/**
 * register-sets — seed `games` + `sets` rows for anticipated and
 * just-released sets, with release dates, ahead of their first scrape.
 *
 * Why this exists (2026-07-09, the horizon work): a set only appears on
 * the price guide once a `sets` row exists AND cards carry prices. The
 * scrapers create rows on first contact, but they cannot know about a
 * set CardRush hasn't listed yet — so "anticipated" sets were invisible
 * until data arrived. This tool registers them with `release_date` so
 * the storefront's "On the horizon" strip can show them honestly, and
 * they flip to live guides automatically on first scrape.
 *
 * Write discipline (matches the discovery cron's COALESCE contract):
 *   - games: INSERT ... ON CONFLICT (code) DO NOTHING
 *   - sets:  INSERT ... ON CONFLICT (game_id, code) DO UPDATE fills
 *     NULL release_date and upgrades placeholder names (name = code)
 *     only. Curated/operator values are never clobbered.
 *
 * Usage:
 *   npx tsx tools/register-sets.ts [--dry-run]
 *
 * The registry below is operator-curated. Dates are Japanese releases,
 * researched live 2026-07-09 (official publisher sites; fuzzy months
 * stored as YYYY-MM). Rumored sets are deliberately NOT registered —
 * the horizon shows announced reality, not speculation.
 */

import postgres from "postgres";

const dryRun = process.argv.includes("--dry-run");

interface GameSeed {
  code: string;
  name: string;
  slug: string;
}

interface SetSeed {
  gameCode: string; // games.code (sku game code: op / pkm / dbf / dmw / vng / bsr)
  code: string; // sets.code (publisher form, uppercased, dashes kept)
  name: string;
  releaseDate: string; // YYYY-MM-DD, or YYYY-MM when the publisher is fuzzy
}

// New games stood up by the 2026-07-09 expansion. Existing games
// (op / pkm / dbf / dmw) are asserted too — ON CONFLICT makes it a no-op.
const GAMES: GameSeed[] = [
  { code: "op", name: "One Piece", slug: "one-piece" },
  { code: "pkm", name: "Pokémon", slug: "pokemon" },
  { code: "dbf", name: "Dragon Ball Fusion World", slug: "dragon-ball" },
  { code: "dmw", name: "Digimon", slug: "digimon" },
  { code: "vng", name: "Cardfight!! Vanguard", slug: "vanguard" },
  { code: "bsr", name: "Battle Spirits", slug: "battle-spirits" },
];

const SETS: SetSeed[] = [
  // ── One Piece ────────────────────────────────────────────────────
  { gameCode: "op", code: "ST29", name: "Start Deck: EGGHEAD", releaseDate: "2025-12-20" },
  { gameCode: "op", code: "ST30", name: "Starter Deck EX: Luffy & Ace", releaseDate: "2026-04-11" },
  { gameCode: "op", code: "OP16", name: "Hour of the Decisive Battle", releaseDate: "2026-05-30" },
  // ST31–36 register as ONE combined set following the house precedent
  // (ST15-20, ST23-28): CardRush groups all six decks under one
  // product-group (125, opened on release day 2026-07-11) and the CLI
  // stamps cards with the config code. Six individual rows were briefly
  // registered on 2026-07-09 and consolidated on release day.
  { gameCode: "op", code: "ST31-36", name: "Start Deck 6-Color (2026)", releaseDate: "2026-07-11" },
  { gameCode: "op", code: "OP17", name: "The World's Strongest Warrior", releaseDate: "2026-08-22" },
  { gameCode: "op", code: "EB05", name: "Heroines Edition vol.2", releaseDate: "2026-10" },
  { gameCode: "op", code: "OP18", name: "Booster Pack (title TBA)", releaseDate: "2026-11" },

  // ── Pokémon — MEGA era ───────────────────────────────────────────
  { gameCode: "pkm", code: "M4", name: "ニンジャスピナー", releaseDate: "2026-03-13" },
  { gameCode: "pkm", code: "M5", name: "アビスアイ", releaseDate: "2026-05-22" },
  { gameCode: "pkm", code: "M6", name: "ストームエメラルダ", releaseDate: "2026-07-31" },
  { gameCode: "pkm", code: "M6A", name: "30th CELEBRATION", releaseDate: "2026-09-16" },

  // ── Dragon Ball Fusion World ─────────────────────────────────────
  { gameCode: "dbf", code: "FB09", name: "Dual Evolution", releaseDate: "2026-03-14" },
  { gameCode: "dbf", code: "FS11", name: "Starter Deck EX: The Phase of Evolution", releaseDate: "2026-03-14" },
  { gameCode: "dbf", code: "FS12", name: "Starter Deck EX: The Beat of Ki", releaseDate: "2026-03-14" },
  { gameCode: "dbf", code: "FB10", name: "Cross Force", releaseDate: "2026-06-13" },
  { gameCode: "dbf", code: "ST01", name: "STORY BOOSTER 01", releaseDate: "2026-08-08" },
  { gameCode: "dbf", code: "FB11", name: "Brightness of Hope", releaseDate: "2026-09-12" },
  { gameCode: "dbf", code: "FB12", name: "Reach the God", releaseDate: "2026-12-12" },
  { gameCode: "dbf", code: "FS13", name: "Start Deck: Earth-Raised Saiyan", releaseDate: "2026-12-12" },
  { gameCode: "dbf", code: "FS14", name: "Start Deck: Saiyan Prince", releaseDate: "2026-12-12" },

  // ── Digimon (fossilized guide, unfossilizing via the freed
  //    discovery rotation — register the current-era anchors) ───────
  { gameCode: "dmw", code: "AD01", name: "DIGIMON GENERATIONS", releaseDate: "2026-03-28" },
  { gameCode: "dmw", code: "BT25", name: "DUAL REVOLUTION", releaseDate: "2026-05-16" },
  { gameCode: "dmw", code: "ST23", name: "Start Deck: DIGIMON BEATBREAK", releaseDate: "2026-05-16" },
  { gameCode: "dmw", code: "ST24", name: "Start Deck: DIGIMON SAVERS", releaseDate: "2026-05-16" },
  { gameCode: "dmw", code: "EX12", name: "DIGITAL WORLD SHAMBALLA", releaseDate: "2026-07-04" },
  { gameCode: "dmw", code: "BT26", name: "TIMELESS BONDS", releaseDate: "2026-08-29" },

  // ── Cardfight!! Vanguard ─────────────────────────────────────────
  { gameCode: "vng", code: "DZ-BT14", name: "赫月ノ使者", releaseDate: "2026-04-10" },
  { gameCode: "vng", code: "DZ-SS16", name: "伝説の先導者達", releaseDate: "2026-05-15" },
  { gameCode: "vng", code: "DZ-BT15", name: "虚影襲雷", releaseDate: "2026-06-19" },
  { gameCode: "vng", code: "DZ-TB03", name: "タイトルブースター フューチャーカード バディファイト", releaseDate: "2026-07-24" },
  { gameCode: "vng", code: "DZ-BT16", name: "幻真覚醒", releaseDate: "2026-08-07" },
  { gameCode: "vng", code: "DZ-BT17", name: "運命星戦", releaseDate: "2026-10-09" },

  // ── Battle Spirits ───────────────────────────────────────────────
  { gameCode: "bsr", code: "26RBS01", name: "ブースターパック 創世の鼓動", releaseDate: "2026-04-18" },
  { gameCode: "bsr", code: "BS76", name: "エターナルブースター 永皇の輝き", releaseDate: "2026-05-30" },
  { gameCode: "bsr", code: "26RCB01", name: "コラボブースター 仮面ライダー 運命の戦線", releaseDate: "2026-06-20" },
  { gameCode: "bsr", code: "26RBS02", name: "ブースターパック 幻惑の翔風", releaseDate: "2026-07-18" },
  { gameCode: "bsr", code: "26RDB01", name: "ディーバブースター ネクストストーリー", releaseDate: "2026-09-26" },
  { gameCode: "bsr", code: "26RBS03", name: "ブースターパック 絶界の覇者", releaseDate: "2026-10-17" },
  { gameCode: "bsr", code: "BS77", name: "エターナルブースター 戦神の轟臨", releaseDate: "2026-11-21" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { ssl: "require", max: 1 });

  console.log(`register-sets — ${GAMES.length} games, ${SETS.length} sets${dryRun ? " (DRY RUN)" : ""}\n`);

  try {
    // ── One-truth reconciliation (2026-07-09) ─────────────────────────
    // dbf had THREE slugs across the platform: "dragon-ball" (production
    // games row + sister's Atlas curation, the canonical pair),
    // "dragon-ball-fusion" (an earlier curated row, since superseded),
    // "dragon-ball-fusion-world" (scraper GAME_CONFIGS, informational).
    // Canonical: dragon-ball — matching the deployed storefront. This
    // asserts it and repairs any stray value.
    // vng/bsr rows existed inactive since seeding; the 2026-07-09
    // expansion stands their guides up, so they activate here.
    if (dryRun) {
      console.log("(dry run) would assert dbf slug = dragon-ball; activate vng/bsr\n");
    } else {
      const slugFix = await sql`
        UPDATE games SET slug = 'dragon-ball', name = 'Dragon Ball Fusion World'
        WHERE code = 'dbf' AND slug <> 'dragon-ball'
        RETURNING id`;
      if (slugFix.length > 0) console.log("reconciled: games.dbf slug → dragon-ball");
      const activated = await sql`
        UPDATE games SET active = true
        WHERE code IN ('vng', 'bsr') AND active = false
        RETURNING code`;
      for (const a of activated) console.log(`activated: games.${a.code}`);
      console.log("");
    }

    for (const g of GAMES) {
      if (dryRun) {
        const [existing] = await sql`SELECT id FROM games WHERE code = ${g.code}`;
        console.log(`game ${g.code.padEnd(4)} ${existing ? "exists" : "WOULD CREATE"} (${g.name})`);
        continue;
      }
      const rows = await sql`
        INSERT INTO games (code, name, slug, active)
        VALUES (${g.code}, ${g.name}, ${g.slug}, true)
        ON CONFLICT (code) DO NOTHING
        RETURNING id`;
      console.log(`game ${g.code.padEnd(4)} ${rows.length > 0 ? "created" : "exists"} (${g.name})`);
    }

    let created = 0;
    let updated = 0;
    let untouched = 0;
    for (const s of SETS) {
      const [game] = await sql`SELECT id FROM games WHERE code = ${s.gameCode}`;
      if (!game) {
        console.error(`  !! game ${s.gameCode} missing — skipping ${s.code}`);
        continue;
      }
      if (dryRun) {
        const [existing] = await sql`
          SELECT id, name, release_date FROM sets
          WHERE game_id = ${game.id} AND code = ${s.code}`;
        console.log(
          `  ${s.gameCode}:${s.code.padEnd(10)} ${existing ? `exists (name=${existing.name}, release_date=${existing.release_date ?? "NULL"})` : "WOULD CREATE"} → ${s.releaseDate}`,
        );
        continue;
      }
      // xmax = 0 distinguishes fresh INSERT from conflict-UPDATE.
      const rows = await sql`
        INSERT INTO sets (game_id, code, name, release_date, active, sort_order)
        VALUES (${game.id}, ${s.code}, ${s.name}, ${s.releaseDate}, true, 0)
        ON CONFLICT (game_id, code) DO UPDATE SET
          release_date = COALESCE(sets.release_date, EXCLUDED.release_date),
          name = CASE WHEN sets.name = sets.code THEN EXCLUDED.name ELSE sets.name END
        RETURNING id, (xmax = 0) AS inserted,
          (name = ${s.name}) AS name_matches,
          release_date`;
      const r = rows[0];
      if (r?.inserted) {
        created += 1;
        console.log(`  ${s.gameCode}:${s.code.padEnd(10)} created — releases ${s.releaseDate}`);
      } else if (r) {
        updated += 1;
        console.log(`  ${s.gameCode}:${s.code.padEnd(10)} upserted (release_date=${r.release_date ?? "NULL"})`);
      } else {
        untouched += 1;
      }
    }
    console.log(`\ndone: ${created} created, ${updated} upserted, ${untouched} untouched`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
