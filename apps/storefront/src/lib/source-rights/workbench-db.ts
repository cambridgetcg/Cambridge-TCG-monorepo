/** Database persistence for non-effective source-rights review proposals. */

import { query, transaction } from "@/lib/db";
import {
  allowedSourceRightsTransition,
  buildSourceRightsArtifact,
  deployedRegistryHash,
  parseSourceRightsProposal,
  sourceRightsRevisionHash,
  type SourceRightsEvidence,
  type SourceRightsProposalContent,
  type SourceRightsReviewCell,
  type SourceRightsReviewState,
} from "./workbench";

export interface SourceRightsReviewRow {
  id: string;
  source_id: string;
  parent_review_id: string | null;
  state: SourceRightsReviewState;
  base_registry_hash: string;
  revision_hash: string;
  summary: string;
  public_evidence: SourceRightsEvidence[];
  agreement_reference: string | null;
  valid_until: string | null;
  review_trigger: string;
  decision_note: string | null;
  landed_commit: string | null;
  created_by: string | null;
  created_at: string;
  cells?: SourceRightsReviewCell[];
}

export interface SourceRightsReviewSummary {
  source_id: string;
  id: string;
  state: SourceRightsReviewState;
  revision_hash: string;
  summary: string;
  valid_until: string | null;
  created_at: string;
  cell_count: number;
}

function shapeRow(row: Record<string, unknown>): SourceRightsReviewRow {
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    parent_review_id: row.parent_review_id ? String(row.parent_review_id) : null,
    state: row.state as SourceRightsReviewState,
    base_registry_hash: String(row.base_registry_hash).trim(),
    revision_hash: String(row.revision_hash).trim(),
    summary: String(row.summary),
    public_evidence: (row.public_evidence ?? []) as SourceRightsEvidence[],
    agreement_reference: row.agreement_reference ? String(row.agreement_reference) : null,
    valid_until: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    review_trigger: String(row.review_trigger),
    decision_note: row.decision_note ? String(row.decision_note) : null,
    landed_commit: row.landed_commit ? String(row.landed_commit).trim() : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: new Date(String(row.created_at)).toISOString(),
  };
}

export async function listLatestSourceRightsReviews(): Promise<SourceRightsReviewSummary[]> {
  const result = await query(
    `SELECT DISTINCT ON (v.source_id)
       v.source_id, v.id, v.state, v.revision_hash, v.summary,
       v.valid_until::text, v.created_at,
       (SELECT COUNT(*)::int FROM source_rights_review_cells c WHERE c.review_id = v.id) AS cell_count
     FROM source_rights_review_versions v
     ORDER BY v.source_id, v.created_at DESC, v.id DESC`,
  );
  return result.rows.map((row) => ({
    source_id: String(row.source_id),
    id: String(row.id),
    state: row.state as SourceRightsReviewState,
    revision_hash: String(row.revision_hash).trim(),
    summary: String(row.summary),
    valid_until: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
    created_at: new Date(String(row.created_at)).toISOString(),
    cell_count: Number(row.cell_count),
  }));
}

export async function getSourceRightsReviewHistory(
  sourceId: string,
): Promise<SourceRightsReviewRow[]> {
  const versions = await query(
    `SELECT * FROM source_rights_review_versions
      WHERE source_id = $1
      ORDER BY created_at DESC, id DESC`,
    [sourceId],
  );
  if (versions.rows.length === 0) return [];
  const ids = versions.rows.map((row) => String(row.id));
  const cells = await query(
    `SELECT review_id, proposed_field_path, purpose, verdict,
            conditions, attribution, retention_days
       FROM source_rights_review_cells
      WHERE review_id = ANY($1::uuid[])
      ORDER BY proposed_field_path, purpose`,
    [ids],
  );
  const byReview = new Map<string, SourceRightsReviewCell[]>();
  for (const row of cells.rows) {
    const reviewId = String(row.review_id);
    const existing = byReview.get(reviewId) ?? [];
    existing.push({
      proposed_field_path: String(row.proposed_field_path),
      purpose: row.purpose,
      verdict: row.verdict,
      conditions: row.conditions ? String(row.conditions) : null,
      attribution: row.attribution ? String(row.attribution) : null,
      retention_days: row.retention_days == null ? null : Number(row.retention_days),
    } as SourceRightsReviewCell);
    byReview.set(reviewId, existing);
  }
  return versions.rows.map((row) => ({
    ...shapeRow(row),
    cells: byReview.get(String(row.id)) ?? [],
  }));
}

