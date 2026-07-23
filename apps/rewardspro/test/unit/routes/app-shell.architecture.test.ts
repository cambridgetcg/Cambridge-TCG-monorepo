import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDirectory = resolve(process.cwd(), "app");
const routesDirectory = resolve(appDirectory, "routes");
const rootSource = readFileSync(resolve(appDirectory, "root.tsx"), "utf8");
const shellSource = readFileSync(resolve(routesDirectory, "app.tsx"), "utf8");

describe("RewardsPro application shell", () => {
  it("declares the document language", () => {
    expect(rootSource).toMatch(/<html\b[^>]*\blang=["']en["']/);
  });

  it("loads App Bridge synchronously, only for app routes, and before other scripts", () => {
    expect(rootSource).toContain(
      'requestUrl.pathname === "/app" || requestUrl.pathname.startsWith("/app/")',
    );
    expect(rootSource).toContain("apiKey && shouldLoadAppBridge");

    const appBridgeScriptIndex = rootSource.indexOf(
      'src="https://cdn.shopify.com/shopifycloud/app-bridge.js"',
    );
    const environmentScriptIndex = rootSource.indexOf(
      "dangerouslySetInnerHTML",
    );

    expect(appBridgeScriptIndex).toBeGreaterThan(-1);
    expect(environmentScriptIndex).toBeGreaterThan(-1);
    expect(appBridgeScriptIndex).toBeLessThan(environmentScriptIndex);

    const appBridgeScript = rootSource.slice(
      rootSource.lastIndexOf("<script", appBridgeScriptIndex),
      rootSource.indexOf("/>", appBridgeScriptIndex) + 2,
    );
    expect(appBridgeScript).not.toContain("async");
    expect(appBridgeScript).not.toContain("defer");
  });

  it("owns the single global Frame and uses its native content landmark", () => {
    expect(shellSource.match(/<Frame(?:\s|>)/g) ?? []).toHaveLength(1);
    expect(shellSource.match(/<\/Frame>/g) ?? []).toHaveLength(1);
    expect(shellSource).toContain(
      "useRef<HTMLAnchorElement>(null)",
    );
    expect(shellSource).toMatch(
      /<Frame\b[^>]*\bskipToContentTarget=\{skipToContentTarget\}[^>]*>/,
    );
    expect(shellSource).toMatch(
      /<a\b[^>]*\bref=\{skipToContentTarget\}[^>]*\bid=["']main-content["'][^>]*\btabIndex=\{-1\}[^>]*\/>/,
    );
    expect(shellSource).not.toMatch(/<main(?:\s|>)/);
    expect(shellSource).not.toContain("rewardspro-skip-link");
  });

  it("keeps shell spacing local and does not load unused App Home assets", () => {
    expect(shellSource).not.toContain("shopifycloud/app-home");
    expect(shellSource).not.toContain(".Polaris-Frame__Content");
    expect(shellSource).not.toMatch(/\.Polaris-Page\s*{/);
    expect(shellSource).not.toContain("!important");
    expect(shellSource).toContain("env(safe-area-inset-bottom, 0px)");
  });

  it("prohibits route-level Polaris Frames", () => {
    const violations = readdirSync(routesDirectory)
      .filter(
        (fileName) =>
          fileName.startsWith("app.") &&
          fileName.endsWith(".tsx") &&
          fileName !== "app.tsx",
      )
      .filter((fileName) => {
        const source = readFileSync(resolve(routesDirectory, fileName), "utf8");
        const importsPolarisFrame =
          /import\s*\{[\s\S]*?\bFrame\b[\s\S]*?\}\s*from\s*["']@shopify\/polaris["']/.test(
            source,
          );
        const rendersFrame = /<\/?Frame(?:\s|>)/.test(source);

        return importsPolarisFrame || rendersFrame;
      });

    expect(violations).toEqual([]);
  });
});
