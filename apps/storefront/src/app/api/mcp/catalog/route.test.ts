import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, toolCategories } from "@/lib/agent-tools-catalog";
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
    ]);
    expect(body.data.summary.by_authority["key-holder"]).toBe(1);
    expect(body.data.summary.authority).toContain(
      "Any key's holder can end that key with agent.revoke_key.",
    );
  });

  it("still answers an unknown category with filter help", async () => {
    const body = await (await catalog("?category=nope")).json();

    expect(body.data["@kind"]).toBe("mcp-catalog-filter-help");
    expect(body.data.available_categories).toEqual(toolCategories());
  });
});
