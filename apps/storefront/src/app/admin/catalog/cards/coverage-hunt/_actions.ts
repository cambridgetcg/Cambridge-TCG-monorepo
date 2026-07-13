"use server";

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import {
  getCoverageHuntCase,
  persistCoverageHuntResolution,
} from "@/lib/coverage-hunt/db";
import {
  COVERAGE_HUNT_RESOLUTIONS,
  type CoverageHuntResolution,
} from "@/lib/coverage-hunt/types";

export interface ResolutionActionState {
  ok: boolean;
  message: string;
}

export async function resolveCoverageHuntAction(
  _previous: ResolutionActionState,
  formData: FormData,
): Promise<ResolutionActionState> {
  const caseId = String(formData.get("case_id") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  const result = await adminAction({
    action: "coverage_hunt.resolve",
    targetKind: "coverage_hunt_case",
    targetId: caseId,
    reason,
    auditActorLabel: "admin-reviewer",
    revalidate: "/admin/catalog/cards/coverage-hunt",
    run: async () => {
      if (!caseId) throw new ActionInputError("Case id is required.");
      if (!(COVERAGE_HUNT_RESOLUTIONS as readonly string[]).includes(resolution)) {
        throw new ActionInputError("Choose a valid resolution.");
      }
      if (!reason) throw new ActionInputError("A plain-language review reason is required.");
      const before = await getCoverageHuntCase(caseId);
      if (!before) throw new ActionInputError("Coverage Hunt case not found.");
      if (before.status !== "ready_for_human" && before.status !== "resolved") {
        throw new ActionInputError(
          `This case is ${before.status}, not ready_for_human or resolved.`,
        );
      }
      const persisted = await persistCoverageHuntResolution({
        case_id: caseId,
        resolution: resolution as CoverageHuntResolution,
        reason,
      });
      if (!persisted.ok) throw new ActionInputError(persisted.message);
      return {
        case_id: caseId,
        resolution: persisted.case.resolution,
        authoritative_effect: "none",
        apply_transition_exists: false,
      };
    },
  });

  return result.ok
    ? { ok: true, message: "Review recorded. No catalog or source data was changed." }
    : { ok: false, message: result.error };
}
