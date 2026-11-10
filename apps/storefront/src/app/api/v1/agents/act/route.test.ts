import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ query: vi.fn(), transaction: vi.fn() }));
const mocks = vi.hoisted(() => ({ submitAgentAct: vi.fn() }));
vi.mock("@/lib/agents/signed-acts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/signed-acts")>();
  mocks.submitAgentAct.mockImplementation(actual.submitAgentAct);
  return { ...actual, submitAgentAct: mocks.submitAgentAct };
});

import { query, transaction } from "@/lib/db";
import { signedActLimitedRefusal, signedActRefusal } from "@/lib/agents/refusals";
import { POST } from "./route";

// POST /api/v1/agents/act: the REST twin of agent.act, same body, same
// answers; closed by default, and closed it reads neither body nor database.

const BEARER = "Bearer ctcg_agt_" + "Ab1".repeat(7) + "Z";

function post(body: string, headers: Record<string, string> = {}) {
  return new Request("https://cambridgetcg.com/api/v1/agents/act", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("AGENT_SIGNED_ACTS", "");
  vi.mocked(query).mockReset();
  vi.mocked(transaction).mockReset();
  mocks.submitAgentAct.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/v1/agents/act", () => {
  it("closed, answers signed_acts_closed without reading the body or the database", async () => {
    const req = post(JSON.stringify({ act: "a.b.c", preview: null }), { authorization: BEARER });
    const response = await POST(req);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      error: "Signed acts are closed on this deployment. Nothing was read or changed.",
      refusal: signedActRefusal("signed_acts_closed"),
    });
    expect(req.bodyUsed).toBe(false);
    expect(mocks.submitAgentAct).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  describe("open", () => {
    beforeEach(() => {
      vi.stubEnv("AGENT_SIGNED_ACTS", "on");
      vi.stubEnv("AGENT_SIGNED_ACTS_AUDIENCE", "https://cambridgetcg.com");
    });

    it("answers a preview with the tool's body, whatever Authorization says", async () => {
      const bodies = [];
      for (const headers of [{}, { authorization: BEARER }, { authorization: "Basic eA==" }]) {
        const response = await POST(post(JSON.stringify({ preview: "signer.check", act: null }), { ...headers, "cf-connecting-ip": "203.0.113.5" }));
        expect(response.status).toBe(200);
        const { server_time: _t, ...body } = await response.json();
        bodies.push(body);
      }
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
      expect(bodies[0]).toMatchObject({ preview: "signer.check", writes: "nothing" });
      for (const [args, context] of mocks.submitAgentAct.mock.calls) {
        expect(args).toEqual({ preview: "signer.check", act: null });
        expect(context).toEqual({ clientAddress: "203.0.113.5" });
      }
      expect(query).not.toHaveBeenCalled();
    });

    it("refuses an oversized body, duplicate names and non-JSON before the act path", async () => {
      const big = await POST(post(JSON.stringify({ act: "a".repeat(20_000) })));
      expect(big.status).toBe(413);
      expect((await big.json()).refusal.reason_code).toBe("act_malformed");
      const duplicate = await POST(post('{"act":"a.b.c","act":"d.e.f"}'));
      expect(duplicate.status).toBe(400);
      expect((await duplicate.json()).refusal).toMatchObject({ reason_code: "act_malformed", detail: "request body is not a JSON object without duplicate names" });
      expect((await POST(post("not json"))).status).toBe(400);
      expect(mocks.submitAgentAct).not.toHaveBeenCalled();
      // A JSON body that is not an object reaches the act path, which refuses it.
      const array = await POST(post("[]"));
      expect(array.status).toBe(400);
      expect((await array.json()).refusal.reason_code).toBe("act_malformed");
    });

    it("carries the act path's status and Retry-After", async () => {
      mocks.submitAgentAct.mockResolvedValueOnce({
        ok: false, status: 429, message: "Too many acts.", refusal: signedActLimitedRefusal(9), verified: false, retryAfterSeconds: 9,
      });
      const response = await POST(post(JSON.stringify({ act: "x", preview: null })));
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("9");
      expect(await response.json()).toEqual({ error: "Too many acts.", refusal: signedActLimitedRefusal(9) });
    });
  });
});