export async function getSourceRightsReview(
  sourceId: string,
  reviewId: string,
): Promise<SourceRightsReviewRow | null> {
  const history = await getSourceRightsReviewHistory(sourceId);
  return history.find((review) => review.id === reviewId) ?? null;
}

export async function createSourceRightsDraft(args: {
  sourceId: string;
  createdBy: string;
  body: unknown;
}): Promise<SourceRightsReviewRow> {
  const content = parseSourceRightsProposal(args.body, { sourceId: args.sourceId });
  return transaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock(hashtext('source-rights-review'), hashtext($1))`, [args.sourceId]);
    const latestResult = await q(
      `SELECT id, revision_hash, state FROM source_rights_review_versions
        WHERE source_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [args.sourceId],
    );
    const latest = latestResult.rows[0] as { id?: string; revision_hash?: string; state?: SourceRightsReviewState } | undefined;
    if (latest?.state === "draft" || latest?.state === "proposed") {
      throw new Error("Finish the current open review before starting another draft.");
    }
    const artifact = buildSourceRightsArtifact({
      sourceId: args.sourceId,
      state: "draft",
      content,
      parentRevisionHash: latest?.revision_hash?.trim() ?? null,
    });
    return insertRevision(q, {
      sourceId: args.sourceId,
      parentReviewId: latest?.id ?? null,
      createdBy: args.createdBy,
      artifact,
    });
  });
}

