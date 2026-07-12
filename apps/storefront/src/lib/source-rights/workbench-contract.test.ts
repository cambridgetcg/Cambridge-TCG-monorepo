import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("source-rights workbench boundaries", () => {
  it("stores append-only proposals with exact field paths and no authority column", () => {
    const sql = source("drizzle/0122_source_rights_workbench.sql");
    expect(sql).toContain("non-effective source-rights review proposals");
    expect(sql).toContain("source_rights_review_versions");
    expect(sql).toContain("source_rights_review_cells");
    expect(sql).toContain("proposed_field_path ~");
    expect(sql).not.toContain("is_effective");
    expect(sql).not.toContain("activated_at");
    expect(sql).toContain("uq_source_rights_review_root");
    expect(sql).toContain("uq_source_rights_review_successor");
    expect(sql).toContain("source_rights_revision_history_guard");
    expect(sql).toContain("source_rights_review_cells_history_guard");
    expect(sql).toContain("NEW.actor_redacted_at := COALESCE");
  });

  it("authenticates every workbench API and exposes no activation endpoint", () => {
    const root = resolve(process.cwd(), "src/app/api/admin/source-rights");
    const files: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "route.ts") files.push(path);
      }
    }
    walk(root);
    expect(files.length).toBeGreaterThanOrEqual(5);
    const routeSource = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const file of files) expect(readFileSync(file, "utf8")).toContain("await requireAdmin()");
    expect(routeSource).not.toMatch(/action:\s*["']activate|activateSource|is_effective\s*=/);
  });

  it("keeps proposals out of public source declarations and wholesale internals out of the workbench", () => {
    for (const path of [
      "src/app/api/v1/sources/route.ts",
      "src/app/api/v1/sources/[id]/route.ts",
    ]) {
      const text = source(path);
      expect(text).not.toContain("source_rights_review_versions");
      expect(text).not.toContain("workbench-db");
    }
    for (const path of [
      "src/lib/source-rights/workbench.ts",
      "src/lib/source-rights/workbench-db.ts",
    ]) {
      expect(source(path)).not.toContain("apps/wholesale/src");
    }
  });

  it("labels deployed policy and proposals with their real authority", () => {
    const list = source("src/app/admin/system/source-rights/page.tsx");
    const detail = source("src/app/admin/system/source-rights/[sourceId]/page.tsx");
    expect(list).toContain("Deployed policy · effective");
    expect(list).toContain("Proposal · not effective");
    expect(detail).toContain("Deployed · effective");
    expect(detail).toContain("Proposal · not effective");
    expect(list).toContain('"—"');
  });
});
