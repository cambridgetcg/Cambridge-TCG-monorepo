/**
 * Grade detector — pull a grading-company + grade-value from an eBay
 * title. Substrate-honest about the six companies the secondary market
 * actually uses; everything else is `null` (caller treats as raw).
 *
 * The output `grade_value` is normalised to:
 *   - integer/half-integer string when standard ("10", "9.5")
 *   - special-honour string when applicable ("BGS_BLACK_LABEL_10",
 *     "CGC_PRISTINE_10", "BGS_PRISTINE_10", etc.)
 *
 * Order matters: more-specific patterns first so "BGS Black Label 10"
 * is recognised before bare "BGS 10".
 */

export interface GradeDetection {
  grade_company: string | null;
  grade_value: string | null;
}

interface GradeRule {
  pattern: RegExp;
  resolve: (match: RegExpMatchArray) => GradeDetection;
}

const RULES: GradeRule[] = [
  // BGS specials — Black Label / Pristine are sub-tiers of 9.5 and 10
  {
    pattern: /\b(?:BGS|Beckett)\s+BLACK\s+LABEL\s*(10|9\.5)\b/i,
    resolve: (m) => ({ grade_company: "BGS", grade_value: `BGS_BLACK_LABEL_${m[1]}` }),
  },
  {
    pattern: /\b(?:BGS|Beckett)\s+PRISTINE\s*(10|9\.5)\b/i,
    resolve: (m) => ({ grade_company: "BGS", grade_value: `BGS_PRISTINE_${m[1]}` }),
  },
  // CGC specials — Perfect / Pristine on the 10 ceiling
  {
    pattern: /\bCGC\s+(?:PERFECT|PRISTINE)\s*(10|9\.5)\b/i,
    resolve: (m) => ({ grade_company: "CGC", grade_value: `CGC_PRISTINE_${m[1]}` }),
  },
  // PSA — most common. PSA 10 / PSA 9 / PSA 8.5 / etc.
  {
    pattern: /\bPSA\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5|4|3|2|1)\b/i,
    resolve: (m) => ({ grade_company: "PSA", grade_value: m[1] }),
  },
  // BGS / Beckett standard
  {
    pattern: /\b(?:BGS|Beckett(?!\s+raw))\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5\.5|5)\b/i,
    resolve: (m) => ({ grade_company: "BGS", grade_value: m[1] }),
  },
  // CGC standard
  {
    pattern: /\bCGC\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5)\b/i,
    resolve: (m) => ({ grade_company: "CGC", grade_value: m[1] }),
  },
  // SGC
  {
    pattern: /\bSGC\s*(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5)\b/i,
    resolve: (m) => ({ grade_company: "SGC", grade_value: m[1] }),
  },
  // HGA (Hybrid Grading Approach — newer, smaller)
  {
    pattern: /\bHGA\s*(10|9\.5|9|8\.5|8|7\.5|7)\b/i,
    resolve: (m) => ({ grade_company: "HGA", grade_value: m[1] }),
  },
  // ARS / TAG / GMA — surface for completeness; less common
  {
    pattern: /\bARS\s*(10|9\.5|9|8\.5|8|7\.5|7)\b/i,
    resolve: (m) => ({ grade_company: "ARS", grade_value: m[1] }),
  },
  {
    pattern: /\bTAG\s*(10|9\.5|9|8\.5|8|7\.5|7)\b/i,
    resolve: (m) => ({ grade_company: "TAG", grade_value: m[1] }),
  },
];

/**
 * Detect grade. Pure. Returns `{ null, null }` when raw.
 *
 * If multiple matches found, prefer the first rule that matched
 * (specials-first ordering wins).
 */
export function detectGrade(title: string): GradeDetection {
  if (typeof title !== "string" || title.length === 0) {
    return { grade_company: null, grade_value: null };
  }
  for (const rule of RULES) {
    const m = title.match(rule.pattern);
    if (m) return rule.resolve(m);
  }
  return { grade_company: null, grade_value: null };
}

/** Is this title talking about a graded card at all? Cheap check. */
export function isGraded(title: string): boolean {
  return /\b(PSA|BGS|Beckett|CGC|SGC|HGA|ARS|TAG)\s*\d/i.test(title);
}
