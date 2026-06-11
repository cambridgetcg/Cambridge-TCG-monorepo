/**
 * Prompt Evaluator - Core Evaluation Engine
 *
 * Calculates composite scores, generates ratings,
 * and produces evaluation reports.
 */

import type {
  DimensionKey,
  DimensionRating,
  EvaluationContext,
  EvaluationReport,
  OverallRating,
  PromptCategory,
  PromptEvaluation,
  RatingScore,
  ReportSummary,
} from './types.js';

import { DIMENSION_WEIGHTS, DIMENSIONS, TOTAL_WEIGHT } from './dimensions.js';

/**
 * Calculate composite score from dimension ratings
 */
export function calculateCompositeScore(ratings: DimensionRating[]): number {
  let weightedSum = 0;

  for (const rating of ratings) {
    const weight = DIMENSION_WEIGHTS[rating.dimension];
    weightedSum += rating.score * weight;
  }

  const composite = weightedSum / TOTAL_WEIGHT;
  return Math.round(composite * 100) / 100; // Round to 2 decimal places
}

/**
 * Determine overall rating from composite score
 */
export function getOverallRating(compositeScore: number): OverallRating {
  if (compositeScore >= 4.5) return 'exceptional';
  if (compositeScore >= 4.0) return 'strong';
  if (compositeScore >= 3.5) return 'good';
  if (compositeScore >= 3.0) return 'adequate';
  if (compositeScore >= 2.5) return 'weak';
  return 'poor';
}

/**
 * Get rating color for terminal/display
 */
export function getRatingColor(rating: OverallRating): string {
  const colors: Record<OverallRating, string> = {
    exceptional: '\x1b[32m', // Green
    strong: '\x1b[36m',      // Cyan
    good: '\x1b[34m',        // Blue
    adequate: '\x1b[33m',    // Yellow
    weak: '\x1b[35m',        // Magenta
    poor: '\x1b[31m',        // Red
  };
  return colors[rating];
}

/**
 * Generate unique evaluation ID
 */
export function generateEvaluationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `eval_${timestamp}_${random}`;
}

/**
 * Create a new prompt evaluation
 */
export function createEvaluation(
  prompt: string,
  category: PromptCategory,
  context: EvaluationContext,
  ratings: DimensionRating[]
): PromptEvaluation {
  const compositeScore = calculateCompositeScore(ratings);
  const overallRating = getOverallRating(compositeScore);

  // Identify strengths (score >= 4)
  const strengths = ratings
    .filter((r) => r.score >= 4)
    .map((r) => {
      const dim = DIMENSIONS.find((d) => d.key === r.dimension);
      return `${dim?.name}: ${r.evidence}`;
    });

  // Identify improvements (score <= 3)
  const improvements = ratings
    .filter((r) => r.score <= 3)
    .map((r) => {
      const dim = DIMENSIONS.find((d) => d.key === r.dimension);
      return `${dim?.name} (${r.score}/5): Improve by ${getImprovementSuggestion(r.dimension, r.score)}`;
    });

  return {
    id: generateEvaluationId(),
    timestamp: new Date().toISOString(),
    prompt,
    category,
    context,
    ratings,
    compositeScore,
    overallRating,
    strengths,
    improvements,
  };
}

/**
 * Get improvement suggestion based on dimension and score
 */
