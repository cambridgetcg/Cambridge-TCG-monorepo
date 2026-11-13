import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, toolCategories } from "@/lib/agent-tools-catalog";
import { TOOL_REFUSAL_CODES } from "@/lib/agents/refusals";
import { GET } from "./route";

function catalog(query = "") {
  return GET(new NextRequest(`https://cambridgetcg.com/api/mcp/catalog${query}`));
}

describe("/api/mcp/catalog", () => {
  it("offers every category that has tools as a filter", async () => {
    const body = await (await catalog()).json();

    expect(body.data.categories_available).toEqual(toolCategories());
    for (const tool of AGENT_TOOLS) {
      expect(body.data.categories_available).toContain(tool.category);
    }
  });

  it("filters to the Coverage Hunt tools", async () => {
    const body = await (await catalog("?category=coverage")).json();

    expect(body.data.applied_filters).toEqual({ category: "coverage" });
    expect(body.data.tools.map((tool: { dotted_name: string }) => tool.dotted_name)).toEqual([
      "coverage.hunt.list",
      "coverage.hunt.view",
      "coverage.hunt.contribute",
      "coverage.hunt.my_cases",
    ]);
  });

  it("lists agent.revoke_key under the agent category and says any holder can end its key", async () => {
    const body = await (await catalog("?category=agent")).json();

    expect(body.data.tools.map((tool: { dotted_name: string }) => tool.dotted_name)).toEqual([
      "agent.self",
      "agent.revoke_key",
      "agent.act",
    ]);
    expect(body.data.summary.by_authority["key-holder"]).toBe(1);
    expect(body.data.summary.authority).toContain(
      "Any key's holder can end that key with agent.revoke_key.",
    );
  });

  it("describes refusals, with every tool reason code and effect, and shows what an expired case's refusal says", async () => {
    const body = await (await catalog()).json();
    const refusals = body.data.summary.refusals;
    expect(refusals.tool_reason_codes).toEqual([...TOOL_REFUSAL_CODES]);
    expect(Object.keys(refusals.effect)).toEqual(["not_attempted", "not_applied", "unknown"]);
    expect(refusals.docs).toBe("https://cambridgetcg.com/methodology/agents#refusals");

    const contribute = body.data.tools.find((tool: { dotted_name: string }) => tool.dotted_name === "coverage.hunt.contribute");
    const refusal = contribute.example_refusal_shape._meta["cambridgetcg.com/refusal"];
    expect(refusal).toMatchObject({ reason_code: "case_expired", effect: "not_applied" });
    expect(refusal.side_effects.map((entry: { change: string }) => entry.change)).toEqual(["case_marked_resting", "chronicle_row_added"]);

    // The paused writes' example is what the gate sends: tool_not_permitted.
    const deckSave = body.data.tools.find((tool: { dotted_name: string }) => tool.dotted_name === "deck.save");
    expect(deckSave.example_output_shape._meta["cambridgetcg.com/refusal"]).toMatchObject({
      reason_code: "tool_not_permitted",
      terminal: true,
      effect: "not_attempted",
    });
  });

  it("still answers an unknown category with filter help", async () => {
    const body = await (await catalog("?category=nope")).json();

    expect(body.data["@kind"]).toBe("mcp-catalog-filter-help");
    expect(body.data.available_categories).toEqual(toolCategories());
  });

  it("lists agent.act as a signed-act tool, closed by default, whose example is a preview", async () => {
    const body = await (await catalog("?category=agent")).json();
    const act = body.data.tools.find((tool: { dotted_name: string }) => tool.dotted_name === "agent.act");

    expect(act).toMatchObject({ gating: "signed-act", authority: "signing-key-holder", availability: "closed-by-default", since: "unreleased" });
    expect(act.example_input).toEqual({ act: null, preview: "key.mint" });
    expect(act.description).toContain("production has not");
    expect(body.data.summary.by_authority["signing-key-holder"]).toBe(1);
    expect(body.data.summary.by_availability["closed-by-default"]).toBe(1);
    expect(body.data.summary.auth).toContain("agent.act takes a signed act instead of a key");
  });
});
