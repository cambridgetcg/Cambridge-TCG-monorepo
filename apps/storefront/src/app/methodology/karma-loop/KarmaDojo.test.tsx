import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import KarmaDojo from "./KarmaDojo";
import KarmaDojoIsland from "./KarmaDojoIsland";
import {
  KARMA_DOJO_SCENARIOS,
  replayKarmaDojoScenario,
  type KarmaDojoScenarioId,
} from "./karma-dojo";

const EXPECTED: Readonly<Record<KarmaDojoScenarioId, {
  state: "evaluated" | "evidence-invalid";
  proposed: "observe" | "friction" | "isolate" | "deny";
  accepted: number;
  ignored: number;
}>> = {
  "quiet-lane": { state: "evaluated", proposed: "observe", accepted: 0, ignored: 0 },
  "listing-burst": { state: "evaluated", proposed: "friction", accepted: 1, ignored: 0 },
  "linked-counterparty-claim": { state: "evaluated", proposed: "isolate", accepted: 1, ignored: 0 },
  "processor-dispute-claim": { state: "evaluated", proposed: "deny", accepted: 1, ignored: 0 },
  "unknown-critical-claim": { state: "evaluated", proposed: "observe", accepted: 0, ignored: 1 },
  "wrong-purpose-claim": { state: "evaluated", proposed: "observe", accepted: 0, ignored: 1 },
  "severity-mismatch": { state: "evidence-invalid", proposed: "isolate", accepted: 0, ignored: 0 },
  "truncated-feed": { state: "evidence-invalid", proposed: "isolate", accepted: 0, ignored: 0 },
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("KARMA Dojo", () => {
  it("runs the complete fixed scenario matrix through the observe-only evaluator", () => {
    for (const fixture of KARMA_DOJO_SCENARIOS) {
      const { decision } = replayKarmaDojoScenario(fixture.id);
      const expected = EXPECTED[fixture.id];

      expect(decision).toMatchObject({
        state: expected.state,
        proposed_response: expected.proposed,
        effective_response: "observe",
        evidence_count: expected.accepted,
        ignored_evidence_count: expected.ignored,
        effects: {
          changes_account_state: false,
          changes_trade_state: false,
          changes_escrow_state: false,
          moves_or_holds_money: false,
          contacts_or_attacks_external_systems: false,
          publishes_identity_or_reputation: false,
        },
      });
    }
  });

  it("uses an explicit fixture clock and never touches the network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const baseline = replayKarmaDojoScenario("listing-burst");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-01-01T00:00:00.000Z"));
    const underFutureSystemClock = replayKarmaDojoScenario("listing-burst");

    expect(underFutureSystemClock).toEqual(baseline);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders an accessible selector and a visible false-effect ledger", () => {
    const html = renderToStaticMarkup(<KarmaDojo />);

    expect(html).toContain("<fieldset");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain("aria-live=\"polite\"");
    expect(html).toContain("Policy proposes");
    expect(html).toContain("Current effective response");
    expect(html).toContain("Synthetic local replay");
    expect(html).toContain("A result is a policy replay, not a verdict.");
    expect(html.match(/>false</g)).toHaveLength(6);
    expect(html).not.toMatch(/safe|trusted|fraudster|legitimate|cleared/i);
  });

  it("does not run or render the evaluator during server prerender", () => {
    const html = renderToStaticMarkup(<KarmaDojoIsland />);

    expect(html).toContain("wakes after browser hydration");
    expect(html).toContain("No policy replay runs during server rendering.");
    expect(html).not.toContain("Policy proposes");
    expect(html).not.toContain("Replay result");
  });

  it("keeps the complete client source graph free of server, API, and storage seams", () => {
    const clientSources = [
      new URL("./KarmaDojo.tsx", import.meta.url),
      new URL("./KarmaDojoIsland.tsx", import.meta.url),
      new URL("./karma-dojo.ts", import.meta.url),
      new URL("../../../lib/cashloom/karma.ts", import.meta.url),
      new URL("../../../lib/cashloom/canonical.ts", import.meta.url),
    ].map((url) => readFileSync(url, "utf8")).join("\n");

    expect(clientSources).not.toMatch(/from\s+["']node:|require\(["']node:/);
    expect(clientSources).not.toMatch(/fetch\s*\(|localStorage|sessionStorage|document\.cookie/);
    expect(clientSources).not.toMatch(/["']server-only["']|\/api\//);
  });
});
