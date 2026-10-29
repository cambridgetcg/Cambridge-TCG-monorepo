import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AGENT_KEY_REVOCATION,
  canInvokeAgentTool,
  describeAgentToolGrant,
  reviewSubmissionsByRegistration,
  SELF_LIFECYCLE_TOOLS,
} from "./tool-access";

describe("agent tool authority boundary", () => {
  it("keeps match and deck writes closed for every key", () => {
    for (const tool of [
      "play.take_action",
      "play.queue_match",
      "play.cancel_queue",
      "deck.save",
    ]) {
      expect(canInvokeAgentTool("self-serve", tool)).toBe(false);
      expect(canInvokeAgentTool("operator", tool)).toBe(false);
    }
  });

  it("allows self-serve keys to use read and status tools", () => {
    for (const tool of [
      "agent.self",
      "catalog.lookup_many",
      "catalog.search",
      "coverage.hunt.list",
      "coverage.hunt.my_cases",
      "coverage.hunt.view",
      "leaderboards.read",
      "prices.recent",
      "play.list_open_rooms",
      "play.observe",
      "play.legal_actions",
      "play.match_history",
    ]) {
      expect(canInvokeAgentTool("self-serve", tool)).toBe(true);
    }
    expect(canInvokeAgentTool("operator", "deck.list_mine")).toBe(true);
    expect(canInvokeAgentTool("self-serve", "deck.list_mine")).toBe(false);
    expect(canInvokeAgentTool("operator", "coverage.hunt.contribute")).toBe(true);
    expect(canInvokeAgentTool("self-serve", "coverage.hunt.contribute")).toBe(false);
    expect(canInvokeAgentTool("self-serve", "future.write")).toBe(false);
  });

  it("never admits agent.revoke_key through the normal dispatch path", () => {
    expect([...SELF_LIFECYCLE_TOOLS]).toEqual(["agent.revoke_key"]);
    for (const tool of SELF_LIFECYCLE_TOOLS) {
      expect(canInvokeAgentTool("operator", tool)).toBe(false);
      expect(canInvokeAgentTool("self-serve", tool)).toBe(false);
    }
  });

  it("describes each grant from the same sets the gate enforces", () => {
    const operator = describeAgentToolGrant("operator");
    const selfServe = describeAgentToolGrant("self-serve");

    expect(operator.reads).toContain("deck.list_mine");
    expect(selfServe.reads).not.toContain("deck.list_mine");
    expect(operator.review_submissions).toEqual(["coverage.hunt.contribute"]);
    expect(selfServe.review_submissions).toEqual([]);
    for (const grant of [operator, selfServe]) {
      expect(grant.self_lifecycle).toEqual(["agent.revoke_key"]);
      expect(grant.domain_writes).toEqual([]);
      expect(grant.reads).not.toContain("coverage.hunt.contribute");
      expect(grant.reads).not.toContain("agent.revoke_key");
      expect(grant.operational_metadata_writes.join(" ")).toContain("rate-limit");
      expect(grant.operational_metadata_writes.join(" ")).toContain("last_used_at");
      expect(grant.operational_metadata_writes).toContain(
        "agent_keys.revoked_at and revoked_reason for this key when its holder calls agent.revoke_key with confirm: true",
      );
    }
    for (const [via, grant] of [
      ["operator", operator],
      ["self-serve", selfServe],
    ] as const) {
      for (const tool of [...grant.reads, ...grant.review_submissions]) {
        expect(canInvokeAgentTool(via, tool)).toBe(true);
      }
    }
  });

  it("publishes one revocation door and review submissions by registration kind", () => {
    expect(SELF_LIFECYCLE_TOOLS.has(AGENT_KEY_REVOCATION.tool)).toBe(true);
    expect(AGENT_KEY_REVOCATION.scope).toBe("the presented key only");
    expect(reviewSubmissionsByRegistration()).toEqual({
      operator_managed: describeAgentToolGrant("operator").review_submissions,
      self_serve: describeAgentToolGrant("self-serve").review_submissions,
    });
    reviewSubmissionsByRegistration().self_serve.push("coverage.hunt.contribute");
    expect(reviewSubmissionsByRegistration().self_serve).toEqual([]);
  });

  it("returns fresh arrays so a caller cannot widen the next grant", () => {
    describeAgentToolGrant("self-serve").review_submissions.push("coverage.hunt.contribute");
    describeAgentToolGrant("self-serve").operational_metadata_writes.length = 0;
    expect(describeAgentToolGrant("self-serve").review_submissions).toEqual([]);
    expect(describeAgentToolGrant("self-serve").operational_metadata_writes).toHaveLength(3);
  });

  it("excludes legacy self-serve queue rows from the matchmaker", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agents/matchmaker.ts"),
      "utf8",
    );
    expect(source).toContain("a.registered_via = 'operator'");
  });
});
