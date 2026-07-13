import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COVERAGE_CORRECTION_FIELDS,
  COVERAGE_HUNT_RESOLUTIONS,
} from "./types";

const dbSource = readFileSync(
  fileURLToPath(new URL("./db.ts", import.meta.url)),
  "utf8",
);
const migration = readFileSync(
  fileURLToPath(
    new URL("../../../drizzle/0120_coverage_hunt.sql", import.meta.url),
  ),
  "utf8",
);

describe("Coverage Hunt persistence boundary", () => {
  it("does not import a data writer, classifier, source adapter or pricing module", () => {
    expect(dbSource).not.toMatch(
      /from\s+["'][^"']*(?:wholesale|data-ingest|pricing|classif|archive|source)[^"']*["']/i,
    );
  });

  it("mutates only its own three tables", () => {
    const mutationTargets = Array.from(
      dbSource.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_]+)/gi),
      (match) => match[1].toLowerCase(),
    );
    expect(new Set(mutationTargets)).toEqual(
      new Set([
        "coverage_hunt_cases",
        "coverage_hunt_turns",
        "coverage_hunt_chronicle",
      ]),
    );
  });

  it("cannot represent a value correction or an apply resolution", () => {
    expect(COVERAGE_CORRECTION_FIELDS).toEqual([
      "game_code",
      "set_code",
      "source_id",
      "coverage_status",
      "documentation",
    ]);
    expect(COVERAGE_HUNT_RESOLUTIONS).not.toContain("apply");
    expect(COVERAGE_HUNT_RESOLUTIONS).not.toContain("applied");
  });
});

describe("Coverage Hunt SQL invariants", () => {
  it("pins exactly one turn per role and one role per agent", () => {
    expect(migration).toContain(
      "UNIQUE (case_id, role)",
    );
    expect(migration).toContain(
      "UNIQUE (case_id, agent_id)",
    );
  });

  it("keeps turn content and chronicle rows append-only", () => {
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OR DELETE ON coverage_hunt_turns/,
    );
    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON coverage_hunt_chronicle/,
    );
  });

  it("lets account deletion erase the live agent link without rewriting evidence", () => {
    expect(migration).toMatch(
      /agent_id\s+UUID REFERENCES agents\(id\) ON DELETE SET NULL/,
    );
    expect(migration).toContain("OLD.agent_id IS NOT NULL");
    expect(migration).toContain("NEW.agent_id IS NULL");
    expect(migration).toContain(
      "TG_OP = 'INSERT' AND NEW.agent_id IS NOT NULL",
    );
    for (const unchanged of [
      "NEW.id",
      "NEW.case_id",
      "NEW.role",
      "NEW.client_request_id",
      "NEW.payload",
      "NEW.submitted_at",
    ]) {
      expect(migration).toContain(unchanged);
    }
    expect(migration).not.toMatch(
      /operator_user_id|resolved_by_user_id|actor_user_id|agent_public_handle/,
    );
  });

  it("pins chronicle actor labels to generic protocol roles", () => {
    expect(migration).toContain(
      "actor_kind = 'agent' AND actor_label = 'registered-agent'",
    );
    expect(migration).toContain(
      "actor_kind = 'human' AND actor_label = 'admin-reviewer'",
    );
  });

  it("leaves representation headroom above the 16 KiB application byte limit", () => {
    expect(migration).toContain(
      "CHECK (octet_length(payload::text) <= 32768)",
    );
  });

  it("permits only the finite forward state graph", () => {
    expect(migration).toContain(
      "OLD.status = 'open' AND NEW.status IN ('checking', 'resting')",
    );
    expect(migration).toContain(
      "OLD.status = 'checking' AND NEW.status IN ('mirroring', 'resting')",
    );
    expect(migration).toContain(
      "OLD.status = 'mirroring' AND NEW.status IN ('ready_for_human', 'resting')",
    );
    expect(migration).toContain(
      "OLD.status = 'ready_for_human' AND NEW.status IN ('resolved', 'resting')",
    );
  });
});
