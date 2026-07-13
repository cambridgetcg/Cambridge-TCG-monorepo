import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const matchmaker = vi.hoisted(() => ({ tickMatchmaker: vi.fn() }));
vi.mock("@/lib/agents/matchmaker", () => matchmaker);
vi.mock("@/lib/cron-auth", () => ({ requireCronAuth: vi.fn(() => null) }));

describe("agent matchmaker closed boundary", () => {
  it("returns 503 without invoking the matchmaker", async () => {
    const response = await GET(
      new Request("https://cambridgetcg.example/api/cron/agent-matchmaker"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "agent-matchmaker-disabled",
      mutation_performed: false,
    });
    expect(matchmaker.tickMatchmaker).not.toHaveBeenCalled();
  });
});
