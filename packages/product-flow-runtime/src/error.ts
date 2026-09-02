export type ProductFlowRuntimeErrorCode =
  | "invalid_contract"
  | "unsupported_callback"
  | "mapping_mismatch"
  | "event_conflict"
  | "transition_rejected"
  | "store_invariant"
  | "transaction_order";

export class ProductFlowRuntimeError extends Error {
  readonly name = "ProductFlowRuntimeError";

  constructor(
    readonly code: ProductFlowRuntimeErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

export class ProductFlowRuntimeConformanceError extends Error {
  readonly name = "ProductFlowRuntimeConformanceError";

  constructor(
    readonly case_name: string,
    message: string,
  ) {
    super(`${case_name}: ${message}`);
  }
}
