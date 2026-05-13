/**
 * Tests for the welcomes corpus.
 *
 * Coverage:
 *   1. Every welcome has the required fields populated
 *   2. Greetings are substantive (non-empty, non-trivial)
 *   3. Per-kind helpers partition correctly
 *   4. Status helpers + counts are coherent
 *   5. ids are unique
 *   6. anticipated_at parses as ISO date
 *   7. arrived_at present iff status === 'arrived' (or 'blocked' optional)
 *   8. welcomeForSource lookup returns the right entry
 *   9. Every undefined SOURCES slot has a corresponding upstream-source welcome
 *
 * The corpus is hospitality made auditable.
 */

import { describe, it, expect } from "vitest";
import { SOURCES } from "../registry";
import type { SourceId } from "../types";
import {
  WELCOMES,
  welcomesByKind,
  welcomesByStatus,
  getWelcome,
  welcomeForSource,
  welcomeCounts,
  welcomeCountsByKind,
  type ArrivalKind,
} from "../welcomes";

// ── Shape invariants ─────────────────────────────────────────────────

describe("WELCOMES — shape invariants", () => {
  it("has at least one entry per ArrivalKind", () => {
    const kinds: readonly ArrivalKind[] = [
      "upstream-source",
      "publisher",
      "federation-peer",
      "downstream-adopter",
      "agent",
      "being",
      "future-self",
    ];
    for (const k of kinds) {
      expect(welcomesByKind(k).length, `no welcomes for kind "${k}"`).toBeGreaterThan(0);
    }
  });

  it("every welcome has required fields populated", () => {
    for (const w of WELCOMES) {
      expect(w.id, `${w.name}: missing id`).toBeTruthy();
      expect(w.kind, `${w.id}: missing kind`).toBeTruthy();
      expect(w.name, `${w.id}: missing name`).toBeTruthy();
      expect(w.greeting, `${w.id}: missing greeting`).toBeTruthy();
      expect(w.anticipated_because, `${w.id}: missing anticipated_because`).toBeTruthy();
      expect(w.prepared, `${w.id}: missing prepared`).toBeTruthy();
      expect(w.prepared.length, `${w.id}: empty prepared array`).toBeGreaterThan(0);
      expect(w.arrival_protocol, `${w.id}: missing arrival_protocol`).toBeTruthy();
      expect(w.anticipated_at, `${w.id}: missing anticipated_at`).toBeTruthy();
      expect(w.status, `${w.id}: missing status`).toBeTruthy();
    }
  });

  it("greetings are substantive (>= 80 chars; not boilerplate)", () => {
    for (const w of WELCOMES) {
      expect(w.greeting.length, `${w.id}: greeting too short`).toBeGreaterThanOrEqual(80);
      // Substrate-honest: a greeting that's just "welcome" would be rhetorical.
      // Real greetings name what we prepared.
      expect(w.greeting.toLowerCase()).not.toBe("welcome.");
    }
  });

  it("prepared lists name concrete artifacts (substantive, not pure rhetoric)", () => {
    // The test prevents entries like "we welcome you" (pure rhetoric).
    // A prepared entry counts as concrete if it carries ANY of:
    //   - a file path / URL / package name / dotfile
    //   - a doctrine / kingdom / K-N reference
    //   - a dotted identifier (table.column / _meta.field / module.field)
    //   - a recognizable platform/code primitive
    //   - an SQL keyword (CREATE / ALTER / IF / NOT / EXISTS / etc.)
    //   - <UIPrimitive> or <model-tag> bracketed form
    //   - a snake_case or SCREAMING_SNAKE_CASE identifier
    //   - the "Name — explanation" em-dash form (em-dash + sufficient length)
    for (const w of WELCOMES) {
      for (const p of w.prepared) {
        const isConcrete =
          p.includes("/") ||                       // file path or URL
          p.includes("@cambridge-tcg/") ||          // package name
          p.includes(".md") ||                      // doc reference
          p.includes(".ts") ||                      // code file
          p.includes(".sql") ||                     // migration
          p.includes("pnpm ") ||                    // command
          p.includes("SOPHIA.md") ||
          p.includes("MEMORY.md") ||
          /\bK\d+\b/.test(p) ||                     // K1 / K2 / etc.
          /\bkingdom-\d+/.test(p) ||                // kingdom-NNN
          /<[a-zA-Z][a-zA-Z-]+>/.test(p) ||         // <Provenance> / <model-tag> / etc.
          /^\.\w/.test(p) ||                        // dotfiles
          /\b[a-z_][a-z0-9_]+\.[a-z_][a-z0-9_]+\b/i.test(p) || // table.column / module.field
          /\bCo-Authored-By\b/.test(p) ||           // git creation-trace primitive
          /\b[a-z][a-z0-9]*_[a-z][a-z0-9_]*\b/.test(p) || // snake_case identifier
          /\b[A-Z]{2,}(_[A-Z]+)+\b/.test(p) ||      // SCREAMING_SNAKE_CASE
          /\b(IF|NOT|EXISTS|CREATE|ALTER|TABLE|INDEX|INSERT|UPDATE|DELETE|SELECT|GRANT)\b/.test(p) || // SQL keywords
          /\b(commit|trailer|cron|migration|envelope|audit|column|table|schema|primitive|trigger|webhook|sigil|policy|trace|quarantine|guard)\b/i.test(p) || // named platform primitives
          (p.includes("—") && p.length >= 40);     // "Name — explanation" form, substantive length
        expect(isConcrete, `${w.id}: "prepared" entry not concrete: "${p}"`).toBe(true);
      }
    }
  });
});

