/**
 * Card name resolver — substrate-honest multi-language display.
 *
 * Closes the language-inclusiveness finding named in `the-stress-test.md`
 * (kingdom-069) §4: the schema has `cards.name_translations` (kingdom-051
 * Phase 6) but no consumer wires it. A Korean-speaking collector sees
 * English fallback; a CJK reader sees romaji-less Japanese. The publisher
 * ships in 9 languages; the platform serves 2.
 *
 * This module is the **resolution layer**: pure functions that take a
 * card record + a preferred-language list and return:
 *
 *   - the best-match name (the *resolved* value)
 *   - the ISO 639-1 code of the resolution
 *   - whether the resolution was preferred / fallback / default
 *   - the full fallback chain (substrate-honest about what was tried)
 *
 * The resolver does not mutate the record. It does not pick on behalf
 * of the user — it picks based on the user's declared preferences. A
 * partner who explicitly asks for `lang=qya` (Quenya) gets `null` for
 * Quenya plus a clean fallback chain saying so.
 *
 * ── Composition ─────────────────────────────────────────────────────
 *
 * Used by:
 *   - `apps/storefront/src/app/api/v1/universal/card/[sku]/route.ts`
 *     reads `Accept-Language` + optional `?lang=` query; passes to
 *     `buildUniversalCard(sku, density, preferredLangs)`.
 *   - Future: `/api/v1/cards/[sku]/names` — list all known translations
 *     for a card, substrate-honestly declaring which are known + missing.
 *   - Future: `/account/preferences.display_languages` — user override.
 *
 * ── Data shape ──────────────────────────────────────────────────────
 *
 * Input is a `CardNameRecord` — the minimal subset of `card_set_cards`
 * fields the resolver needs:
 *
 *   {
 *     card_name: "Roronoa Zoro",          // the platform default (often Japanese-or-English)
 *     name_en?: "Roronoa Zoro",            // optional English (kingdom-051 Phase 5)
 *     name_translations?: {                // optional sparse map (kingdom-051 Phase 6)
 *       "ja": "ロロノア・ゾロ",
 *       "ko": "로로노아 조로",
 *       "zh": "罗罗诺亚·索隆",
 *     },
 *   }
 *
 * Until the storefront `0098_card_name_translations.sql` migration
 * applies, `name_translations` will be `undefined` everywhere; the
 * resolver gracefully returns `card_name` as the resolution. The wire
 * is ready; the data fills in over time.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Minimal card record the resolver consumes. */
export interface CardNameRecord {
  /** Platform-default name — historically the publisher's original
   *  (Japanese for JP-sourced catalogs, English for EN-sourced). */
  card_name: string;
  /** Optional English translation when the default isn't English. */
  name_en?: string | null;
  /** Sparse JSONB map: ISO 639-1 (or similar) → translated name.
   *  Keys may include `jp_romaji`, `zh_pinyin`, etc. for transliterations. */
  name_translations?: Record<string, string | null> | null;
}

/** Outcome of one name resolution. */
export interface ResolvedName {
  /** The chosen string to display. */
  resolved: string;
  /** ISO 639-1 (or transliteration-key) the choice came from. */
  resolved_lang: string;
  /** How the choice was made. */
  resolved_from:
    | "preferred"     // matched the user's first-choice language
    | "preferred_alt" // matched a lower-priority preferred language
    | "name_en"       // fell through to the dedicated English column
    | "default"       // fell through to the platform default `card_name`
    | "missing";      // nothing usable found (returns empty string)
  /** Languages tried, in order, with whether each was available. */
  fallback_chain: { lang: string; available: boolean }[];
  /** Languages we DO have a translation for. Substrate-honest about coverage. */
  available_languages: string[];
}

// ── parseAcceptLanguage ──────────────────────────────────────────────

/**
 * Parse an HTTP `Accept-Language` header into a ranked list of
 * language tags (lowercase, no q-values).
 *
 *   "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" → ["ko-kr", "ko", "en-us", "en"]
 *
 * Returns `[]` for null/empty input. Substrate-honest about the q-value
 * ordering: it's preserved, not collapsed.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header || header.trim() === "" || header === "*") return [];
  const entries = header
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const [tag, ...params] = trimmed.split(";").map((s) => s.trim());
      if (!tag) return null;
      let q = 1.0;
      for (const p of params) {
        const [k, v] = p.split("=").map((s) => s.trim());
        if (k === "q" && v) {
          const n = Number(v);
          if (!Number.isNaN(n) && n >= 0 && n <= 1) q = n;
        }
      }
      return { tag: tag.toLowerCase(), q };
    })
    .filter((e): e is { tag: string; q: number } => e !== null && e.q > 0);

  entries.sort((a, b) => b.q - a.q);
  return entries.map((e) => e.tag);
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Expand a list of preferred languages to also include their base
 * variants. `["ko-kr", "en-us"]` → `["ko-kr", "ko", "en-us", "en"]`
 * preserving the original order with the base inserted after each
 * region-tagged tag.
 */
