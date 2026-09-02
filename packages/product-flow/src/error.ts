export type ProductFlowContractPhase =
  | "offer"
  | "entitlement_event"
  | "entitlement_snapshot"
  | "snapshot_seed"
  | "access_context"
  | "telegram_deep_link";

export type ProductFlowContractIssueCode =
  | "required"
  | "wrong_type"
  | "unknown_field"
  | "unsupported_value"
  | "invalid_format"
  | "out_of_range"
  | "invalid_order"
  | "duplicate_value"
  | "cross_contract_mismatch";

export interface ProductFlowContractIssue {
  readonly path: string;
  readonly code: ProductFlowContractIssueCode;
  /** Safe contract language only; rejected values are never reflected. */
  readonly message: string;
}

export class ProductFlowContractError extends Error {
  readonly name = "ProductFlowContractError";
  readonly phase: ProductFlowContractPhase;
  readonly issues: readonly ProductFlowContractIssue[];

  constructor(
    phase: ProductFlowContractPhase,
    issues: readonly ProductFlowContractIssue[],
  ) {
    super(`Invalid product-flow/v1 ${phase} contract.`);
    this.phase = phase;
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isProductFlowContractError(
  value: unknown,
): value is ProductFlowContractError {
  return value instanceof ProductFlowContractError;
}

export function productFlowContractIssues(
  value: unknown,
): readonly ProductFlowContractIssue[] {
  return isProductFlowContractError(value) ? value.issues : Object.freeze([]);
}