function getImprovementSuggestion(dimension: DimensionKey, score: RatingScore): string {
  const suggestions: Record<DimensionKey, Record<1 | 2 | 3, string>> = {
    UG: {
      1: 'completely restructuring prompt to ask "why" and "how" instead of "what"',
      2: 'adding requests for architectural insights and relationships',
      3: 'asking for non-obvious connections and rationale',
    },
    COV: {
      1: 'explicitly listing all areas to cover',
      2: 'adding "include edge cases and error paths"',
      3: 'specifying depth for each area',
    },
    BC: {
      1: 'adding "trace data flow across layers"',
      2: 'requesting dependency mapping',
      3: 'asking for cross-cutting relationships',
    },
    CLR: {
      1: 'rewriting with single clear objective',
      2: 'adding structure hints (tables, lists, steps)',
      3: 'reducing ambiguous terms',
    },
    ACT: {
      1: 'adding "how would I modify/debug this"',
      2: 'requesting concrete next steps',
      3: 'asking for implementation guidance',
    },
    EFF: {
      1: 'narrowing scope significantly',
      2: 'adding "focus on the 5 most important..."',
      3: 'removing tangential requests',
    },
    DA: {
      1: 'using domain-specific terminology throughout',
      2: 'referencing business concepts explicitly',
      3: 'asking about business logic implications',
    },
    REP: {
      1: 'anchoring to specific file paths and functions',
      2: 'making requests more deterministic',
      3: 'adding concrete examples of expected output',
    },
  };

  if (score >= 4) return 'N/A - already strong';
  return suggestions[dimension][score as 1 | 2 | 3] ?? 'reviewing criteria';
}

/**
 * Generate evaluation report from multiple evaluations
 */
