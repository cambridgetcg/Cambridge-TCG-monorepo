import { describe, expect, it } from "vitest";
import {
  ACCOUNT_ADMISSION_PAUSED_CODE,
  ACCOUNT_ADMISSION_REVIEWED_MODE,
  P2P_COMMITMENT_PAUSED_CODE,
  P2P_COMMITMENT_REVIEWED_MODE,
  RELEASE_GATE_PAUSED_MODE,
  assertAccountAdmissionOpen,
  assertP2PCommitmentOpen,
  isAccountAdmissionOpen,
  isP2PCommitmentOpen,
  p2pCommitmentPauseResponse,
} from "./production-gates";

describe("production release gates", () => {
  it("fails unset and unrecognised runtimes closed", () => {
    expect(isAccountAdmissionOpen({})).toBe(false);
    expect(isP2PCommitmentOpen({})).toBe(false);
    expect(isAccountAdmissionOpen({ NODE_ENV: "staging" })).toBe(false);
    expect(isP2PCommitmentOpen({ NODE_ENV: "staging" })).toBe(false);
  });

  it("fails both boundaries closed in production unless the exact reviewed mode is set", () => {
    expect(isAccountAdmissionOpen({ NODE_ENV: "production" })).toBe(false);
    expect(isAccountAdmissionOpen({
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: "reviewed-adult-terms-v2",
    })).toBe(false);
    expect(isAccountAdmissionOpen({
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: " " + ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).toBe(false);
    expect(isAccountAdmissionOpen({
      NODE_ENV: "production",
      ACCOUNT_ADMISSION_MODE: ACCOUNT_ADMISSION_REVIEWED_MODE,
    })).toBe(true);

    expect(isP2PCommitmentOpen({ NODE_ENV: "production" })).toBe(false);
    expect(isP2PCommitmentOpen({
      NODE_ENV: "production",
      P2P_COMMITMENT_MODE: "REVIEWED-ADULT-HUMAN-REVIEW-V1",
    })).toBe(false);
    expect(isP2PCommitmentOpen({
      NODE_ENV: "production",
      P2P_COMMITMENT_MODE: P2P_COMMITMENT_REVIEWED_MODE,
    })).toBe(true);
  });

  it("keeps development and tests open unless explicitly paused", () => {
    expect(isAccountAdmissionOpen({ NODE_ENV: "development" })).toBe(true);
    expect(isP2PCommitmentOpen({ NODE_ENV: "test" })).toBe(true);
    expect(isAccountAdmissionOpen({
      NODE_ENV: "test",
      ACCOUNT_ADMISSION_MODE: RELEASE_GATE_PAUSED_MODE,
    })).toBe(false);
    expect(isP2PCommitmentOpen({
      NODE_ENV: "development",
      P2P_COMMITMENT_MODE: RELEASE_GATE_PAUSED_MODE,
    })).toBe(false);
  });

  it("throws typed backstop errors before a DAL write", () => {
    expect(() => assertAccountAdmissionOpen({ NODE_ENV: "production" })).toThrow(
      expect.objectContaining({ code: ACCOUNT_ADMISSION_PAUSED_CODE, status: 503 }),
    );
    expect(() => assertP2PCommitmentOpen({ NODE_ENV: "production" })).toThrow(
      expect.objectContaining({ code: P2P_COMMITMENT_PAUSED_CODE, status: 503 }),
    );
  });

  it("returns a no-store 503 response while the P2P route boundary is paused", async () => {
    const commitment = p2pCommitmentPauseResponse({ NODE_ENV: "production" });

    expect(commitment?.status).toBe(503);
    expect(commitment?.headers.get("retry-after")).toBe("3600");
    await expect(commitment?.json()).resolves.toMatchObject({
      code: P2P_COMMITMENT_PAUSED_CODE,
    });
  });
});
