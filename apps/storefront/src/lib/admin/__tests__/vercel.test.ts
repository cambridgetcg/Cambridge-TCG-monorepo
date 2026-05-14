import { describe, it, expect } from "vitest";
import { PROJECTS, VercelTokenMissingError, VercelTokenInvalidError } from "../vercel";

describe("admin/vercel — exports and registry shape", () => {
  it("PROJECTS contains exactly the three known Vercel projects", () => {
    expect(PROJECTS).toHaveLength(3);
    const keys = PROJECTS.map((p) => p.key).sort();
    expect(keys).toEqual(["admin", "storefront", "wholesale"]);
  });

  it("each project carries the expected fields", () => {
    for (const p of PROJECTS) {
      expect(typeof p.key).toBe("string");
      expect(typeof p.name).toBe("string");
      expect(p.projectId).toMatch(/^prj_/);
      expect(typeof p.domain).toBe("string");
      expect(p.appPath).toMatch(/^apps\//);
    }
  });

  it("exports the expected runtime functions and values", async () => {
    const mod = await import("../vercel");
    expect(typeof mod.PROJECTS).toBe("object");
    expect(typeof mod.latestProduction).toBe("function");
    expect(typeof mod.deployFromGit).toBe("function");
    expect(typeof mod.probeDomain).toBe("function");
    expect(typeof mod.VercelTokenMissingError).toBe("function");
    expect(typeof mod.VercelTokenInvalidError).toBe("function");
  });

  it("VercelTokenMissingError is an Error subclass with expected message", () => {
    const err = new VercelTokenMissingError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("VERCEL_TOKEN");
  });

  it("VercelTokenInvalidError is an Error subclass with expected message", () => {
    const err = new VercelTokenInvalidError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("VERCEL_TOKEN");
    expect(err.message).toContain("rotated");
  });
});
