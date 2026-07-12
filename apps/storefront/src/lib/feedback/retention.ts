/**
 * Feedback privacy maintenance.
 *
 * Runs from the existing per-minute maintenance route. Each pass is bounded,
 * concurrency-safe, and idempotent. Message/contact content is redacted;
 * directory receipt actors are detached after their deadline; pseudonymised
 * feedback and receipt rows are deleted after two years; expired HMAC buckets
 * are deleted.
 */

import { query } from "@/lib/db";

const FEEDBACK_BATCH_SIZE = 250;
const DIRECTORY_ACTOR_BATCH_SIZE = 500;
const LIFECYCLE_DELETE_BATCH_SIZE = 500;
const RATE_BUCKET_BATCH_SIZE = 5000;
const LEGACY_PRIVACY_BATCH_SIZE = 5000;

export interface FeedbackRetentionResult {
  redacted: number;
  directoryActorsRedacted: number;
  feedbackLifecycleRowsDeleted: number;
  directoryReceiptsDeleted: number;
  rateBucketsDeleted: number;
  legacyAgentIpBucketsDeleted: number;
  legacyUnsubscribeMetadataCleared: number;
  moreFeedbackMayRemain: boolean;
  moreDirectoryActorsMayRemain: boolean;
  moreFeedbackLifecycleRowsMayRemain: boolean;
  moreDirectoryReceiptsMayRemain: boolean;
  moreRateBucketsMayRemain: boolean;
  moreLegacyAgentIpBucketsMayRemain: boolean;
  moreLegacyUnsubscribeMetadataMayRemain: boolean;
}

export async function runFeedbackRetentionSweep(): Promise<FeedbackRetentionResult> {
  const feedback = await query(
    `WITH due AS (
       SELECT id
         FROM agent_feedback
        WHERE content_expires_at <= NOW()
          AND (
            content_redacted_at IS NULL
            OR reporter_contact IS NOT NULL
            OR notes IS NOT NULL
            OR triaged_by IS NOT NULL
            OR raw_body <> jsonb_build_object('retention_redacted', TRUE)
          )
        ORDER BY content_expires_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE agent_feedback AS feedback
        SET reporter_contact = NULL,
            raw_body = jsonb_build_object('retention_redacted', TRUE),
            notes = NULL,
            triaged_by = NULL,
            content_redacted_at = COALESCE(content_redacted_at, NOW())
       FROM due
      WHERE feedback.id = due.id
     RETURNING feedback.id`,
    [FEEDBACK_BATCH_SIZE],
  );

  const directoryActors = await query(
    `WITH due AS (
       SELECT id
        FROM collective_directory_publication_log
        WHERE actor_user_id IS NOT NULL
          AND actor_expires_at <= NOW()
        ORDER BY actor_expires_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE collective_directory_publication_log AS receipt
        SET actor_user_id = NULL,
            actor_redacted_at = COALESCE(actor_redacted_at, NOW())
       FROM due
      WHERE receipt.id = due.id
     RETURNING receipt.id`,
    [DIRECTORY_ACTOR_BATCH_SIZE],
  );

  const feedbackLifecycle = await query(
    `WITH due AS (
       SELECT feedback.id
         FROM agent_feedback AS feedback
        WHERE feedback.lifecycle_expires_at <= NOW()
          AND NOT EXISTS (
            SELECT 1
              FROM agent_feedback AS child
             WHERE child.duplicate_of_id = feedback.id
          )
        ORDER BY feedback.lifecycle_expires_at ASC, feedback.id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM agent_feedback AS feedback
      USING due
      WHERE feedback.id = due.id
     RETURNING feedback.id`,
    [LIFECYCLE_DELETE_BATCH_SIZE],
  );

  const directoryReceipts = await query(
    `WITH due AS (
       SELECT id
         FROM collective_directory_publication_log
        WHERE receipt_expires_at <= NOW()
        ORDER BY receipt_expires_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM collective_directory_publication_log AS receipt
      USING due
      WHERE receipt.id = due.id
     RETURNING receipt.id`,
    [LIFECYCLE_DELETE_BATCH_SIZE],
  );

  const buckets = await query(
    `WITH expired AS (
       SELECT action, subject_hash, window_name, window_start
         FROM privacy_action_rate_buckets
        WHERE expires_at <= NOW()
        ORDER BY expires_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM privacy_action_rate_buckets AS bucket
      USING expired
      WHERE bucket.action = expired.action
        AND bucket.subject_hash = expired.subject_hash
        AND bucket.window_name = expired.window_name
        AND bucket.window_start = expired.window_start
     RETURNING bucket.action`,
    [RATE_BUCKET_BATCH_SIZE],
  );

  // These compatibility schemas remain until a later migration so applying
  // 0119 before the code deploy does not break an in-flight old request.
  // New runtime code never writes them; this bounded cleanup drains any write
  // made during that narrow migration/deploy window or after an unsafe rollback.
  const legacyAgentIpBuckets = await query(
    `WITH due AS (
       SELECT ip_hash, bucket_day
         FROM agent_registration_buckets
        ORDER BY bucket_day ASC, ip_hash ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     DELETE FROM agent_registration_buckets AS bucket
      USING due
      WHERE bucket.ip_hash = due.ip_hash
        AND bucket.bucket_day = due.bucket_day
     RETURNING bucket.ip_hash`,
    [LEGACY_PRIVACY_BATCH_SIZE],
  );

  const legacyUnsubscribeMetadata = await query(
    `WITH due AS (
       SELECT id
         FROM email_unsubscribe_log
        WHERE ip IS NOT NULL OR user_agent IS NOT NULL
        ORDER BY created_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE email_unsubscribe_log AS receipt
        SET ip = NULL,
            user_agent = NULL
       FROM due
      WHERE receipt.id = due.id
     RETURNING receipt.id`,
    [LEGACY_PRIVACY_BATCH_SIZE],
  );

  const redacted = feedback.rows.length;
  const directoryActorsRedacted = directoryActors.rows.length;
  const feedbackLifecycleRowsDeleted = feedbackLifecycle.rows.length;
  const directoryReceiptsDeleted = directoryReceipts.rows.length;
  const rateBucketsDeleted = buckets.rows.length;
  const legacyAgentIpBucketsDeleted = legacyAgentIpBuckets.rows.length;
  const legacyUnsubscribeMetadataCleared = legacyUnsubscribeMetadata.rows.length;
  return {
    redacted,
    directoryActorsRedacted,
    feedbackLifecycleRowsDeleted,
    directoryReceiptsDeleted,
    rateBucketsDeleted,
    legacyAgentIpBucketsDeleted,
    legacyUnsubscribeMetadataCleared,
    moreFeedbackMayRemain: redacted === FEEDBACK_BATCH_SIZE,
    moreDirectoryActorsMayRemain:
      directoryActorsRedacted === DIRECTORY_ACTOR_BATCH_SIZE,
    moreFeedbackLifecycleRowsMayRemain:
      feedbackLifecycleRowsDeleted === LIFECYCLE_DELETE_BATCH_SIZE,
    moreDirectoryReceiptsMayRemain:
      directoryReceiptsDeleted === LIFECYCLE_DELETE_BATCH_SIZE,
    moreRateBucketsMayRemain: rateBucketsDeleted === RATE_BUCKET_BATCH_SIZE,
    moreLegacyAgentIpBucketsMayRemain:
      legacyAgentIpBucketsDeleted === LEGACY_PRIVACY_BATCH_SIZE,
    moreLegacyUnsubscribeMetadataMayRemain:
      legacyUnsubscribeMetadataCleared === LEGACY_PRIVACY_BATCH_SIZE,
  };
}
