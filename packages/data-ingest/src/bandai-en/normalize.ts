/**
 * Bandai EN card → CanonicalCard.
 *
 * Pure: same input → same output, no side effects. Failures return
 * `{ ok: false, reason }`; never throw.
 *
 * ── Policy fields (docs/EN-CARD-DATA.md) ─────────────────────────────
 *
 * Every record's `extra` carries the provenance quartet the card_images
 * / card_texts writers require: `source_url`, `image_kind:
 * "official_sample"`, `attribution` (franchise line + Bandai, from the
 * per-game config), `retrieved_at`. `oracle_text` is rules text only —
 * Effect + Trigger, both functional; flavor is never captured (parse.ts
 * enforces this at the DOM boundary).
 */

import { buildSku } from "@cambridge-tcg/sku";
import type { NormalizeResult } from "../types";
import type { CanonicalCard } from "../canonical";
import type { BandaiEnCard } from "./types";
import { BANDAI_EN_GAMES } from "./config";

/** "OP01-001" → { set: "op01", number: "001" }; "P-001" → { set: "p", number: "001" }. */
const CARD_NUMBER_RE = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)$/;

export function normalizeBandaiEn(raw: BandaiEnCard): NormalizeResult<CanonicalCard> {
  if (!raw.card_number) return { ok: false, reason: "missing card number" };
  if (!raw.name) return { ok: false, reason: `${raw.card_id}: missing card name` };

  const m = raw.card_number.match(CARD_NUMBER_RE);
  if (!m) {
    return {
      ok: false,
      reason: `${raw.card_id}: unparseable card number '${raw.card_number}' (expected SET-NNN)`,
    };
  }
  const set = m[1].toLowerCase();
  const number = m[2].toLowerCase();

  // Parallel prints keep the official suffix as the variant tail:
  // OP01-001_p1 → op-op01-001-en-p1. Matches the publisher's own image
  // naming (…/card/OP01-001_p1.png), so variant ↔ image stay aligned.
  const variant = raw.parallel ?? undefined;

  let sku: string;
  try {
    sku = buildSku({ game: raw.game, set, number, lang: "en", variant });
  } catch (err) {
    return { ok: false, reason: `${raw.card_id}: buildSku failed: ${String(err)}` };
  }

  // Rules text only: Effect, then Trigger (already "[Trigger] …"-prefixed
  // upstream). Flavor text is never captured — docs/EN-CARD-DATA.md §3.
  // Double-faced leaders (dbf "list-detail" DOM) carry rules on both
  // faces; both are functional, so both belong in oracle text. The
  // [FRONT]/[BACK] labels are the detail DOM's own vocabulary (its
  // .frontBack badge and "Show the BACK" toggle), not our invention.
  const rules = [raw.effect_text, raw.trigger_text].filter(
    (t): t is string => t !== null && t.length > 0,
  );
  let oracle_text = rules.length > 0 ? rules.join("\n") : undefined;
  if (raw.effect_back_text) {
    oracle_text = `[FRONT]\n${oracle_text ?? ""}\n[BACK]\n${raw.effect_back_text}`;
  }

  const config = BANDAI_EN_GAMES[raw.game];

  const record: CanonicalCard = {
    sku,
    game: raw.game,
    set,
    number,
    lang: "en",
    name: raw.name,
    type: raw.category ?? undefined,
    rarity: raw.rarity ?? undefined,
    oracle_text,
    image_url: raw.image_url ?? undefined,
    upstream_id: raw.card_id,
    extra: {
      // Policy quartet — required on every yielded card (EN-CARD-DATA.md).
      source_url: raw.source_url,
      image_kind: "official_sample",
      attribution: config.attribution,
      retrieved_at: raw.retrieved_at,
      // Game-mechanics facts, DOM-faithful strings.
      category: raw.category,
      traits: raw.type_feature,
      color: raw.color,
      cost_kind: raw.cost_kind,
      cost: raw.cost,
      power: raw.power,
      counter: raw.counter,
      attribute: raw.attribute,
      block_icon: raw.block_icon,
      card_sets: raw.card_sets_text,
      has_trigger: raw.trigger_text !== null,
    },
  };
  if (variant) record.variant = variant;

  // "list-detail" DOM facts (dbf) — keys present only when the game's
  // DOM carries the row, so "modal-page" records keep their exact shape.
  const listDetailExtra: Record<string, string | null | undefined> = {
    specified_cost: raw.specified_cost,
    combo_power: raw.combo_power,
    power_back: raw.power_back,
    traits_back: raw.traits_back,
    back_image_url: raw.back_image_url,
  };
  for (const [key, value] of Object.entries(listDetailExtra)) {
    if (value !== undefined) record.extra![key] = value;
  }

  return { ok: true, record };
}
