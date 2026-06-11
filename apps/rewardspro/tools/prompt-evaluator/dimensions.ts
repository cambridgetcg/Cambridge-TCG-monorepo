/**
 * Prompt Evaluator - Dimension Definitions
 *
 * Complete definitions for all 8 evaluation dimensions
 * with scoring criteria and weights.
 */

import type { DimensionDefinition, DimensionKey, RatingScore } from './types.js';

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  UG: 2.0,    // Understanding Generation - Primary goal
  COV: 1.5,   // Coverage - Completeness matters
  BC: 1.5,    // Bridging Capability - Connections valuable
  CLR: 1.0,   // Clarity - Baseline requirement
  ACT: 2.0,   // Actionability - Must lead to action
  EFF: 1.0,   // Efficiency - Resource consideration
  DA: 1.5,    // Domain Alignment - Context critical
  REP: 0.5,   // Reproducibility - Nice to have
};

export const TOTAL_WEIGHT = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0); // 11

export const DIMENSIONS: DimensionDefinition[] = [
  {
    key: 'UG',
    name: 'Understanding Generation',
    weight: 2.0,
    description: 'Does the prompt lead to genuine comprehension of the code?',
    criteria: {
      5: 'Produces deep architectural insight, reveals non-obvious relationships',
      4: 'Generates clear mental model of component/system behavior',
      3: 'Provides accurate factual information about code',
      2: 'Surface-level description without insight',
      1: 'Misleading or incomplete understanding',
    },
  },
  {
    key: 'COV',
    name: 'Coverage',
    weight: 1.5,
    description: 'Does the prompt explore appropriate breadth and depth?',
    criteria: {
      5: 'Comprehensive coverage with appropriate depth at each level',
      4: 'Good coverage, minor gaps in peripheral areas',
      3: 'Adequate coverage of core areas, misses edge cases',
      2: 'Significant gaps, focuses too narrowly or too broadly',
      1: 'Misses critical areas entirely',
    },
  },
  {
    key: 'BC',
    name: 'Bridging Capability',
    weight: 1.5,
    description: 'Does it connect concepts across different parts of the codebase?',
    criteria: {
      5: 'Reveals cross-cutting relationships, traces data across layers',
      4: 'Connects related components within a domain',
      3: 'Identifies direct dependencies',
      2: 'Treats components in isolation',
      1: 'No connection between concepts',
    },
  },
  {
    key: 'CLR',
    name: 'Clarity',
    weight: 1.0,
    description: 'Is the prompt unambiguous and the output well-structured?',
    criteria: {
      5: 'Crystal clear intent, output is immediately actionable',
      4: 'Clear with minor interpretation needed',
      3: 'Understandable but requires context',
      2: 'Ambiguous, multiple interpretations possible',
      1: 'Confusing or contradictory',
    },
  },
  {
    key: 'ACT',
    name: 'Actionability',
    weight: 2.0,
    description: 'Can you do something concrete with the output?',
    criteria: {
      5: 'Direct path to implementation/debugging/modification',
      4: 'Clear next steps with minimal additional research',
      3: 'General direction but needs refinement',
      2: 'Informational only, no clear application',
      1: 'No practical value',
    },
  },
  {
    key: 'EFF',
    name: 'Efficiency',
    weight: 1.0,
    description: 'Does it achieve results without excessive exploration?',
    criteria: {
      5: 'Minimal exploration, maximum insight',
      4: 'Focused exploration with good ROI',
      3: 'Some unnecessary tangents',
      2: 'Significant wasted effort',
      1: 'Mostly irrelevant exploration',
    },
  },
  {
    key: 'DA',
    name: 'Domain Alignment',
    weight: 1.5,
    description: 'Does it leverage domain-specific knowledge?',
    criteria: {
      5: 'Uses precise domain terminology, reveals business logic',
      4: 'Good domain awareness with minor gaps',
      3: 'Generic but applicable',
      2: 'Misses domain-specific nuances',
      1: 'Domain-ignorant, generic CS terms only',
    },
  },
  {
    key: 'REP',
    name: 'Reproducibility',
    weight: 0.5,
    description: 'Would the same prompt yield consistent quality results?',
    criteria: {
      5: 'Highly deterministic, same quality every time',
      4: 'Consistent with minor variations',
      3: 'Generally consistent, occasional quality variance',
      2: 'Unpredictable results',
      1: 'Different results each time',
    },
  },
];

export function getDimension(key: DimensionKey): DimensionDefinition | undefined {
  return DIMENSIONS.find((d) => d.key === key);
}

export function getCriteria(key: DimensionKey, score: RatingScore): string {
  const dimension = getDimension(key);
  return dimension?.criteria[score] ?? 'Unknown criteria';
}

export function getAllDimensionKeys(): DimensionKey[] {
  return DIMENSIONS.map((d) => d.key);
}