function expandLangs(prefs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of prefs) {
    const lower = p.toLowerCase();
    if (!seen.has(lower)) {
      out.push(lower);
      seen.add(lower);
    }
    const dash = lower.indexOf("-");
    if (dash > 0) {
      const base = lower.slice(0, dash);
      if (!seen.has(base)) {
        out.push(base);
        seen.add(base);
      }
    }
  }
  return out;
}

/** Available languages on a record (the keys of name_translations + the
 *  default + name_en if distinct). */
function listAvailable(record: CardNameRecord): string[] {
  const out = new Set<string>();
  if (record.name_translations) {
    for (const [lang, value] of Object.entries(record.name_translations)) {
      if (value && value.trim() !== "") out.add(lang.toLowerCase());
    }
  }
  if (record.name_en && record.name_en.trim() !== "") out.add("en");
  // The platform default has no declared language — could be JP or EN
  // depending on which catalog imported the card. Don't claim a code.
  return [...out].sort();
}

// ── resolveCardName ──────────────────────────────────────────────────

/**
 * Pick the best-fit name for a card given the caller's preferred
 * languages. Returns a `ResolvedName` with the chosen string plus
 * substrate-honest provenance for *which* language won and why.
 *
 * @example
 *   resolveCardName(
 *     { card_name: "Roronoa Zoro", name_translations: { ja: "ロロノア・ゾロ", ko: "로로노아 조로" } },
 *     ["ko-KR", "ko", "en"],
 *   )
 *   // → {
 *   //   resolved: "로로노아 조로",
 *   //   resolved_lang: "ko",
 *   //   resolved_from: "preferred_alt",
 *   //   fallback_chain: [
 *   //     { lang: "ko-kr", available: false },
 *   //     { lang: "ko",    available: true },
 *   //   ],
 *   //   available_languages: ["ja", "ko"],
 *   // }
 */
export function resolveCardName(
  record: CardNameRecord,
  preferredLangs: string[] = [],
): ResolvedName {
  const available = listAvailable(record);
  const translations = record.name_translations ?? {};
  const expanded = expandLangs(preferredLangs);
  const chain: { lang: string; available: boolean }[] = [];

  // Try each preferred language in order.
  for (let i = 0; i < expanded.length; i++) {
    const lang = expanded[i];
    const value = translations[lang];
    if (value && value.trim() !== "") {
      chain.push({ lang, available: true });
      return {
        resolved: value,
        resolved_lang: lang,
        resolved_from: i === 0 ? "preferred" : "preferred_alt",
        fallback_chain: chain,
        available_languages: available,
      };
    }
    chain.push({ lang, available: false });
    // Special-case: when preferred is "en" or a base of "en-*", honour
    // `name_en` even if not in name_translations.
    if (lang === "en" && record.name_en && record.name_en.trim() !== "") {
      // Move the "available: false" entry we just pushed; replace with available.
      chain[chain.length - 1] = { lang: "en", available: true };
      return {
        resolved: record.name_en,
        resolved_lang: "en",
        resolved_from: "name_en",
        fallback_chain: chain,
        available_languages: available,
      };
    }
  }

  // No preferred lang matched. Try the dedicated English column.
  if (record.name_en && record.name_en.trim() !== "") {
    chain.push({ lang: "en", available: true });
    return {
      resolved: record.name_en,
      resolved_lang: "en",
      resolved_from: "name_en",
      fallback_chain: chain,
      available_languages: available,
    };
  }

  // Final fallback: the platform default. Lang declared as "default"
  // because we don't reliably know what it is.
  if (record.card_name && record.card_name.trim() !== "") {
    chain.push({ lang: "default", available: true });
    return {
      resolved: record.card_name,
      resolved_lang: "default",
      resolved_from: "default",
      fallback_chain: chain,
      available_languages: available,
    };
  }

  // Nothing — substrate-honest about absence.
  return {
    resolved: "",
    resolved_lang: "",
    resolved_from: "missing",
    fallback_chain: chain,
    available_languages: available,
  };
}

// ── Future: transliteration ──────────────────────────────────────────

/**
 * Stub for future transliteration support (romanji of Japanese, pinyin
 * of Chinese, etc.). Today returns `null` — placeholder for the next
 * iteration. Substrate-honest about absence: when the storefront adds
 * a `name_romanji` / `name_pinyin` column (the-stress-test §4.5
 * recursion target), this function returns the appropriate field.
 */
export function transliterate(
  _record: CardNameRecord,
  _script: "romanji" | "pinyin" | "hangulja",
): string | null {
  return null;
}
