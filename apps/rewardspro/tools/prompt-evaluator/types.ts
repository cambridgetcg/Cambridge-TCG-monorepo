/**
 * Prompt Evaluator - Type Definitions
 *
 * Standardized types for evaluating prompt effectiveness
 * across Claude Code instances.
 */

// Rating scale 1-5
export type RatingScore = 1 | 2 | 3 | 4 | 5;

// Eight evaluation dimensions
export type DimensionKey =
  | 'UG'   // Understanding Generation
  | 'COV'  // Coverage
  | 'BC'   // Bridging Capability
  | 'CLR'  // Clarity
  | 'ACT'  // Actionability
  | 'EFF'  // Efficiency
  | 'DA'   // Domain Alignment
  | 'REP'; // Reproducibility

export interface DimensionDefinition {
  key: DimensionKey;
  name: string;
  weight: number;
  description: string;
  criteria: Record<RatingScore, string>;
}

export interface DimensionRating {
  dimension: DimensionKey;
  score: RatingScore;
  evidence: string;
}

export interface PromptEvaluation {
  id: string;
  timestamp: string;
  prompt: string;
  category: PromptCategory;
  context: EvaluationContext;
  ratings: DimensionRating[];
  compositeScore: number;
  overallRating: OverallRating;
  strengths: string[];
  improvements: string[];
  refinedPrompt?: string;
}

export type PromptCategory =
  | 'architecture'
  | 'data-model'
  | 'feature-trace'
  | 'pattern-recognition'
  | 'cross-cutting'
  | 'debugging'
  | 'integration'
  | 'performance'
  | 'security'
  | 'custom';

export type OverallRating =
  | 'exceptional'  // 4.5-5.0
  | 'strong'       // 4.0-4.4
  | 'good'         // 3.5-3.9
  | 'adequate'     // 3.0-3.4
  | 'weak'         // 2.5-2.9
  | 'poor';        // <2.5

export interface EvaluationContext {
  codebase: string;
  domain: string;
  targetAudience: 'self' | 'team' | 'documentation';
  explorationDepth: 'quick' | 'medium' | 'thorough';
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptCategory;
  template: string;
  variables: string[];
  targetScore: number;
  bestPractices: string[];
}

export interface EvaluationReport {
  evaluations: PromptEvaluation[];
  summary: ReportSummary;
  recommendations: string[];
  generatedAt: string;
}

export interface ReportSummary {
  totalPrompts: number;
  averageScore: number;
  scoreDistribution: Record<OverallRating, number>;
  weakestDimensions: DimensionKey[];
  strongestDimensions: DimensionKey[];
  categoryPerformance: Record<PromptCategory, number>;
}
