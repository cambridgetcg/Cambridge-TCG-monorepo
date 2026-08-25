export interface HardcodedPricingMathFinding {
  reason: string;
  evidence: string;
}

const PRICING_MATH_PATTERNS: readonly {
  pattern: RegExp;
  reason: string;
}[] = [
  { pattern: /\*\s*1\.15\b/, reason: "hardcoded retail multiplier (× 1.15)" },
  { pattern: /\*\s*1\.25\b/, reason: "hardcoded ebay multiplier (× 1.25)" },
  { pattern: /\*\s*1\.20\b/, reason: "hardcoded VAT or cardmarket multiplier (× 1.20)" },
  { pattern: /\*\s*0\.55\b/, reason: "hardcoded tradein-cash multiplier (× 0.55)" },
  { pattern: /\*\s*0\.77\b/, reason: "hardcoded tradein-credit multiplier (× 0.77)" },
];

const PRICING_CONTEXT =
  /(?:\bbase_?gbp\b|\bcardrush_?jpy\b|\bcash(?:Offer|Price|Payout)?\b|\bchannel(?:Price|Pricing)?\b|\bcommission\w*\b|\bcredit(?:Offer|Price)?\b|\bebay(?:Price)?\b|\bfee\w*\b|\bgbp\b|\bjpy\b|\bpayout\w*\b|\bprice\w*\b|\bpricing\b|\bretail\w*\b|\bsubtotal\b|\btrade[-_ ]?in\w*\b|\bvat\w*\b|\bwholesale\w*\b)/i;

/**
 * Find multiplier literals only when their current statement names a pricing
 * concept. Numeric constants also appear in geometry, animation, audio and
 * probability code; an unrelated adjacent statement must not turn those into
 * pricing consolidation debt.
 */
export function findHardcodedPricingMath(
  body: string,
): HardcodedPricingMathFinding | null {
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const { pattern, reason } of PRICING_MATH_PATTERNS) {
      const match = line.match(pattern);
      if (!match?.[0]) continue;
      const prefix = lines.slice(Math.max(0, index - 4), index + 1).join("\n");
      const matchEnd =
        prefix.length - line.length + (match.index ?? 0) + match[0].length;
      const throughMatch = prefix.slice(0, matchEnd);
      const statementBoundary = Math.max(
        throughMatch.lastIndexOf(";"),
        throughMatch.lastIndexOf("{"),
        throughMatch.lastIndexOf("}"),
      );
      const statement = throughMatch.slice(statementBoundary + 1);
      if (PRICING_CONTEXT.test(statement)) {
        return { reason, evidence: match[0] };
      }
    }
  }
  return null;
}
