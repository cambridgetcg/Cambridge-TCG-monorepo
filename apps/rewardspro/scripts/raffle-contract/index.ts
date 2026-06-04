/**
 * Top-level: re-exports the typed raffle contract.
 *
 * No I/O — handwritten static contract, same as `ledger-contract`.
 * If raffles grows enough that hand-maintaining ownership rules
 * becomes error-prone, swap for a TS-AST parser of the canonical
 * service files. The shape (typed contract) stays the same.
 */
export { contract as raffleContract } from "./contract";
export type { RaffleContract, TableOwnership } from "./types";
