/**
 * Repair DB-linked identity objects that still carry their temporary
 * `upload-state=pending` tag.
 *
 * The sweep deliberately starts from database references and never lists the
 * private bucket. Unlinked objects therefore remain pending and are removed by
 * the bucket's seven-day lifecycle; linked objects are protected from expiry.
 * Its result contains aggregate counts only.
 */

import { listVerificationDocumentStorageReferences } from "./db";
import {
  getVerificationUploadState,
  isOwnedVerificationKey,
  markVerificationObjectLinked,
} from "./verification-storage";

export interface VerificationStorageSweepResult {
  ranInWindow: boolean;
  scanned: number;
  linked: number;
  alreadyLinked: number;
  supportRequired: number;
  failures: number;
}

function emptyResult(ranInWindow: boolean): VerificationStorageSweepResult {
  return {
    ranInWindow,
    scanned: 0,
    linked: 0,
    alreadyLinked: 0,
    supportRequired: 0,
    failures: 0,
  };
}

export async function runVerificationStorageSweep(
  now = new Date(),
): Promise<VerificationStorageSweepResult> {
  const inWindow =
    now.getUTCHours() === 4 &&
    now.getUTCMinutes() >= 10 &&
    now.getUTCMinutes() < 12;
  if (!inWindow || !process.env.VERIFICATION_S3_BUCKET?.trim()) {
    return emptyResult(false);
  }

  const result = emptyResult(true);
  const references = await listVerificationDocumentStorageReferences();

  for (const reference of references) {
    result.scanned += 1;
    if (!isOwnedVerificationKey(reference.s3Key, reference.userId)) {
      result.supportRequired += 1;
      continue;
    }

    try {
      const state = await getVerificationUploadState(reference.s3Key);
      if (state === "linked") {
        result.alreadyLinked += 1;
        continue;
      }
      if (state === "pending") {
        await markVerificationObjectLinked(reference.s3Key);
        result.linked += 1;
        continue;
      }
      // Missing or unknown state is not overwritten automatically. It needs
      // human review because provenance cannot be established from the DB
      // reference alone and the tag may represent a retention workflow.
      result.supportRequired += 1;
    } catch {
      result.failures += 1;
    }
  }

  return result;
}
