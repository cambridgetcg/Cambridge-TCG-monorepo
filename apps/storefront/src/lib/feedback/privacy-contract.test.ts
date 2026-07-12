import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("feedback privacy contract", () => {
  it("gives every report an explicit 180-day content deadline", () => {
    const sql = source("drizzle/0119_feedback_retention.sql");
    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("content_expires_at timestamptz");
    expect(sql).toContain("content_redacted_at timestamptz");
    expect(sql).toContain("received_at + INTERVAL '180 days'");
    expect(sql).toContain("received_at + INTERVAL '2 years'");
    expect(sql).toContain("privacy_action_rate_buckets");
    expect(sql).toContain("subject_hash    char(64)");
    expect(sql).toContain("DELETE FROM agent_registration_buckets");
    expect(sql).toContain("UPDATE email_unsubscribe_log");
    expect(sql).toContain("ip = NULL");
    expect(sql).toContain("user_agent = NULL");
  });

  it("redacts content, then deletes pseudonymised lifecycle rows on schedule", () => {
    const retention = source("src/lib/feedback/retention.ts");
    expect(retention).toContain("reporter_contact = NULL");
    expect(retention).toContain("raw_body = jsonb_build_object('retention_redacted', TRUE)");
    expect(retention).toContain("notes = NULL");
    expect(retention).toContain("triaged_by = NULL");
    expect(retention).toContain("content_redacted_at = COALESCE(content_redacted_at, NOW())");
    expect(retention).toContain("content_expires_at <= NOW()");
    expect(retention).toContain("DELETE FROM agent_feedback AS feedback");
    expect(retention).toContain("lifecycle_expires_at <= NOW()");
    expect(retention).toContain("DELETE FROM collective_directory_publication_log AS receipt");
    expect(retention).toContain("receipt_expires_at <= NOW()");
    expect(retention).toContain("UPDATE collective_directory_publication_log AS receipt");
    expect(retention).toContain("actor_user_id = NULL");
    expect(retention).toContain("actor_redacted_at = COALESCE(actor_redacted_at, NOW())");
    expect(retention).toContain("DELETE FROM agent_registration_buckets AS bucket");
    expect(retention).toContain("UPDATE email_unsubscribe_log AS receipt");
    expect(retention).toContain("SET ip = NULL");
    expect(retention).toContain("user_agent = NULL");
  });

  it("runs redaction and expired bucket deletion from maintenance", () => {
    const maintenance = source("src/app/api/cron/maintenance/route.ts");
    expect(maintenance).toContain("runFeedbackRetentionSweep()");
    expect(maintenance).toContain("feedbackRetentionSweep");
  });

  it("has no success-shaped logging fallback", () => {
    const route = source("src/app/api/v1/feedback/route.ts");
    expect(route).toContain("Feedback could not be stored, so it was not accepted");
    expect(route).toContain('status: "received"');
    expect(route).toContain("persisted: true");
    expect(route).not.toContain('status: "logged"');
    const operationalLog = route.slice(
      route.indexOf('console.info("[/api/v1/feedback] stored"'),
      route.indexOf("const response = jsonResponse"),
    );
    expect(operationalLog).not.toContain("parsed.reporterContact");
    expect(operationalLog).not.toContain("rawText");
    expect(operationalLog).not.toContain("rawBody");
    expect(operationalLog).not.toContain("storedBody");
  });
});