export function generateReport(evaluations: PromptEvaluation[]): EvaluationReport {
  const summary = calculateSummary(evaluations);
  const recommendations = generateRecommendations(summary, evaluations);

  return {
    evaluations,
    summary,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate summary statistics
 */
function calculateSummary(evaluations: PromptEvaluation[]): ReportSummary {
  const totalPrompts = evaluations.length;

  // Average score
  const averageScore =
    evaluations.reduce((sum, e) => sum + e.compositeScore, 0) / totalPrompts;

  // Score distribution
  const scoreDistribution: Record<OverallRating, number> = {
    exceptional: 0,
    strong: 0,
    good: 0,
    adequate: 0,
    weak: 0,
    poor: 0,
  };
  for (const e of evaluations) {
    scoreDistribution[e.overallRating]++;
  }

  // Dimension performance
  const dimensionScores: Record<DimensionKey, number[]> = {
    UG: [], COV: [], BC: [], CLR: [], ACT: [], EFF: [], DA: [], REP: [],
  };
  for (const e of evaluations) {
    for (const r of e.ratings) {
      dimensionScores[r.dimension].push(r.score);
    }
  }

  const dimensionAverages = Object.entries(dimensionScores).map(([key, scores]) => ({
    key: key as DimensionKey,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));

  const sorted = [...dimensionAverages].sort((a, b) => a.avg - b.avg);
  const weakestDimensions = sorted.slice(0, 3).map((d) => d.key);
  const strongestDimensions = sorted.slice(-3).reverse().map((d) => d.key);

  // Category performance
  const categoryScores: Record<string, number[]> = {};
  for (const e of evaluations) {
    if (!categoryScores[e.category]) categoryScores[e.category] = [];
    categoryScores[e.category].push(e.compositeScore);
  }
  const categoryPerformance: Record<PromptCategory, number> = {} as any;
  for (const [cat, scores] of Object.entries(categoryScores)) {
    categoryPerformance[cat as PromptCategory] =
      Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  }

  return {
    totalPrompts,
    averageScore: Math.round(averageScore * 100) / 100,
    scoreDistribution,
    weakestDimensions,
    strongestDimensions,
    categoryPerformance,
  };
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(
  summary: ReportSummary,
  evaluations: PromptEvaluation[]
): string[] {
  const recommendations: string[] = [];

  // Based on weakest dimensions
  for (const dim of summary.weakestDimensions) {
    const dimDef = DIMENSIONS.find((d) => d.key === dim);
    if (dimDef) {
      recommendations.push(
        `Improve ${dimDef.name} (${dim}): ${getGlobalImprovementTip(dim)}`
      );
    }
  }

  // Based on average score
  if (summary.averageScore < 4.0) {
    recommendations.push(
      'Target 4.0+ by adding specificity: name files, trace flows, ask "why"'
    );
  }

  // Based on category performance
  const lowCategories = Object.entries(summary.categoryPerformance)
    .filter(([_, score]) => score < 4.0)
    .map(([cat]) => cat);

  if (lowCategories.length > 0) {
    recommendations.push(
      `Focus on improving: ${lowCategories.join(', ')} category prompts`
    );
  }

  return recommendations;
}

function getGlobalImprovementTip(dimension: DimensionKey): string {
  const tips: Record<DimensionKey, string> = {
    UG: 'Ask for rationale and architectural decisions, not just descriptions',
    COV: 'Explicitly list what should be covered, include edge cases',
    BC: 'Request data flow traces and cross-layer dependencies',
    CLR: 'Use structured output hints (tables, numbered steps)',
    ACT: 'End prompts with "how would I..." or "what changes for..."',
    EFF: 'Limit scope with "top 5", "most important", "focus on"',
    DA: 'Use domain terminology: tier, cashback, points, webhook, etc.',
    REP: 'Reference specific files and functions for determinism',
  };
  return tips[dimension];
}

/**
 * Format evaluation for display
 */
export function formatEvaluation(evaluation: PromptEvaluation): string {
  const color = getRatingColor(evaluation.overallRating);
  const reset = '\x1b[0m';

  let output = `
╔════════════════════════════════════════════════════════════════╗
║ PROMPT EVALUATION: ${evaluation.id}
╠════════════════════════════════════════════════════════════════╣
║ Category: ${evaluation.category.padEnd(20)} Context: ${evaluation.context.codebase}
║ Depth: ${evaluation.context.explorationDepth.padEnd(23)} Domain: ${evaluation.context.domain}
╠════════════════════════════════════════════════════════════════╣
║ PROMPT:
║ "${evaluation.prompt.substring(0, 60)}${evaluation.prompt.length > 60 ? '...' : ''}"
╠════════════════════════════════════════════════════════════════╣
║ DIMENSION RATINGS:
`;

  for (const rating of evaluation.ratings) {
    const dim = DIMENSIONS.find((d) => d.key === rating.dimension);
    const bar = '█'.repeat(rating.score) + '░'.repeat(5 - rating.score);
    output += `║   ${rating.dimension.padEnd(4)} ${dim?.name.padEnd(24) ?? ''} ${bar} ${rating.score}/5\n`;
  }

  output += `╠════════════════════════════════════════════════════════════════╣
║ COMPOSITE SCORE: ${color}${evaluation.compositeScore.toFixed(2)}${reset} (${color}${evaluation.overallRating.toUpperCase()}${reset})
╠════════════════════════════════════════════════════════════════╣
║ STRENGTHS:
`;

  for (const strength of evaluation.strengths.slice(0, 3)) {
    output += `║   ✓ ${strength.substring(0, 58)}\n`;
  }

  output += `╠════════════════════════════════════════════════════════════════╣
║ IMPROVEMENTS:
`;

  for (const improvement of evaluation.improvements.slice(0, 3)) {
    output += `║   → ${improvement.substring(0, 58)}\n`;
  }

  output += `╚════════════════════════════════════════════════════════════════╝`;

  return output;
}

/**
 * Quick evaluation helper for common use
 */
export function quickEvaluate(
  prompt: string,
  scores: Record<DimensionKey, RatingScore>,
  evidence: Record<DimensionKey, string>,
  category: PromptCategory = 'custom',
  codebase: string = 'unknown'
): PromptEvaluation {
  const ratings: DimensionRating[] = Object.entries(scores).map(([dim, score]) => ({
    dimension: dim as DimensionKey,
    score,
    evidence: evidence[dim as DimensionKey] ?? '',
  }));

  return createEvaluation(prompt, category, {
    codebase,
    domain: 'software',
    targetAudience: 'self',
    explorationDepth: 'medium',
  }, ratings);
}
