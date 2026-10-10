/**
 * Lexical signals that a page may render a platform-derived decision.
 *
 * Commission needs more care than the other signals: the noun also means an
 * artist brief and appears in affiliate disclaimers. Match implementation
 * identifiers and value-like UI copy, not every occurrence of the word.
 */
export const DERIVED_SCORE_PATTERNS: readonly RegExp[] = [
  /\btrust_score\b/,
  /\btrust\.score\b/,
  /\btier_id\b/,
  /\btier\b.*=.*['"](?:Bronze|Silver|Gold|Platinum|OG)['"]/i,
  /\bcommission_(?:rate|bps|amount|gbp)\b/,
  /\b(?:p2p|auction)_commission_rate\b/,
  /\bestimated_commission(?:_gbp)?\b/,
  /\bcommission(?:Rate|Bps|Amount)\b/,
  /\b(?:platform|marketplace|seller|p2p|auction)Commission(?:Rate|Bps|Amount|Gbp)?\b/,
  /\b\d+(?:\.\d+)?\s*%\s+(?:(?:p2p|auction|platform|marketplace|seller)\s+)?commission\b/i,
  /\bcommission(?:\s+rate)?\s*(?:is|:|=|—|–|-)\s*\d+(?:\.\d+)?\s*%/i,
  /\b(?:platform|marketplace|seller|p2p|auction)\s+commission(?:\s+rate)?\s*(?:(?:is|:|=|—|–|-)\s*)?\d+(?:\.\d+)?\s*%/i,
  /\b(?:takes?|charges?)\s+no\s+commission\b(?!\s+(?:from|with)\b)/i,
  /\bcommission\s*(?:—|–|-|:|\()\s*(?:none|\d|['"{])/i,
  /\b(?:label|title)=['"][^'"]*\bcommission\b[^'"]*['"]/i,
  /\bseverity\b/,
  /\bauto_action\b/,
  /\bfraud_signal/,
];

export function findDerivedScoreMatches(body: string): string[] {
  const matches: string[] = [];
  for (const pattern of DERIVED_SCORE_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[0]) matches.push(match[0]);
  }
  return Array.from(new Set(matches));
}
