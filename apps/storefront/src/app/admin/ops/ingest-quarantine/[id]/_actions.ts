"use server";

/**
 * Resolution-marking action for the ingest-quarantine review surface.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 4.4). The wrapper writes to admin_actions_log for governance
 * and revalidates the listing.
 */

import { adminAction, ActionInputError } from "@/lib/admin/actions";
import { wsQuery } from "@/lib/admin/db";

const VALID_RESOLUTIONS = ["reprocess", "discard", "manual-fix", "upstream-bug"] as const;
type Resolution = (typeof VALID_RESOLUTIONS)[number];

function isResolution(v: string): v is Resolution {
  return (VALID_RESOLUTIONS as readonly string[]).includes(v);
}

export async function resolveQuarantine(input: {
  id: number;
  resolution: string;
  note?: string;
}) {
  return adminAction({
    action: "quarantine.resolve",
    targetKind: "ingest_quarantine",
    targetId: String(input.id),
    reason: input.note ?? `Marked ${input.resolution}`,
    revalidate: "/admin/ops/ingest-quarantine",
    run: async (actor) => {
      if (!isResolution(input.resolution)) {
        throw new ActionInputError(
          `resolution must be one of ${VALID_RESOLUTIONS.join(", ")}`,
        );
      }
      const r = await wsQuery<{ id: number; reviewed_at: string }>(
        `UPDATE ingest_quarantine
            SET reviewed_at = now(),
                reviewed_by = $1,
                resolution  = $2
          WHERE id = $3
          RETURNING id, reviewed_at::text AS reviewed_at`,
        [actor.email ?? "admin", input.resolution, input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Quarantine row not found");
      }
      return r.rows[0];
    },
  });
}

export async function reopenQuarantine(input: { id: number }) {
  return adminAction({
    action: "quarantine.reopen",
    targetKind: "ingest_quarantine",
    targetId: String(input.id),
    reason: "Reopened for re-review",
    revalidate: "/admin/ops/ingest-quarantine",
    run: async () => {
      const r = await wsQuery<{ id: number }>(
        `UPDATE ingest_quarantine
            SET reviewed_at = NULL,
                reviewed_by = NULL,
                resolution  = NULL
          WHERE id = $1
          RETURNING id`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Quarantine row not found");
      }
      return r.rows[0];
    },
  });
}
