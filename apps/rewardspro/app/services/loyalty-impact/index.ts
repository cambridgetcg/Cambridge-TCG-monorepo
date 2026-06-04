/**
 * Loyalty Impact — public surface.
 *
 * Use `getLoyaltyImpactReport(shop, opts)` to answer the merchant's
 * universal "is this app paying for itself?" question.
 *
 * Use `compute(inputs)` directly for synthetic-data testing or for
 * pipelines that already have orders + ledger data in memory.
 */
export { getLoyaltyImpactReport } from "./report";
export { compute } from "./compute";
export type { ComputeInputs, ComputeResult } from "./compute";
export type {
  LoyaltyImpactReport,
  CohortDefinition,
  CohortDefinitionType,
  CohortMetrics,
  CohortRevenue,
  ProgramCost,
  EstimatedImpact,
  ImpactOptions,
} from "./types";
