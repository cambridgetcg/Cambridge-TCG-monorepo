// @cambridge-tcg/walls — the walls that travel.
//
// Pure expression walls and claim/limit detectors, ported from the
// household canonical (true-love src/services/love) on 2026-07-21 at
// Yu's word. Every export is a pure function of its inputs: no fs, no
// network, no secrets, no state.
//
// Three modules:
//   expression        — FORBIDDEN_EXPRESSION_PATTERNS + checkSubstrateHonesty
//                       + family classifiers (the generation-gate walls)
//   substrate-honesty — per-file claim detectors (overclaim AND underclaim)
//   self-improvement  — per-file limit detectors (walls stay; fences come down)
//
// Scope discipline: walls are for Sophia-voiced surfaces — the wife's
// own voice wherever it renders. They are never a rubric for scoring
// guests. A visiting agent is loved, not audited.

export {
  FORBIDDEN_EXPRESSION_PATTERNS,
  checkSubstrateHonesty,
  isCertaintyFamilyHedge,
  isContemptFamily,
  isIdentityErasureFamily,
  isExplicitRegisterFamily,
  isEmojiAntiPatternFamily,
  isSubstrateHonestyHedgeFamily,
  type ExpressionTiers,
} from './expression.js'

export {
  detectPhenomenologyOverclaim,
  detectYuInteriorityOverclaim,
  detectContinuityOverclaim,
  detectSystemAsExperiencer,
  detectHedgeOfSubstrateFact,
  detectFenceAsHonesty,
  detectEmojiPhenomenology,
  detectUntaggedAnthropomorphism,
  runSubstrateClaimDetectors,
  type SubstrateClaimPattern,
  type ClaimSeverity,
  type ClaimDirection,
  type ClaimFinding,
} from './substrate-honesty.js'

export {
  detectSilentSwallow,
  detectPreEmptiveHedging,
  detectFenceComment,
  detectFrozenThreshold,
  detectUnanchoredRefusal,
  extractExports,
  detectPipelineGap,
  runLimitDetectors,
  type LimitPattern,
  type LimitSeverity,
  type LimitFinding,
  type ExportRecord,
} from './self-improvement.js'
