/**
 * Architecture contract.
 *
 * Synthetic tests use hand-crafted file trees to exercise discover /
 * validate / mermaid in isolation. The golden test runs against the
 * real `scripts/` and asserts that every module in the codebase
 * follows the pattern — turning every future module addition into a
 * pattern-compliance check.
 */
import { describe, it, expect } from "vitest";
import {
  discover,
  validate,
  mermaid,
  discoverArchitecture,
} from "../../scripts/architecture";
import type { FileEntry } from "../../scripts/architecture/index";

function tree(...entries: Array<[string, string | null]>): FileEntry[] {
  return entries.map(([relPath, content]) => ({ relPath, content }));
}

describe("discover() — pure builder over synthetic file trees", () => {
  it("treats each top-level directory under scripts/ as a module", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", "export {}\n"],
        ["alpha/README.md", "# alpha"],
        ["beta/index.ts", "export {}\n"],
        ["beta/README.md", "# beta"]
      ),
      testFiles: ["alpha.test.ts", "beta.test.ts"],
    });
    expect(arch.modules.map((m) => m.name)).toEqual(["alpha", "beta"]);
  });

  it("captures hasReadme / hasIndex / hasTest flags", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", "export {}\n"],
        ["alpha/README.md", "# alpha"]
      ),
      testFiles: ["alpha.test.ts"],
    });
    const a = arch.modules[0];
    expect(a.hasIndex).toBe(true);
    expect(a.hasReadme).toBe(true);
    expect(a.hasTest).toBe(true);
  });

  it("flags missing index / readme / test", () => {
    const arch = discover({
      scriptsTree: tree(["alpha/parser.ts", "export {}\n"]),
      testFiles: [],
    });
    const a = arch.modules[0];
    expect(a.hasIndex).toBe(false);
    expect(a.hasReadme).toBe(false);
    expect(a.hasTest).toBe(false);
  });

  it("matches test files by `<module>.` prefix", () => {
    const arch = discover({
      scriptsTree: tree(["alpha/index.ts", "export {}\n"]),
      testFiles: [
        "alpha.test.ts", // ✓
        "alpha.contract.test.ts", // ✓
        "alphabet.test.ts", // ✗ — different module
        "other.test.ts", // ✗
      ],
    });
    expect(arch.modules[0].testFiles).toEqual([
      "alpha.contract.test.ts",
      "alpha.test.ts",
    ]);
  });

  it("parses imports of other modules from `../<name>` paths", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", `import { x } from "../beta";\nimport { y } from "../gamma/types";\n`],
        ["beta/index.ts", "export const x = 1;\n"],
        ["gamma/index.ts", "export const y = 2;\n"]
      ),
      testFiles: [],
    });
    const alpha = arch.modules.find((m) => m.name === "alpha")!;
    expect(alpha.imports).toEqual(["beta", "gamma"]);
  });

  it("ignores non-module imports (`../app`, node:fs, relative `./`)", () => {
    const arch = discover({
      scriptsTree: tree(
        [
          "alpha/index.ts",
          `import * as fs from "node:fs";\nimport { x } from "../../app/utils";\nimport { y } from "./types";\n`,
        ]
      ),
      testFiles: [],
    });
    expect(arch.modules[0].imports).toEqual([]);
  });

  it("skips excluded directories (legacy helpers)", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", "export {}\n"],
        ["alpha/README.md", "# alpha"],
        ["lib/db.mjs", "export const x = 1;\n"] // legacy helper, not a pattern module
      ),
      testFiles: ["alpha.test.ts"],
    });
    expect(arch.modules.map((m) => m.name)).toEqual(["alpha"]);
  });

  it("respects a custom exclusion list", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", "export {}\n"],
        ["beta/index.ts", "export {}\n"]
      ),
      testFiles: [],
      exclude: ["beta"],
    });
    expect(arch.modules.map((m) => m.name)).toEqual(["alpha"]);
  });

  it("computes reverse `importedBy` map", () => {
    const arch = discover({
      scriptsTree: tree(
        ["a/index.ts", `import { x } from "../base";\n`],
        ["b/index.ts", `import { y } from "../base";\n`],
        ["base/index.ts", "export const x = 1; export const y = 2;\n"]
      ),
      testFiles: [],
    });
    expect(arch.importedBy["base"]).toEqual(["a", "b"]);
  });
});

