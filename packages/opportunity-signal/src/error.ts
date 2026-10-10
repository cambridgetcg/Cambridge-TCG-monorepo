export type OpportunitySignalContractPhase =
  | "input"
  | "provider_result"
  | "output";

export type OpportunitySignalContractIssueCode =
  | "required"
  | "wrong_type"
  | "unknown_field"
  | "unsupported_value"
  | "invalid_format"
  | "out_of_range"
  | "invalid_order"
  | "duplicate_value"
  | "cross_contract_mismatch"
  | "unsafe_claim";

export interface OpportunitySignalContractIssue {
  readonly path: string;
  readonly code: OpportunitySignalContractIssueCode;
  /** Safe contract-language only. The rejected raw value is never included. */
  readonly message: string;
}

export class OpportunitySignalContractError extends Error {
  readonly name = "OpportunitySignalContractError";
  readonly phase: OpportunitySignalContractPhase;
  readonly issues: readonly OpportunitySignalContractIssue[];

  constructor(
    phase: OpportunitySignalContractPhase,
    issues: readonly OpportunitySignalContractIssue[],
  ) {
    super(`Invalid opportunity-signal/v1 ${phase} contract.`);
    this.phase = phase;
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
