import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The stack the plan pins. React Router 7.18.3 broke actions and 8 is not
 * used; Prisma stays on 6.19.3, not the 8 release candidate; Polaris 2
 * loads its own font, so the app loads none.
 */

const APP = resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(resolve(APP, file), "utf8");

type PackageJson = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  engines: { node: string };
};

describe("apps/rewards stack", () => {
  it("pins the versions the plan names", () => {
    const pkg = JSON.parse(read("package.json")) as PackageJson;
    const deps = pkg.dependencies;
    const all = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(deps["react-router"]).toBe("7.18.2");
    for (const p of ["@react-router/dev", "@react-router/node", "@react-router/serve", "@react-router/fs-routes"]) {
      expect(all[p]).toBe("7.18.2");
    }
    expect(deps["@shopify/shopify-app-react-router"]).toMatch(/^\^4\./);
    expect(deps["@prisma/client"]).toBe("6.19.3");
    expect(all["prisma"]).toBe("6.19.3");
    expect(deps["react"]).toMatch(/^\^19\./);
    expect(all["@shopify/polaris-types"]).toMatch(/^\^2\./);
    expect(pkg.engines.node).toBe("24.x");
  });

  it("builds for Vercel in lhr1 with the React Router preset", () => {
    expect(JSON.parse(read("vercel.json"))).toMatchObject({ framework: "react-router", regions: ["lhr1"] });
    expect(read("react-router.config.ts")).toContain("vercelPreset()");
  });

  it("checks production's migrations before the Vercel build, and only there (RP-25)", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

    expect(JSON.parse(read("vercel.json")).buildCommand).toBe("pnpm run check:migrations && pnpm run build");
    expect(pkg.scripts["check:migrations"]).toBe("tsx scripts/check-production-migrations.ts");
    // CI's and local builds stay database-free
    expect(pkg.scripts.build).toBe("prisma generate && react-router build");
  });

  it("never migrates from shopify app dev", () => {
    expect(read("shopify.web.toml")).not.toContain("migrate deploy");
  });

  it("loads no Inter stylesheet", () => {
    expect(read("app/root.tsx")).not.toContain("fonts/inter");
  });
});
