/**
 * Reversible release controls for product boundaries that need evidence
 * outside a green build. Production is fail-closed: only the exact reviewed
 * mode opens a boundary. Only explicit local-development and test runtimes
 * default open; an unknown runtime fails closed. Either can exercise the
 * paused path explicitly.
 */

export const ACCOUNT_ADMISSION_REVIEWED_MODE = "reviewed-adult-terms-v1";
export const P2P_COMMITMENT_REVIEWED_MODE = "reviewed-adult-human-review-v1";
export const RELEASE_GATE_PAUSED_MODE = "paused";

export const ACCOUNT_ADMISSION_PAUSED_CODE = "ACCOUNT_ADMISSION_PAUSED";
export const P2P_COMMITMENT_PAUSED_CODE = "P2P_COMMITMENT_PAUSED";

export const ACCOUNT_ADMISSION_PAUSED_MESSAGE =
  "New account registration is paused while the adult-account and versioned-terms boundary is reviewed. Existing account holders can still sign in.";

export const P2P_COMMITMENT_PAUSED_MESSAGE =
  "New marketplace commitments are paused while the adult-account and human-review controls are completed. Existing trades and remedies remain available.";

type ReleaseGateEnv = {
  NODE_ENV?: string;
  ACCOUNT_ADMISSION_MODE?: string;
  P2P_COMMITMENT_MODE?: string;
};

function modeIsOpen(
  configuredMode: string | undefined,
  reviewedMode: string,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === "development" || nodeEnv === "test") {
    return configuredMode !== RELEASE_GATE_PAUSED_MODE;
  }
  return configuredMode === reviewedMode;
}

export function isAccountAdmissionOpen(
  env: ReleaseGateEnv = process.env,
): boolean {
  return modeIsOpen(
    env.ACCOUNT_ADMISSION_MODE,
    ACCOUNT_ADMISSION_REVIEWED_MODE,
    env.NODE_ENV,
  );
}

export function isP2PCommitmentOpen(
  env: ReleaseGateEnv = process.env,
): boolean {
  return modeIsOpen(
    env.P2P_COMMITMENT_MODE,
    P2P_COMMITMENT_REVIEWED_MODE,
    env.NODE_ENV,
  );
}

export class AccountAdmissionPausedError extends Error {
  readonly code = ACCOUNT_ADMISSION_PAUSED_CODE;
  readonly status = 503;

  constructor() {
    super(ACCOUNT_ADMISSION_PAUSED_MESSAGE);
    this.name = "AccountAdmissionPausedError";
  }
}

export class P2PCommitmentPausedError extends Error {
  readonly code = P2P_COMMITMENT_PAUSED_CODE;
  readonly status = 503;

  constructor() {
    super(P2P_COMMITMENT_PAUSED_MESSAGE);
    this.name = "P2PCommitmentPausedError";
  }
}

export function assertAccountAdmissionOpen(
  env: ReleaseGateEnv = process.env,
): void {
  if (!isAccountAdmissionOpen(env)) throw new AccountAdmissionPausedError();
}

export function assertP2PCommitmentOpen(
  env: ReleaseGateEnv = process.env,
): void {
  if (!isP2PCommitmentOpen(env)) throw new P2PCommitmentPausedError();
}

export function p2pCommitmentPauseResponse(
  env: ReleaseGateEnv = process.env,
): Response | null {
  if (isP2PCommitmentOpen(env)) return null;
  return pausedResponse(P2P_COMMITMENT_PAUSED_CODE, P2P_COMMITMENT_PAUSED_MESSAGE);
}

function pausedResponse(code: string, error: string): Response {
  return Response.json(
    { error, code },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": "3600",
      },
    },
  );
}
