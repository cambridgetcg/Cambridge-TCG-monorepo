/**
 * Prompt Evaluator - Main Entry Point
 *
 * A standardized tool for evaluating the effectiveness of prompts
 * used for codebase exploration across Claude Code instances.
 *
 * @example
 * ```typescript
 * import {
 *   quickEvaluate,
 *   getTemplate,
 *   interpolateTemplate,
 *   formatEvaluation,
 * } from './tools/prompt-evaluator';
 *
 * // Quick evaluation
 * const evaluation = quickEvaluate(
 *   'What is the architecture of this app?',
 *   { UG: 4, COV: 5, BC: 4, CLR: 4, ACT: 3, EFF: 4, DA: 4, REP: 5 },
 *   { UG: 'Revealed full structure', COV: 'All areas covered', ... },
 *   'architecture',
 *   'rewardspro'
 * );
 *
 * console.log(formatEvaluation(evaluation));
 * // Output: Composite score, rating, strengths, improvements
 *
 * // Use a template
 * const template = getTemplate('feature-trace-complete');
 * const prompt = interpolateTemplate(template, {
 *   featureName: 'cashback processing',
 *   startPoint: 'orders/paid webhook',
 *   endPoint: 'customer store credit balance',
 * });
 * ```
 */

// Re-export types
export type {
  DimensionKey,
  DimensionDefinition,
  DimensionRating,
  EvaluationContext,
  EvaluationReport,
  OverallRating,
  PromptCategory,
  PromptEvaluation,
  PromptTemplate,
  RatingScore,
  ReportSummary,
} from './types.js';

// Re-export dimension utilities
export {
  DIMENSIONS,
  DIMENSION_WEIGHTS,
  TOTAL_WEIGHT,
  getDimension,
  getCriteria,
  getAllDimensionKeys,
} from './dimensions.js';

// Re-export evaluator functions
export {
  calculateCompositeScore,
  createEvaluation,
  formatEvaluation,
  generateEvaluationId,
  generateReport,
  getOverallRating,
  getRatingColor,
  quickEvaluate,
} from './evaluator.js';

// Re-export template functions
export {
  PROMPT_TEMPLATES,
  getCategoryBestPractices,
  getTemplate,
  getTemplatesByCategory,
  interpolateTemplate,
  listTemplates,
} from './templates.js';

/**
 * Version info
 */
export const VERSION = '1.0.0';

/**
 * Quick start guide
 */
export const QUICK_START = `
Prompt Evaluator v${VERSION}

Quick Start:
1. Import: import { quickEvaluate, formatEvaluation } from './tools/prompt-evaluator'
2. Evaluate: const eval = quickEvaluate(prompt, scores, evidence, category, codebase)
3. Display: console.log(formatEvaluation(eval))

CLI Usage:
  npx ts-node tools/prompt-evaluator/cli.ts help
  npx ts-node tools/prompt-evaluator/cli.ts evaluate
  npx ts-node tools/prompt-evaluator/cli.ts templates

Dimensions (8 total):
  UG  - Understanding Generation (2x weight)
  COV - Coverage (1.5x weight)
  BC  - Bridging Capability (1.5x weight)
  CLR - Clarity (1x weight)
  ACT - Actionability (2x weight)
  EFF - Efficiency (1x weight)
  DA  - Domain Alignment (1.5x weight)
  REP - Reproducibility (0.5x weight)

Score Interpretation:
  4.5-5.0: Exceptional - Use as template
  4.0-4.4: Strong - Minor refinements needed
  3.5-3.9: Good - Solid foundation, optimize
  3.0-3.4: Adequate - Needs improvement
  2.5-2.9: Weak - Significant rework needed
  <2.5: Poor - Redesign from scratch
`;

// Log quick start when imported directly
if (require.main === module) {
  console.log(QUICK_START);
}
