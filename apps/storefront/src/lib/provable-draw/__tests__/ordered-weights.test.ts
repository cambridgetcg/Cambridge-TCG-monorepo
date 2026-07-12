import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  type CommittedDraw,
  revealDraw,
} from "@/lib/provable-draw";
import {
  captureOrderedWeights,
  pickWeightedInOrder,
  validatedWeightOrder,
} from "@/lib/provable-draw/ordered-weights";
import {
  drawOutcomeReplayReason,
  projectDrawProof,
} from "@/lib/privacy/draw-proof";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const OPTION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPTION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPTION_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("generic draw ordered-weight receipts", () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
    vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  });

  it("replays from the stored array even when jsonb returns object keys in another order", () => {
    const original = captureOrderedWeights({
      [OPTION_B]: 0.2,
      [OPTION_A]: 0.3,
      [OPTION_C]: 0.5,
    });
    const jsonbReorderedWeights = {
      [OPTION_A]: 0.3,
      [OPTION_B]: 0.2,
      [OPTION_C]: 0.5,
    };

    expect(original.weightOrder).toEqual([OPTION_B, OPTION_A, OPTION_C]);
    expect(validatedWeightOrder(jsonbReorderedWeights, original.weightOrder))
      .toEqual(original.weightOrder);
    expect(pickWeightedInOrder(jsonbReorderedWeights, original.weightOrder, 0.1))
      .toBe(OPTION_B);

    const projected = projectDrawProof(jsonbReorderedWeights, {
      picked: OPTION_B,
      roll: 0.1,
      weight_order: original.weightOrder,
    });
    expect(projected).toEqual({
      weights: { option_1: 0.2, option_2: 0.3, option_3: 0.5 },
      weightOrder: ["option_1", "option_2", "option_3"],
      weightOrderStatus: "valid",
      outcome: { picked: "option_1", roll: 0.1 },
    });
    expect(JSON.stringify(projected)).not.toContain(OPTION_A);
    expect(JSON.stringify(projected)).not.toContain(OPTION_B);
    expect(JSON.stringify(projected)).not.toContain(OPTION_C);
  });

  it("writes the ordered marker automatically with every new reveal", async () => {
    const draw: CommittedDraw = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      kind: "custom",
      serverSeed: "server-seed",
      commitment: "commitment",
      clientSeed: "draw:client-seed",
      nonce: 9,
      weights: { [OPTION_B]: 0.2, [OPTION_A]: 0.8 },
      weightOrder: [OPTION_B, OPTION_A],
      numSlots: 1,
    };

    await revealDraw(draw, { picked: OPTION_B, roll: 0.1 });

    const [, storedJson] = vi.mocked(query).mock.calls[0][1] as [string, string];
    expect(JSON.parse(storedJson)).toEqual({
      picked: OPTION_B,
      roll: 0.1,
      weight_order: [OPTION_B, OPTION_A],
    });
  });

  it("keeps an owner-visible legacy seed partial when the original order is absent", () => {
    const legacy = projectDrawProof(
      { [OPTION_A]: 0.3, [OPTION_B]: 0.7 },
      { picked: OPTION_B, roll: 0.4 },
    );

    expect(legacy.weightOrderStatus).toBe("missing");
    expect(legacy.weightOrder).toBeNull();
    expect(drawOutcomeReplayReason({
      revealed: true,
      hasServerSeed: true,
      weightOrderStatus: legacy.weightOrderStatus,
      clientSeedAvailable: true,
      hasExpectedOutcome: true,
    })).toBe("ordered_weight_contract_missing");
  });

  it("makes every generic verifier require and consume the explicit order", () => {
    const route = source("src/app/api/verify/draw/[id]/route.ts");
    expect(route).toContain("drawOutcomeReplayReason");
    expect(route).toContain("weight_order: proof.weightOrder");

    const page = source("src/app/verify/draw/[id]/page.tsx");
    expect(page).toContain("data.outcome_replay_available && clientSeed !== null && weightOrder !== null");
    expect(page).toContain("pickWeightedInOrder(");
    expect(page).not.toContain("pickWeighted(data.weights");

    const selfAudit = source("src/lib/provable-draw/self-audit.ts");
    expect(selfAudit).toContain("AND outcome ? 'weight_order'");
    expect(selfAudit).toContain("pickWeightedInOrder(row.weights, weightOrder, roll)");

    const standalone = source("public/verify/cambridgetcg-verifier.js");
    expect(standalone).toContain("payload.outcome_replay_available !== false");
    expect(standalone).toContain("pickWeightedInOrder(weights, weightOrder, r)");
  });
});
