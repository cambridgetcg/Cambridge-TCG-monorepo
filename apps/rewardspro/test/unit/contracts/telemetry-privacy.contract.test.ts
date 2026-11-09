import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function appSources(directory = resolve(process.cwd(), "app")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return appSources(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [readFileSync(path, "utf8")] : [];
  });
}

describe("telemetry privacy", () => {
  it("does not ship a Datadog tracer or StatsD client", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    expect(deps).not.toHaveProperty("dd-trace");
    expect(deps).not.toHaveProperty("hot-shots");
    expect(existsSync(resolve(process.cwd(), "app/services/monitoring/datadog.service.ts"))).toBe(false);
    for (const source of appSources()) {
      expect(source).not.toMatch(/from ["'](?:dd-trace|hot-shots)["']/);
      expect(source).not.toMatch(/datadog\.service/);
    }
  });

  it("records no session replay in the browser and scrubs what Sentry sends", () => {
    const client = read("app/entry.client.tsx");

    expect(client).not.toMatch(/Replay/);
    expect(client).not.toMatch(/replaysSessionSampleRate|replaysOnErrorSampleRate/);
    expect(client).toMatch(/beforeSend\([^)]*\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(event\)/);
    expect(client).toMatch(/beforeBreadcrumb\(breadcrumb\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(breadcrumb\)/);
    expect(client).toMatch(/beforeSendTransaction\(event\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(event\)/);
  });

  it("scrubs server-side Sentry events, breadcrumbs and transactions", () => {
    const server = read("app/entry.server.tsx");

    expect(server).toMatch(/beforeSend\([^)]*\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(event\)/);
    expect(server).toMatch(/beforeBreadcrumb\(breadcrumb\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(breadcrumb\)/);
    expect(server).toMatch(/beforeSendTransaction\(event\)\s*\{[\s\S]*?redactSensitiveTelemetryValue\(event\)/);
  });
});

describe("security headers", () => {
  it("are sent on document and data responses from entry.server", () => {
    const server = read("app/entry.server.tsx");

    expect(server).toMatch(/addDocumentResponseHeaders\(request, responseHeaders\);\s*addSecurityHeaders\(responseHeaders\);/);
    expect(server).toMatch(/export function handleDataRequest\([^)]*\)\s*\{\s*addSecurityHeaders\(response\.headers\);/);
  });

  it("leave embedding to Shopify's frame-ancestors policy, with no X-Frame-Options", () => {
    // ALLOW-FROM is not a value browsers honour.
    for (const source of appSources()) {
      expect(source).not.toMatch(/["']X-Frame-Options["']\s*[,:]\s*["']ALLOW/i);
    }
    // Embedded admin responses must not send X-Frame-Options at all.
    for (const path of ["app/root.tsx", "app/entry.server.tsx", "app/utils/security-headers.server.ts"]) {
      expect(read(path)).not.toMatch(/set\(\s*["']X-Frame-Options/i);
    }
  });
});