export async function transitionSourceRightsReview(args: {
  sourceId: string;
  reviewId: string;
  createdBy: string;
  to: Exclude<SourceRightsReviewState, "draft">;
  landedCommit?: string | null;
  decisionNote?: string | null;
}): Promise<SourceRightsReviewRow> {
  return transaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock(hashtext('source-rights-review'), hashtext($1))`, [args.sourceId]);
    const parentResult = await q(
      `SELECT * FROM source_rights_review_versions
        WHERE id = $1::uuid AND source_id = $2
        FOR UPDATE`,
      [args.reviewId, args.sourceId],
    );
    if (parentResult.rows.length === 0) throw new Error("Review not found.");
    const parent = shapeRow(parentResult.rows[0]);
    if (!allowedSourceRightsTransition(parent.state, args.to)) {
      throw new Error(`Review cannot move from '${parent.state}' to '${args.to}'.`);
    }
    if (args.to === "proposed" || args.to === "landed") {
      const today = new Date().toISOString().slice(0, 10);
      if (parent.valid_until && parent.valid_until < today) {
        throw new Error("Review validity has expired; reject it and record a fresh draft.");
      }
      if (parent.base_registry_hash !== deployedRegistryHash(args.sourceId)) {
        throw new Error("Deployed registry changed; reject this stale review and record a fresh draft.");
      }
    }
    const childResult = await q(
      `SELECT * FROM source_rights_review_versions
        WHERE parent_review_id = $1::uuid
        ORDER BY created_at ASC, id ASC LIMIT 1`,
      [parent.id],
    );
    if (childResult.rows[0]) {
      const existingChild = shapeRow(childResult.rows[0]);
      if (
        existingChild.state === args.to &&
        (args.to !== "landed" || existingChild.landed_commit === args.landedCommit)
      ) {
        const existingCells = await q(
          `SELECT proposed_field_path, purpose, verdict, conditions, attribution, retention_days
             FROM source_rights_review_cells WHERE review_id = $1::uuid
             ORDER BY proposed_field_path, purpose`,
          [existingChild.id],
        );
        return {
          ...existingChild,
          cells: existingCells.rows.map((row) => ({
            proposed_field_path: String(row.proposed_field_path),
            purpose: row.purpose,
            verdict: row.verdict,
            conditions: row.conditions ? String(row.conditions) : null,
            attribution: row.attribution ? String(row.attribution) : null,
            retention_days: row.retention_days == null ? null : Number(row.retention_days),
          } as SourceRightsReviewCell)),
        };
      }
      throw new Error("Review already has a successor revision; branching is not allowed.");
    }
    const cellResult = await q(
      `SELECT proposed_field_path, purpose, verdict, conditions, attribution, retention_days
         FROM source_rights_review_cells WHERE review_id = $1::uuid
         ORDER BY proposed_field_path, purpose`,
      [args.reviewId],
    );
    const content: SourceRightsProposalContent = {
      summary: parent.summary,
      public_evidence: parent.public_evidence,
      agreement_reference: parent.agreement_reference,
      valid_until: parent.valid_until,
      review_trigger: parent.review_trigger,
      cells: cellResult.rows.map((row) => ({
        proposed_field_path: String(row.proposed_field_path),
        purpose: row.purpose,
        verdict: row.verdict,
        conditions: row.conditions ? String(row.conditions) : null,
        attribution: row.attribution ? String(row.attribution) : null,
        retention_days: row.retention_days == null ? null : Number(row.retention_days),
      } as SourceRightsReviewCell)),
    };
    const artifact = buildSourceRightsArtifact({
      sourceId: args.sourceId,
      state: args.to,
      content,
      baseRegistryHash: parent.base_registry_hash,
      parentRevisionHash: parent.revision_hash,
      decisionNote: args.decisionNote,
      landedCommit: args.landedCommit,
    });
    return insertRevision(q, {
      sourceId: args.sourceId,
      parentReviewId: parent.id,
      createdBy: args.createdBy,
      artifact,
    });
  });
}

type TransactionQuery = Parameters<Parameters<typeof transaction>[0]>[0];

async function insertRevision(
  q: TransactionQuery,
  args: {
    sourceId: string;
    parentReviewId: string | null;
    createdBy: string;
    artifact: ReturnType<typeof buildSourceRightsArtifact>;
  },
): Promise<SourceRightsReviewRow> {
  const revisionHash = sourceRightsRevisionHash(args.artifact);
  const inserted = await q(
    `INSERT INTO source_rights_review_versions
      (source_id, parent_review_id, state, base_registry_hash, revision_hash,
       summary, public_evidence, agreement_reference, valid_until,
       review_trigger, decision_note, landed_commit, created_by)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8, $9::date, $10, $11, $12, $13::uuid)
     ON CONFLICT (revision_hash) DO NOTHING
     RETURNING *`,
    [
      args.sourceId,
      args.parentReviewId,
      args.artifact.state,
      args.artifact.base_registry_hash,
      revisionHash,
      args.artifact.summary,
      JSON.stringify(args.artifact.public_evidence),
      args.artifact.agreement_reference,
      args.artifact.valid_until,
      args.artifact.review_trigger,
      args.artifact.decision_note,
      args.artifact.landed_commit,
      args.createdBy,
    ],
  );
  let row = inserted.rows[0];
  if (!row) {
    const existing = await q(
      `SELECT * FROM source_rights_review_versions WHERE revision_hash = $1`,
      [revisionHash],
    );
    row = existing.rows[0];
  } else {
    for (const cell of args.artifact.cells) {
      await q(
        `INSERT INTO source_rights_review_cells
          (review_id, proposed_field_path, purpose, verdict, conditions, attribution, retention_days)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
        [
          row.id,
          cell.proposed_field_path,
          cell.purpose,
          cell.verdict,
          cell.conditions,
          cell.attribution,
          cell.retention_days,
        ],
      );
    }
  }
  return { ...shapeRow(row), cells: args.artifact.cells };
}
