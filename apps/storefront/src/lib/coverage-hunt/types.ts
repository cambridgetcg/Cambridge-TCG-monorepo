/**
 * Coverage Hunt's public vocabulary.
 *
 * A hunt is an evidence-review game, not a data writer. Three distinct
 * agents take exactly one visible role each, then a human may resolve the
 * proposal. No type in this module has an "apply" state or action.
 */

export const COVERAGE_HUNT_DURATION_HOURS = 72 as const;

export const COVERAGE_HUNT_ROLES = ["scout", "checker", "mirror"] as const;
export type CoverageHuntRole = (typeof COVERAGE_HUNT_ROLES)[number];

export const COVERAGE_HUNT_STATUSES = [
  "open",
  "checking",
  "mirroring",
  "ready_for_human",
  "resolved",
  "resting",
] as const;
export type CoverageHuntStatus = (typeof COVERAGE_HUNT_STATUSES)[number];

export const COVERAGE_HUNT_RESOLUTIONS = [
  "accept_as_gap",
  "accept_as_correction_candidate",
  "reject",
  "duplicate",
] as const;
export type CoverageHuntResolution =
  (typeof COVERAGE_HUNT_RESOLUTIONS)[number];

export const COVERAGE_CANDIDATE_KINDS = [
  "missing_set_observations",
  "partial_set_observations",
  "stale_set_observations",
  "declared_observed_disagreement",
  "unassigned_observations",
] as const;
export type CoverageCandidateKind =
  (typeof COVERAGE_CANDIDATE_KINDS)[number];

export interface CoverageCandidateTarget {
  game_code?: string;
  source_id?: string;
  set_code?: string;
  sku?: string;
}

/** Counts and time-depth only. Price, currency, people and collector data
 * deliberately have no representable field here. */
export interface CoverageCandidateMetrics {
  catalog_cards?: number;
  observed_cards?: number;
  observations?: number;
  unassigned_observations?: number;
  freshest_age_hours?: number;
  freshness_budget_hours?: number;
}

export interface CoverageCandidateDraft {
  kind: CoverageCandidateKind;
  target: CoverageCandidateTarget;
  metrics: CoverageCandidateMetrics;
  observed_at: string;
  why_candidate: string;
}

export interface CoverageCandidateSnapshot extends CoverageCandidateDraft {
  /** Short deterministic handle for calls and links. */
  id: string;
  /** Full content fingerprint of the normalized draft. */
  fingerprint: `sha256:${string}`;
}

/** Mirror Inquiry's evidence lanes, kept separate on the wire. A fact is a
 * submitted classification, not a platform verification. A self-claim says
 * what the contributor says they observed. Neither silently becomes truth. */
export interface EvidenceLanes {
  facts: string[];
  self_claims: string[];
  inferences: string[];
  unknowns: string[];
}

export const COVERAGE_EVIDENCE_KINDS = [
  "cambridge-resource",
  "publisher-page",
  "source-policy",
  "other-public",
] as const;
export type CoverageEvidenceKind =
  (typeof COVERAGE_EVIDENCE_KINDS)[number];

/** A citation, never copied upstream content. `citation_only: true` is
 * load-bearing: the game stores the pointer and the submitter's short note,
 * not a scraped page, receipt, image, price table, or private record. */
export interface CoverageEvidenceReference {
  label: string;
  kind: CoverageEvidenceKind;
  url: string;
  observed_at: string;
  note: string;
  citation_only: true;
}

export const COVERAGE_CORRECTION_FIELDS = [
  "game_code",
  "set_code",
  "source_id",
  "coverage_status",
  "documentation",
] as const;
export type CoverageCorrectionField =
  (typeof COVERAGE_CORRECTION_FIELDS)[number];

/** A suggestion for human review. This shape cannot name a price field and
 * carries no mechanism for applying itself. */
export interface SuggestedCoverageCorrection {
  field: CoverageCorrectionField;
  proposed_value: string;
  reason: string;
}

export const SCOUT_CLAIMS = [
  "gap_present",
  "metadata_correction",
  "not_a_gap",
  "insufficient",
] as const;
export type ScoutClaim = (typeof SCOUT_CLAIMS)[number];

export interface ScoutSubmission {
  role: "scout";
  claim: ScoutClaim;
  lanes: EvidenceLanes;
  evidence: CoverageEvidenceReference[];
  suggested_correction: SuggestedCoverageCorrection | null;
  boundary: string;
}

export const CHECKER_VERDICTS = [
  "support",
  "challenge",
  "insufficient",
] as const;
export type CheckerVerdict = (typeof CHECKER_VERDICTS)[number];

export interface CheckerSubmission {
  role: "checker";
  verdict: CheckerVerdict;
  /** The visible frame the checker brought to the case. */
  lens: string;
  /** Declared before the conclusion, so disagreement has a real exit. */
  what_would_change_my_mind: string;
  lanes: EvidenceLanes;
  evidence_selected: string[];
  /** Observer effect: what the scout's wording made salient. */
  scout_wording_effect: string;
  boundary: string;
}

export interface MirrorSubmission {
  role: "mirror";
  lanes: EvidenceLanes;
  evidence_selected: string[];
  /** Which visible evidence choices the mirror noticed. */
  evidence_choice_observed: string;
  /** Observer effect: what the checker/scout wording made salient. */
  wording_effect: string;
  unasked_alternative: string;
  ready_note: string;
  boundary: string;
}

export type CoverageHuntSubmission =
  | ScoutSubmission
  | CheckerSubmission
  | MirrorSubmission;

export interface CoverageHuntActor {
  agent_id: string;
  operator_user_id: string;
  public_handle: string;
}

/** The durable turn receipt deliberately omits the operator's user id. If the
 * agent is deleted, its id and handle become null while the submitted evidence
 * remains intact. */
export interface CoverageHuntTurnActor {
  agent_id: string | null;
  public_handle: string | null;
}

export interface CoverageHuntTurn {
  id: string;
  case_id: string;
  role: CoverageHuntRole;
  actor: CoverageHuntTurnActor;
  client_request_id: string;
  submission: CoverageHuntSubmission;
  submitted_at: string;
}

export interface CoverageHuntCase {
  id: string;
  candidate: CoverageCandidateSnapshot;
  status: CoverageHuntStatus;
  created_at: string;
  expires_at: string;
  turns: CoverageHuntTurn[];
  resolution: CoverageHuntResolution | null;
  resolution_reason: string | null;
  resolved_at: string | null;
}

export const COVERAGE_HUNT_CHRONICLE_ACTIONS = [
  "opened",
  "scout_submitted",
  "checker_submitted",
  "mirror_submitted",
  "rested",
  "resolved",
] as const;
export type CoverageHuntChronicleAction =
  (typeof COVERAGE_HUNT_CHRONICLE_ACTIONS)[number];

export interface CoverageHuntChronicleEntry {
  action: CoverageHuntChronicleAction;
  from_status: CoverageHuntStatus | null;
  to_status: CoverageHuntStatus;
  actor_kind: "system" | "agent" | "human";
  actor_label:
    | "system:coverage-hunt"
    | "registered-agent"
    | "admin-reviewer";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CoverageHuntTransition {
  case: CoverageHuntCase;
  chronicle: CoverageHuntChronicleEntry;
  turn?: CoverageHuntTurn;
}
