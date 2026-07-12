import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canInvokeAgentTool } from "./tool-access";

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
      "catalog.search",
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
    expect(canInvokeAgentTool("self-serve", "future.write")).toBe(false);
  });

  it("excludes legacy self-serve queue rows from the matchmaker", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agents/matchmaker.ts"),
      "utf8",
    );
    expect(source).toContain("a.registered_via = 'operator'");
  });
});
