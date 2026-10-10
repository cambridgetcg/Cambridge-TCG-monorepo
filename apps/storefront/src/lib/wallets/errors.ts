export type WalletLinkErrorCode =
  | "WALLET_LINKING_UNAVAILABLE"
  | "WALLET_LINK_STORAGE_UNAVAILABLE"
  | "ORIGIN_MISMATCH"
  | "SESSION_BINDING_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "INVALID_ADDRESS"
  | "ADDRESS_MISMATCH"
  | "UNSUPPORTED_CHAIN"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_USED"
  | "CHALLENGE_INVALIDATED"
  | "CHALLENGE_RATE_LIMITED"
  | "CHALLENGE_ATTEMPT_LIMITED"
  | "VERIFICATION_RATE_LIMITED"
  | "MESSAGE_MISMATCH"
  | "INVALID_SIWE_MESSAGE"
  | "INVALID_SIGNATURE"
  | "SIGNATURE_VERIFICATION_UNAVAILABLE"
  | "RPC_CHAIN_MISMATCH"
  | "WALLET_ALREADY_LINKED"
  | "WALLET_LINK_NOT_FOUND";

export class WalletLinkError extends Error {
  constructor(
    public readonly code: WalletLinkErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WalletLinkError";
  }
}

export function asWalletLinkError(error: unknown): WalletLinkError {
  if (error instanceof WalletLinkError) return error;
  return new WalletLinkError(
    "WALLET_LINK_STORAGE_UNAVAILABLE",
    "Wallet linking is temporarily unavailable. Please try again later.",
    503,
  );
}