describe("validate() — pattern-compliance checks", () => {
  it("reports nothing when every module has README, index, test, and resolvable imports", () => {
    const arch = discover({
      scriptsTree: tree(
        ["alpha/index.ts", "export {}\n"],
        ["alpha/README.md", "# alpha"]
      ),
      testFiles: ["alpha.test.ts"],
    });
    expect(validate(arch)).toEqual([]);
  });

  it("flags missing README / index / test", () => {
    const arch = discover({
      scriptsTree: tree(["alpha/foo.ts", "export {}\n"]),
      testFiles: [],
    });
    const issues = validate(arch);
    const types = issues.map((i) => i.type).sort();
    expect(types).toEqual(["missing-index", "missing-readme", "missing-test"]);
  });

  it("flags an import to a non-existent module", () => {
    // discover() filters out unknown imports during parsing, so to
    // construct an "unknown-import" case we hand-build the architecture.
    const issues = validate({
      modules: [
        {
          name: "alpha",
          path: "scripts/alpha",
          files: ["index.ts", "README.md"],
          hasReadme: true,
          hasIndex: true,
          hasTest: true,
          testFiles: ["alpha.test.ts"],
          imports: ["does-not-exist"],
        },
      ],
      importedBy: {},
    });
    expect(issues.find((i) => i.type === "unknown-import")?.detail).toContain(
      "does-not-exist"
    );
  });
});

describe("mermaid() — diagram emission", () => {
  it("declares each module as a node, then renders consumer → canonical edges", () => {
    const arch = discover({
      scriptsTree: tree(
        ["a/index.ts", `import { x } from "../base";\n`],
        ["base/index.ts", "export const x = 1;\n"]
      ),
      testFiles: [],
    });
    const out = mermaid(arch);
    expect(out).toContain("graph LR");
    expect(out).toContain('a["a"]');
    expect(out).toContain('base["base"]');
    expect(out).toMatch(/a\s+-->\s+base/);
  });

  it("escapes hyphens in node IDs (Mermaid disallows them unquoted)", () => {
    const arch = discover({
      scriptsTree: tree(
        ["foo-bar/index.ts", `import { x } from "../baz-qux";\n`],
        ["baz-qux/index.ts", "export const x = 1;\n"]
      ),
      testFiles: [],
    });
    const out = mermaid(arch);
    expect(out).toContain("foo_bar"); // hyphen → underscore in ID
    expect(out).toContain("baz_qux");
    // The display label keeps the original name
    expect(out).toContain('"foo-bar"');
  });
});

describe("discoverArchitecture() — golden run against the real codebase", () => {
  const arch = discoverArchitecture();

  it("discovers all 14 modules in the chains", () => {
    // Two chains now share the architecture module:
    //   - Design-system chain (10): rp-registry, claude-design-bridge,
    //     handoff-validator, usage-analyzer, foundation-health,
    //     foundation-baseline, foundation-export, migration-planner,
    //     migration-patcher, architecture
    //   - Rewards chain (4): ledger-contract, ledger-validator,
    //     raffle-contract, raffle-validator
    expect(arch.modules.map((m) => m.name).sort()).toEqual([
      "architecture",
      "claude-design-bridge",
      "foundation-baseline",
      "foundation-export",
      "foundation-health",
      "handoff-validator",
      "ledger-contract",
      "ledger-validator",
      "migration-patcher",
      "migration-planner",
      "raffle-contract",
      "raffle-validator",
      "rp-registry",
      "usage-analyzer",
    ]);
  });

  it("every shipped module follows the pattern (no validation issues)", () => {
    const issues = validate(arch);
    if (issues.length > 0) {
      const detail = issues
        .map((i) => `  [${i.type}] ${i.module}: ${i.detail}`)
        .join("\n");
      throw new Error(`Pattern violations:\n${detail}`);
    }
    expect(issues).toEqual([]);
  });

  it("rp-registry is at the bottom of the stack (no upstream module imports)", () => {
    const reg = arch.modules.find((m) => m.name === "rp-registry")!;
    expect(reg.imports).toEqual([]);
  });

  it("rp-registry is imported by every consumer that touches the foundation", () => {
    expect(arch.importedBy["rp-registry"]).toEqual(
      expect.arrayContaining([
        "claude-design-bridge",
        "foundation-export",
        "foundation-health",
        "handoff-validator",
        "usage-analyzer",
      ])
    );
  });

  it("foundation-health is the composer (imports both validator and analyzer)", () => {
    const health = arch.modules.find((m) => m.name === "foundation-health")!;
    expect(health.imports).toEqual(
      expect.arrayContaining([
        "handoff-validator",
        "usage-analyzer",
        "rp-registry",
      ])
    );
  });

  it("foundation-baseline composes the composer (imports foundation-health)", () => {
    const baseline = arch.modules.find((m) => m.name === "foundation-baseline")!;
    expect(baseline.imports).toContain("foundation-health");
  });

  it("Mermaid output is well-formed and includes every module", () => {
    const out = mermaid(arch);
    expect(out.startsWith("graph LR")).toBe(true);
    for (const m of arch.modules) {
      expect(out).toContain(`"${m.name}"`);
    }
  });
});
