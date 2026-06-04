/**
 * Top-level: re-exports the typed canonical for the rewards module.
 * No I/O — the contract is a static, hand-maintained constant.
 */
export { contract as ledgerContract } from "./contract";
export type {
  LedgerContract,
  LedgerOperation,
  LedgerDirection,
  ForbiddenPattern,
} from "./types";
