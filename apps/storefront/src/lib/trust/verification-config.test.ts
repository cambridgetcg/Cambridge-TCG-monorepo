import { describe, expect, it } from "vitest";
import {
  IDENTITY_VERIFICATION_REVIEWED_MODE,
  isIdentityVerificationCollectionAvailable,
} from "./verification-config";

describe("identity-verification collection gate", () => {
  it("fails closed unless the reviewed private-storage mode is exact", () => {
    for (const value of [undefined, "", "enabled", "reviewed", "REVIEWED-PRIVATE-STORAGE"]) {
      expect(isIdentityVerificationCollectionAvailable({
        IDENTITY_VERIFICATION_MODE: value,
      })).toBe(false);
    }
    expect(isIdentityVerificationCollectionAvailable({
      IDENTITY_VERIFICATION_MODE: ` ${IDENTITY_VERIFICATION_REVIEWED_MODE} `,
    })).toBe(true);
  });
});
