// ingest-bandai-en — the "run once per new set release" official-data job.
//
// Fetches a Bandai official EN cardlist (One Piece: one page per series, all
// cards + stats server-rendered), parses it with the shared bandai-en parser,
// and upserts card_texts: effect_text (verbatim rules, served WITH attribution)
// + card_type + a JSONB `attributes` bag of the factual game stats (cost, power,
// colour, counter, attribute, category, type/feature). One row per BASE card key
// (parallels share the same text/stats). Attribution comes from the per-game
// config (the publisher copyright line).
//
//   DATABASE_URL=... node apps/storefront/scripts/ingest-bandai-en.mjs op [series_id ...]
//
// With no series ids it discovers them from the cardlist <select>. Idempotent
// (ON CONFLICT (sku,lang) DO UPDATE). Currently wired for op (One Piece);
// dbf uses a per-card detail flow (a follow-up mode). NOT legal advice — the
// recorded rule (docs/EN-CARD-DATA.md, /legal/card-images) governs publication.

import pg from "pg";
import { parseCardlistPage, parseSeriesOptions, BANDAI_EN_GAMES } from "@cambridge-tcg/data-ingest";

const GAME = process.argv[2] || "op";
const explicitSeries = process.argv.slice(3);
const cfg = BANDAI_EN_GAMES[GAME];
if (!cfg || !cfg.implemented) { console.error(`game ${GAME} not implemented`); process.exit(1); }
const UA = "Mozilla/5.0 (compatible; CambridgeTCG-catalogue/1.0; +https://cambridgetcg.com/legal/card-images)";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const enKey = (game, set, number) => `${game}-${set}-${number}-en`.toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

// 1. discover series ids (or use explicit)
let series = explicitSeries;
if (series.length === 0) {
  const baseHtml = await getHtml(cfg.series_url(""));
  series = parseSeriesOptions(baseHtml).map((o) => o.id);
  console.log(`discovered ${series.length} series for ${GAME}`);
}

const seen = new Set();
let upserts = 0, cards = 0;
for (const sid of series) {
  const url = cfg.series_url(sid);
  let html;
  try { html = await getHtml(url); } catch (e) { console.error(`  series ${sid}: ${e.message}`); continue; }
  const parsed = parseCardlistPage(html, url, GAME, new Date().toISOString());
  cards += parsed.length;
  for (const c of parsed) {
    if (!c.card_number || !c.card_number.includes("-")) continue;
    const [set, number] = c.card_number.split("-");
    const key = enKey(GAME, set, number);
    if (seen.has(key)) continue; // base card only — parallels share text/stats
    seen.add(key);
    const attributes = {
      category: c.category, cost: c.cost, cost_kind: c.cost_kind,
      power: c.power, counter: c.counter, color: c.color,
      attribute: c.attribute, type_feature: c.type_feature,
      block_icon: c.block_icon, has_trigger: c.trigger_text != null,
    };
    const effect = [c.effect_text, c.trigger_text].filter((t) => t != null && t !== "").join("\n") || null;
    await pool.query(
      `INSERT INTO card_texts (sku, lang, effect_text, card_type, attributes, source, source_url, attribution, retrieved_at)
       VALUES ($1, 'en', $2, $3, $4, 'bandai-en', $5, $6, now())
       ON CONFLICT (sku, lang) DO UPDATE SET
         effect_text = EXCLUDED.effect_text, card_type = EXCLUDED.card_type,
         attributes = EXCLUDED.attributes, source_url = EXCLUDED.source_url,
         attribution = EXCLUDED.attribution, retrieved_at = now()`,
      [key, effect, c.category, JSON.stringify(attributes), c.source_url, cfg.attribution],
    );
    upserts++;
  }
  console.log(`  series ${sid}: ${parsed.length} blocks → ${upserts} base cards so far`);
  await sleep(1500); // respectful cadence between series pages
}
console.log(`DONE: ${GAME} — ${cards} blocks parsed, ${upserts} base card_texts upserted (attributes + effect)`);
await pool.end();