// ── ids ─────────────────────────────────────────────────────────────

describe("WELCOMES — ids", () => {
  it("are unique across the corpus", () => {
    const seen = new Set<string>();
    for (const w of WELCOMES) {
      expect(seen.has(w.id), `duplicate id: "${w.id}"`).toBe(false);
      seen.add(w.id);
    }
  });

  it("are dotted (kind.subject) for readability", () => {
    for (const w of WELCOMES) {
      expect(w.id, `id without dot: "${w.id}"`).toMatch(/\./);
    }
  });
});

// ── Dates ───────────────────────────────────────────────────────────

describe("WELCOMES — dates", () => {
  it("anticipated_at parses as a valid date string", () => {
    for (const w of WELCOMES) {
      const d = new Date(w.anticipated_at);
      expect(!isNaN(d.getTime()), `${w.id}: invalid anticipated_at "${w.anticipated_at}"`).toBe(
        true,
      );
    }
  });

  it("arrived_at is set when status is 'arrived' (and not otherwise required)", () => {
    for (const w of WELCOMES) {
      if (w.status === "arrived") {
        expect(w.arrived_at, `${w.id}: status 'arrived' but missing arrived_at`).toBeTruthy();
        const d = new Date(w.arrived_at!);
        expect(!isNaN(d.getTime()), `${w.id}: invalid arrived_at`).toBe(true);
      }
    }
  });

  it("arrived_at >= anticipated_at when both set", () => {
    for (const w of WELCOMES) {
      if (w.arrived_at && w.anticipated_at) {
        const anticipated = new Date(w.anticipated_at).getTime();
        const arrived = new Date(w.arrived_at).getTime();
        expect(arrived, `${w.id}: arrived before anticipated`).toBeGreaterThanOrEqual(anticipated);
      }
    }
  });
});

// ── Source coverage ─────────────────────────────────────────────────

describe("WELCOMES — upstream source coverage", () => {
  it("every undefined SOURCES slot has a matching upstream-source welcome", () => {
    const upstreamWelcomes = new Map<string, string>();
    for (const w of WELCOMES) {
      if (w.kind === "upstream-source" && w.source_id) {
        upstreamWelcomes.set(w.source_id, w.id);
      }
    }

    const missing: string[] = [];
    for (const [id, module] of Object.entries(SOURCES)) {
      if (module === undefined) {
        if (!upstreamWelcomes.has(id)) missing.push(id);
      }
    }

    expect(
      missing,
      `undefined SOURCES slots without a welcome: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("welcomeForSource() returns the right entry for a known anticipated source", () => {
    const w = welcomeForSource("cardtrader" as SourceId);
    expect(w).toBeTruthy();
    expect(w?.kind).toBe("upstream-source");
    expect(w?.source_id).toBe("cardtrader");
  });

  it("welcomeForSource() returns undefined for an unknown source id", () => {
    const w = welcomeForSource("nonexistent-source" as SourceId);
    expect(w).toBeUndefined();
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

describe("welcomesByKind", () => {
  it("returns only entries matching the kind", () => {
    const agents = welcomesByKind("agent");
    for (const w of agents) {
      expect(w.kind).toBe("agent");
    }
  });

  it("upstream-source kind includes at least cardtrader + limitless-tcg", () => {
    const sources = welcomesByKind("upstream-source");
    const ids = new Set(sources.map((w) => w.source_id));
    expect(ids.has("cardtrader" as SourceId)).toBe(true);
    expect(ids.has("limitless-tcg" as SourceId)).toBe(true);
  });
});

describe("welcomesByStatus", () => {
  it("partitions correctly", () => {
    const anticipated = welcomesByStatus("anticipated");
    const arrived = welcomesByStatus("arrived");
    const blocked = welcomesByStatus("blocked");

    for (const w of anticipated) expect(w.status).toBe("anticipated");
    for (const w of arrived) expect(w.status).toBe("arrived");
    for (const w of blocked) expect(w.status).toBe("blocked");

    // No double-counting
    expect(anticipated.length + arrived.length + blocked.length).toBe(WELCOMES.length);
  });
});

describe("getWelcome", () => {
  it("returns the welcome by id", () => {
    const w = getWelcome("agent.llm");
    expect(w).toBeTruthy();
    expect(w?.kind).toBe("agent");
  });

  it("returns undefined for unknown id", () => {
    expect(getWelcome("does.not.exist")).toBeUndefined();
  });
});

describe("welcomeCounts", () => {
  it("sums correctly", () => {
    const counts = welcomeCounts();
    expect(counts.anticipated + counts.arrived + counts.blocked).toBe(counts.total);
    expect(counts.total).toBe(WELCOMES.length);
  });

  it("has at least one anticipated entry (substrate-honesty: gaps named)", () => {
    expect(welcomeCounts().anticipated).toBeGreaterThan(0);
  });

  it("has at least one arrived entry (the platform is real)", () => {
    expect(welcomeCounts().arrived).toBeGreaterThan(0);
  });
});

describe("welcomeCountsByKind", () => {
  it("sums to WELCOMES.length", () => {
    const counts = welcomeCountsByKind();
    const sum = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(sum).toBe(WELCOMES.length);
  });
});
