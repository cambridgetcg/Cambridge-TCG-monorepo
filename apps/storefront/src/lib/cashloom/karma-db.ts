import "server-only";

import { query } from "@/lib/db";
import {
  evaluateCashloomKarma,
  unavailableCashloomKarmaDecision,
  type CashloomKarmaDecision,
  type CashloomKarmaPurpose,
} from "./karma";

const MAX_EVIDENCE = 64;

interface KarmaSignalRow {
  signal_type: unknown;
  severity: unknown;
  created_at: unknown;
}

/**
 * Read only the current participant's unresolved local observations. The
 * projection intentionally excludes descriptions, notes, trade ids, email,
 * wallet data, network coordinates, and the database observation id.
 */
export async function getCashloomKarmaDecision(
  userId: string,
  purpose: CashloomKarmaPurpose,
  evaluatedAt = new Date().toISOString(),
): Promise<Readonly<CashloomKarmaDecision>> {
  try {
    const result = await query(
      `SELECT signal_type, severity, created_at
         FROM fraud_signals
        WHERE user_id = $1
          AND resolved = false
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, MAX_EVIDENCE + 1],
    );
    const rows = result.rows as KarmaSignalRow[];
    return evaluateCashloomKarma({
      purpose,
      evaluated_at: evaluatedAt,
      evidence_truncated: rows.length > MAX_EVIDENCE,
      signals: rows.slice(0, MAX_EVIDENCE).map((row) => ({
        signal_type: row.signal_type,
        severity: row.severity,
        observed_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at,
      })),
    });
  } catch {
    return unavailableCashloomKarmaDecision(purpose, evaluatedAt);
  }
}
